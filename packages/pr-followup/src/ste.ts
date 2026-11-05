import type { DecisionOption } from "./types"

export type SteMode = "procedure" | "description"
export interface SteIssue {
  severity: "error" | "warning"
  message: string
  sentence: string
}

const limits: Record<SteMode, number> = { procedure: 20, description: 25 }

export function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(s => s.trim())
    .filter(Boolean)
}

const wordCount = (s: string) => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length

/**
 * Best-effort checks for a subset of ASD-STE100 rules. It does not check the
 * approved dictionary, so passing is not proof of compliance.
 */
export function lintSte(text: string, mode: SteMode): SteIssue[] {
  const issues: SteIssue[] = []
  const limit = limits[mode]
  for (const sentence of sentences(text)) {
    const words = wordCount(sentence)
    if (words > limit) issues.push({ severity: "error", message: `Use ${limit} words or fewer. This sentence has ${words}.`, sentence })
    if (/\b\w+['’](?:t|s|re|ve|ll|d|m)\b/i.test(sentence) && /['’](?:t|re|ve|ll|d|m)\b/i.test(sentence)) {
      issues.push({ severity: "error", message: "Do not use contractions.", sentence })
    }
    if (/\b(?:e\.g\.|i\.e\.|etc\.?|and\/or|vs\.?)(?=\W|$)/i.test(sentence)) {
      issues.push({ severity: "error", message: "Do not use Latin abbreviations or slashes for choices.", sentence })
    }
    if (/;/.test(sentence)) issues.push({ severity: "error", message: "Do not use semicolons. Write two sentences.", sentence })
    if (/\b(?:is|are|was|were|be|been|being)\s+\w+ed\b/i.test(sentence)) {
      issues.push({ severity: "warning", message: "Possible passive voice. Use the active voice.", sentence })
    }
  }
  return issues
}

export interface DecisionDraft {
  id: string
  title: string
  problem: string
  risk: string
  recommended: string
  options: DecisionOption[]
  recommendedNumber: number
}

export const stateLines = [
  "Automatic changes to this PR are paused.",
  "No fix for this finding has a commit.",
]

export function validateDraft(draft: DecisionDraft): SteIssue[] {
  return [
    ...lintSte(draft.title, "description"),
    ...lintSte(draft.problem, "description"),
    ...lintSte(draft.risk, "description"),
    ...lintSte(draft.recommended, "procedure"),
    ...draft.options.flatMap(o => lintSte(o.label, "procedure")),
  ]
}

export function renderDecision(draft: DecisionDraft): string {
  const options = draft.options.map(o => `${o.number}. ${o.label}${o.number === draft.recommendedNumber ? " (Recommended)" : ""}`)
  return [
    `**Decision ${draft.id}: ${draft.title.replace(/[.!?]+$/, "")}**`,
    "",
    "**Problem**",
    draft.problem.trim(),
    "",
    "**Risk**",
    draft.risk.trim(),
    "",
    "**Recommended action**",
    draft.recommended.trim(),
    "",
    "**Choose one action**",
    ...options,
    "",
    "**How to answer**",
    `Write "${draft.id}" and the number of your choice.`,
    `Example: ${draft.id} ${draft.recommendedNumber}`,
    "",
    "**Current state**",
    ...stateLines,
  ].join("\n")
}
