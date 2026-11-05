export type CommandClass = "force-push" | "merge" | "skip-hooks" | "push" | "commit" | "other"

const segments = (command: string) => command.split(/&&|\|\||;|\||\n/).map(s => s.trim()).filter(Boolean)

function classifySegment(segment: string): CommandClass {
  const s = segment.replace(/^(?:\w+=\S+\s+)+/, "")
  if (/^git(?:\s+-\S+(?:\s+\S+)?)*\s+push\b/.test(s)) {
    return /(?:^|\s)(?:--force\b|--force-with-lease\b|--mirror\b|-f\b|\+\S)/.test(s) ? "force-push" : "push"
  }
  if (/^git(?:\s+-\S+(?:\s+\S+)?)*\s+commit\b/.test(s)) {
    return /(?:^|\s)(?:--no-verify\b|-\w*n\w*\b)/.test(s) ? "skip-hooks" : "commit"
  }
  if (/^gh\s+pr\s+(?:merge|ready)\b/.test(s)) return "merge"
  return "other"
}

const rank: CommandClass[] = ["force-push", "merge", "skip-hooks", "push", "commit", "other"]

export function classifyCommand(command: string): CommandClass {
  const classes = segments(command).map(classifySegment)
  return rank.find(c => classes.includes(c)) ?? "other"
}

export interface GateInput {
  command: string
  openDecisions: number
  /** When false, only open decisions pause commits and pushes. */
  strict?: boolean
}

export interface GateResult {
  effect: "allow" | "deny"
  message?: string
}

export function gate({ command, openDecisions, strict = true }: GateInput): GateResult {
  const kind = classifyCommand(command)
  if (!strict && (kind === "force-push" || kind === "merge" || kind === "skip-hooks")) return { effect: "allow" }
  switch (kind) {
    case "force-push":
      return { effect: "deny", message: "PR follow-up never force-pushes. Ask the user to do this by hand." }
    case "merge":
      return { effect: "deny", message: "PR follow-up never merges or marks a PR ready. A person must do this." }
    case "skip-hooks":
      return { effect: "deny", message: "PR follow-up never skips Git hooks. Fix the hook failure instead." }
    case "push":
    case "commit":
      return openDecisions > 0
        ? { effect: "deny", message: `A user decision is open (${openDecisions}). Automatic changes to this PR are paused until the user answers.` }
        : { effect: "allow" }
    default:
      return { effect: "allow" }
  }
}

export function isCommandAction(action: string): boolean {
  return /bash|shell|command|exec/i.test(action)
}
