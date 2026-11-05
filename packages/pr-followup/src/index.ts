import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { Plugin, Skill } from "@opencode/plugin"
import { gate, isCommandAction } from "./gate"
import { createGitHub } from "./github"
import { Ledger } from "./ledger"
import { FollowupRpc } from "./rpc"
import { defaultPolicy } from "./policy"
import { Service } from "./service"
import { prKey, type PrRecord } from "./types"
import { Watcher } from "./watcher"

const run = promisify(execFile)
const SKILL_URL = new URL("../skills/address-pr-feedback/SKILL.md", import.meta.url)
const STORE_PREFIX = "pr/"
const SETTINGS_KEY = "settings"

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

const TOOL_INPUT = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["register", "status", "findings", "assess", "ask", "check_head", "fixed", "unregister"] },
    pr: { type: "string", description: "owner/repo#123 or a pull request URL" },
    id: { type: "string", description: "Finding id, for example inline:123" },
    ids: { type: "array", items: { type: "string" } },
    assessment: {
      type: "object",
      properties: {
        validity: { type: "string", enum: ["confirmed", "invalid", "already-fixed", "unclear"] },
        severity: { type: "string", enum: ["high", "medium", "low", "unknown"] },
        inScope: { type: "boolean" },
        effort: { type: "string", enum: ["small", "medium", "large"] },
        risk: {
          type: "object",
          properties: {
            publicInterface: { type: "boolean" }, storedData: { type: "boolean" }, accessControl: { type: "boolean" },
            sharedBehavior: { type: "boolean" }, dependency: { type: "boolean" },
          },
          required: ["publicInterface", "storedData", "accessControl", "sharedBehavior", "dependency"],
          additionalProperties: false,
        },
        summary: { type: "string", description: "Evidence from the code. Name the file and line." },
      },
      required: ["validity", "severity", "inScope", "effort", "risk", "summary"],
      additionalProperties: false,
    },
    title: { type: "string" },
    problem: { type: "string" },
    risk: { type: "string" },
    recommended: { type: "string" },
    recommendedNumber: { type: "integer", minimum: 1, maximum: 4 },
    options: {
      type: "array", minItems: 1, maxItems: 3,
      items: {
        type: "object",
        properties: { label: { type: "string" }, kind: { type: "string", enum: ["fix", "investigate"] } },
        required: ["label", "kind"], additionalProperties: false,
      },
    },
    localHead: { type: "string", description: "Output of git rev-parse HEAD before you push" },
    commit: { type: "string", description: "Hash of the pushed fix commit" },
  },
  required: ["action"],
  additionalProperties: false,
} as const

export default Plugin.define({
  id: "pr-followup",
  async setup(ctx) {
    const options = ctx.options as Record<string, unknown>
    const pollMs = clamp(options.pollIntervalSeconds, 30, 86_400, 60) * 1000
    const debounceMs = clamp(options.debounceSeconds, 0, 3600, 120) * 1000
    const policy = { ...defaultPolicy, fixLowSeverity: options.fixLowSeverity !== false }

    const github = createGitHub(async args => (await run("gh", args, { maxBuffer: 32 * 1024 * 1024 })).stdout)
    const save = async (ledger: Ledger) => {
      await ctx.storage.set(STORE_PREFIX + prKey(ledger.record.pr), ledger.record as never)
    }
    const watcher = new Watcher({
      fetch: pr => github.snapshot(pr),
      deliver: async (sessionID, text) => {
        await ctx.session.prompt({ sessionID: sessionID as never, text, delivery: "queue" })
      },
      persist: save,
      now: Date.now,
      debounceMs,
      maxFailures: 10,
    })
    const settings = (await ctx.storage.get(SETTINGS_KEY)) as { enabled?: boolean } | undefined
    const pollSeconds = pollMs / 1000
    let emitChanged = () => {}
    const service = new Service({
      watcher, fetch: pr => github.snapshot(pr), save, policy, pollSeconds,
      enabled: settings?.enabled !== false,
      notify: () => emitChanged(),
    })

    const saved = await ctx.storage.scan({ prefix: STORE_PREFIX, limit: 500 })
    service.hydrate(saved.entries.map(e => e.value as unknown as PrRecord))

    const rpc = await ctx.rpc.register(FollowupRpc, {
      status: async () => service.view(),
      setEnabled: async input => {
        const enabled = (input as { enabled?: unknown } | undefined)?.enabled === true
        service.setEnabled(enabled)
        await ctx.storage.set(SETTINGS_KEY, { enabled })
        return service.view()
      },
    })
    emitChanged = () => void rpc.events.emit("changed", {}).catch(() => {})

    const registrations = [
      rpc,
      await ctx.tool.transform(editor => {
        editor.add({
          name: "pr_followup",
          description:
            "Watch a pull request for review feedback and manage the triage workflow: register, findings, assess, ask, check_head, fixed. Load the address-pr-feedback skill before you use it.",
          input: TOOL_INPUT,
          execute: async (input, context) => ({ content: await service.run(input as Record<string, unknown>, context.sessionID) }),
        })
      }),
      await ctx.session.hook("prompt", async event => {
        const note = await service.recordAnswer(event.sessionID, event.prompt.text)
        if (note) event.prompt.text = `${event.prompt.text}\n\n${note}`
      }),
      await ctx.permission.hook("evaluate", event => {
        if (!isCommandAction(event.action) || !service.ownsPr(event.sessionID)) return
        for (const command of event.resources) {
          const result = gate({ command, openDecisions: service.openDecisionCount(event.sessionID), strict: service.isEnabled() })
          if (result.effect === "deny") {
            event.effect = "deny"
            event.message = result.message
            return
          }
        }
      }),
    ]

    try {
      const raw = await readFile(fileURLToPath(SKILL_URL), "utf8")
      const content = raw.replace(/^---\n[\s\S]*?\n---\n/, "")
      registrations.push(
        await ctx.skill.transform(editor => {
          editor.add({
            id: Skill.ID.make("address-pr-feedback"),
            name: Skill.Name.make("address-pr-feedback"),
            description: "Triage and address review feedback on a pull request opened by the agent. Use after registering a PR with pr_followup or when a [PR Followup] message arrives.",
            path: Skill.Info.fields.path.make(fileURLToPath(SKILL_URL)),
            content,
          })
        }),
      )
    } catch {
      // The tool still works without the bundled skill.
    }

    const timer = setInterval(() => void watcher.tick().then(() => emitChanged(), () => {}), pollMs)
    return async () => {
      clearInterval(timer)
      await Promise.all(registrations.map(r => r.dispose()))
    }
  },
})
