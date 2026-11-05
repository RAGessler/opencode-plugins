export interface PrView {
  pr: string
  head: string
  watching: boolean
  waiting: number
  fixed: number
  skipped: number
  decisions: string[]
}

export interface StatusView {
  enabled: boolean
  pollSeconds: number
  lastPollAt?: number
  lastError?: string
  prs: PrView[]
}

export type Tone = "off" | "idle" | "working" | "attention" | "error" | "offline"

export interface Summary {
  tone: Tone
  label: string
  lines: string[]
}

export const STATUS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    pollSeconds: { type: "number" },
    lastPollAt: { type: "number" },
    lastError: { type: "string" },
    prs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pr: { type: "string" }, head: { type: "string" }, watching: { type: "boolean" },
          waiting: { type: "number" }, fixed: { type: "number" }, skipped: { type: "number" },
          decisions: { type: "array", items: { type: "string" } },
        },
        required: ["pr", "head", "watching", "waiting", "fixed", "skipped", "decisions"],
        additionalProperties: false,
      },
    },
  },
  required: ["enabled", "pollSeconds", "prs"],
  additionalProperties: false,
}

export function parseStatus(input: unknown): StatusView | undefined {
  if (!input || typeof input !== "object") return undefined
  const v = input as Partial<StatusView>
  if (typeof v.enabled !== "boolean" || !Array.isArray(v.prs)) return undefined
  return v as StatusView
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function summarize(view: StatusView | undefined): Summary {
  if (!view) return { tone: "offline", label: "unavailable", lines: ["Cannot reach the PR follow-up plugin."] }
  if (!view.enabled) return { tone: "off", label: "off", lines: ["Not watching PRs.", "/followup on to enable"] }

  const decisions = view.prs.flatMap(p => p.decisions)
  const lines = view.prs.flatMap(p => {
    const bits = [p.waiting > 0 ? `${p.waiting} to triage` : undefined, p.decisions.length > 0 ? `${p.decisions.join(", ")} waiting` : undefined].filter(Boolean)
    return [p.pr, `  ${bits.length ? bits.join(" · ") : p.watching ? "quiet" : "not watching"}`]
  })
  if (view.lastError) lines.push(`GitHub error: ${view.lastError}`)
  const footer = "/followup off to disable"

  if (decisions.length > 0) {
    return { tone: "attention", label: "needs you", lines: [`${plural(decisions.length, "decision")} need${decisions.length === 1 ? "s" : ""} your answer.`, ...lines, footer] }
  }
  if (view.lastError) return { tone: "error", label: "error", lines: [...lines, footer] }
  if (view.prs.length === 0) return { tone: "idle", label: "on", lines: ["No PR registered.", footer] }
  const waiting = view.prs.reduce((n, p) => n + p.waiting, 0)
  return waiting > 0
    ? { tone: "working", label: "working", lines: [...lines, footer] }
    : { tone: "idle", label: "watching", lines: [`Watching ${plural(view.prs.filter(p => p.watching).length, "PR")}.`, ...lines, footer] }
}
