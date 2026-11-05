import type { Assessment, Risk, Verdict } from "./types"

export interface PolicyOptions {
  fixLowSeverity: boolean
}

export const defaultPolicy: PolicyOptions = { fixLowSeverity: true }

const riskLabels: Record<keyof Risk, string> = {
  publicInterface: "The fix can change a public interface.",
  storedData: "The fix can change stored data.",
  accessControl: "The fix can change access control.",
  sharedBehavior: "The fix can change shared business behavior.",
  dependency: "The fix can change a dependency.",
}

export function decide(a: Assessment, options: PolicyOptions = defaultPolicy): Verdict {
  if (a.validity === "invalid") return { action: "skip", reasons: ["The finding is not valid."] }
  if (a.validity === "already-fixed") return { action: "skip", reasons: ["The finding is already fixed."] }
  if (!a.inScope) return { action: "skip", reasons: ["The finding is outside the scope of this ticket."] }

  const reasons: string[] = []
  if (a.validity === "unclear") reasons.push("The agent cannot confirm the finding.")
  for (const key of Object.keys(riskLabels) as (keyof Risk)[]) if (a.risk[key]) reasons.push(riskLabels[key])
  if (a.effort === "large") reasons.push("The fix needs a large change or deep investigation.")
  if (reasons.length > 0) return { action: "ask", reasons }

  if (a.severity === "low" && !options.fixLowSeverity) {
    return { action: "skip", reasons: ["The finding has low severity and automatic low-severity fixes are off."] }
  }
  return { action: "fix", reasons: ["The fix is small, in scope, and has no known risk."] }
}
