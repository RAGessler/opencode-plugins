/**
 * Exercise the real installed V2 backend against synthetic history. Every
 * write goes to an isolated temporary HOME/XDG tree, never the user's service.
 * No provider is called and no model charges are incurred.
 */
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { OpenCode } from "@opencode/client"
import type { ExperimentalSessionImportInput } from "@opencode/client"
import { loadCosts } from "../plugin/costs"
import { periodRange } from "../plugin/periods"

const base = join(tmpdir(), "opencode")
await mkdir(base, { recursive: true })
const root = await mkdtemp(join(base, "standup-v2-"))
const workspace = join(root, "workspace")
await mkdir(workspace)
const reservation = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() })
const port = reservation.port!
await reservation.stop(true)
const password = crypto.randomUUID()
const proc = Bun.spawn(["opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: workspace,
  env: {
    PATH: process.env.PATH, HOME: root, TMPDIR: base, TERM: "dumb",
    XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"), XDG_CACHE_HOME: join(root, "cache"),
    OPENCODE_PASSWORD: password,
  },
  stdin: "ignore", stdout: "ignore", stderr: "ignore",
})
const client = OpenCode.make({ baseUrl: `http://127.0.0.1:${port}`, headers: { authorization: `Basic ${btoa(`opencode:${password}`)}` } })

try {
  let healthy = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await client.server.info({ signal: AbortSignal.timeout(500) }); healthy = true; break }
    catch { await Bun.sleep(100) }
  }
  assert(healthy, "Isolated V2 server did not start")
  const seed = await client.session.create({ location: { directory: workspace } })
  const tokens = { input: 10, output: 5, reasoning: 0, cache: { read: 20, write: 0 } }
  const time = (day: string) => new Date(`${day}T12:00:00`).getTime()
  const message = (id: string, cost: number, when: number, model = "model-a") => ({
    id: `msg_${id}`, type: "assistant", agent: "build", model: { id: model, providerID: "test" },
    time: { created: when, completed: when + 1 }, content: [], cost, tokens, finish: "stop",
  })
  const inherited = message("original", 10, time("2026-10-26"))
  const continuing = message("continued", 5, time("2026-11-02"), "model-b")
  async function history(id: string, created: number, messages: ExperimentalSessionImportInput["messages"], parentID?: string) {
    return client.experimental.session.import({
      location: { directory: workspace },
      info: { id: `ses_${id}`, projectID: seed.projectID, parentID, cost: 999, tokens,
        time: { created, updated: created + 1 }, location: { directory: workspace } },
      messages,
    })
  }
  const original = await history("original", time("2026-10-25"), [inherited, continuing])
  // Use real fork operations first. They copy history, not new billable work.
  const actualFork = await client.session.fork({ sessionID: original.id })
  const nestedFork = await client.session.fork({ sessionID: actualFork.id })
  const range = periodRange({ period: "sprint" }, { anchor: "2026-10-26", days: 14 }, new Date("2026-11-04T12:00:00"))
  assert.equal((await loadCosts(client, range)).total, 15, "Forking copied history inflated spend")
  // Synthetic paid work in each real fork's child family, using globally
  // unique message IDs (V2 message projections are not session-local IDs).
  await history("fork-work", time("2026-10-28"), [message("fork-new", 2, time("2026-10-29"))], actualFork.id)
  await history("nested-work", time("2026-10-30"), [message("nested-new", 3, time("2026-11-03"))], nestedFork.id)
  const subagent = await history("subagent", time("2026-11-02"), [message("subagent", 4, time("2026-11-02"))], original.id)
  await client.session.update({ sessionID: subagent.id, archived: true })
  const result = await loadCosts(client, range)
  assert.equal(result.total, 24, "Expected original 10 + continued 5 + fork 2 + nested 3 + subagent 4")
  assert.equal(result.models.reduce((sum, row) => sum + row.cost, 0), 24)
  assert.equal(result.projects.reduce((sum, row) => sum + row.cost, 0), 24)
  const november = periodRange({ period: "custom", from: "2026-11-02", to: "2026-11-03" }, { anchor: "2026-10-26", days: 14 })
  assert.equal((await loadCosts(client, november)).total, 12, "Old sessions must attribute new usage to the day of the call")
  assert.equal((await loadCosts(client, range)).total, 24, "Refreshing doubled costs")
  const allTime = periodRange({ period: "all" }, { anchor: "2026-10-26", days: 14 })
  assert.equal(allTime.from, undefined)
  assert.equal((await loadCosts(client, allTime)).total, 24, "All-time omitted or misapplied its lower bound")
  console.log("PASS: real V2 forks, nested forks, subagents, archived usage, model attribution, date ranges, and refreshes")
} finally {
  proc.kill("SIGTERM")
  await proc.exited
  await rm(root, { recursive: true, force: true })
}
