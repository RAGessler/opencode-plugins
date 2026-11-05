export type Severity = "high" | "medium" | "low" | "unknown"
export type Source = "copilot" | "bot" | "human"

export interface PrRef {
  owner: string
  repo: string
  number: number
}

export interface Finding {
  id: string
  kind: "inline" | "conversation" | "review"
  source: Source
  author: string
  severity: Severity
  path?: string
  line?: number
  body: string
  url: string
  updatedAt: string
}

export interface Snapshot {
  head: string
  state: "open" | "closed" | "merged"
  findings: Finding[]
}

export interface Risk {
  publicInterface: boolean
  storedData: boolean
  accessControl: boolean
  sharedBehavior: boolean
  dependency: boolean
}

export interface Assessment {
  validity: "confirmed" | "invalid" | "already-fixed" | "unclear"
  severity: Severity
  inScope: boolean
  effort: "small" | "medium" | "large"
  risk: Risk
  summary: string
}

export type Verdict = { action: "fix" | "skip" | "ask"; reasons: string[] }

export interface DecisionOption {
  number: number
  label: string
  kind: "fix" | "investigate" | "leave"
}

export interface Decision {
  id: string
  findingId: string
  text: string
  options: DecisionOption[]
  recommended: number
  status: "open" | "answered" | "withdrawn"
  answer?: number
}

export type EntryStatus = "new" | "assessed" | "blocked" | "approved" | "fixed" | "skipped"

export interface Entry {
  finding: Finding
  revision: string
  status: EntryStatus
  assessment?: Assessment
  verdict?: Verdict
  decisionId?: string
  commit?: string
  note?: string
}

export interface PrRecord {
  pr: PrRef
  sessionID: string
  head: string
  state: Snapshot["state"]
  entries: Record<string, Entry>
  decisions: Decision[]
  nextDecision: number
}

export const prKey = (pr: PrRef) => `${pr.owner}/${pr.repo}#${pr.number}`
