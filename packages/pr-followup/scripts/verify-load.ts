/**
 * Start a private OpenCode V2 server with this plugin configured, under an
 * isolated temporary HOME/XDG tree. Confirms that the plugin, skill, and tool
 * load. No provider is called.
 */
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { OpenCode } from "@opencode/client"
import { FollowupRpc } from "../src/rpc"
import { parseStatus } from "../src/view"

const pluginDir = resolve(import.meta.dir, "..")
const base = join(tmpdir(), "opencode")
await mkdir(base, { recursive: true })
const root = await mkdtemp(join(base, "pr-followup-"))
const workspace = join(root, "workspace")
await mkdir(workspace)
await writeFile(join(workspace, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [pluginDir] }))

const password = crypto.randomUUID()
const env = {
  PATH: process.env.PATH, HOME: root, TMPDIR: base, TERM: "dumb",
  XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
  XDG_STATE_HOME: join(root, "state"), XDG_CACHE_HOME: join(root, "cache"),
  OPENCODE_PASSWORD: password,
}
async function start() {
  const reservation = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() })
  const port = reservation.port!
  await reservation.stop(true)
  const proc = Bun.spawn(["opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: workspace, env, stdin: "ignore", stdout: "ignore", stderr: "ignore" })
  const client = OpenCode.make({ baseUrl: `http://127.0.0.1:${port}`, headers: { authorization: `Basic ${btoa(`opencode:${password}`)}` } })
  let healthy = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await client.server.info({ signal: AbortSignal.timeout(500) }); healthy = true; break }
    catch { await Bun.sleep(100) }
  }
  assert(healthy, "Isolated V2 server did not start")
  return { proc, client }
}
let { proc, client } = await start()
const location = { directory: workspace }

try {
  const find = async <T extends { id?: string }>(list: () => Promise<{ data: readonly T[] }>, id: string) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      const found = (await list()).data.find(item => item.id === id)
      if (found) return found
      await Bun.sleep(200)
    }
    return undefined
  }

  const plugin = await find(() => client.plugin.list({ location }), "pr-followup")
  assert(plugin, "Plugin pr-followup did not load")
  assert.equal((plugin as { state?: { status?: string } }).state?.status, "active", `Plugin state: ${JSON.stringify(plugin)}`)
  const skill = await find(() => client.skill.list({ location }), "address-pr-feedback")
  assert(skill, "Skill address-pr-feedback did not register")
  console.log("OK: plugin is active and the skill is registered")

  const rpc = client.rpc(FollowupRpc)
  const call = { location }
  const first = parseStatus(await rpc.status({}, call))
  assert(first?.enabled === true && first.prs.length === 0, `Unexpected initial status: ${JSON.stringify(first)}`)
  const off = parseStatus(await rpc.setEnabled({ enabled: false }, call))
  assert.equal(off?.enabled, false)
  assert.equal(parseStatus(await rpc.status({}, call))?.enabled, false)
  const on = parseStatus(await rpc.setEnabled({ enabled: true }, call))
  assert.equal(on?.enabled, true)
  console.log("OK: status, disable, and enable work over RPC")

  await rpc.setEnabled({ enabled: false }, call)
  proc.kill()
  await proc.exited
  ;({ proc, client } = await start())
  const again = client.rpc(FollowupRpc)
  let restored
  for (let attempt = 0; attempt < 100 && !restored; attempt++) {
    try { restored = parseStatus(await again.status({}, call)) } catch { await Bun.sleep(200) }
  }
  assert.equal(restored?.enabled, false, "The off setting did not survive a restart")
  console.log("OK: the off setting survives a server restart")

  const tui = (await import("../src/tui")).default as { id?: string }
  assert.equal(tui.id, "pr-followup.tui")
  console.log("OK: TUI part loads")
} finally {
  proc.kill()
  await proc.exited
  await rm(root, { recursive: true, force: true })
}
