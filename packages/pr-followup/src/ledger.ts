import { decide, defaultPolicy, type PolicyOptions } from "./policy"
import { renderDecision, validateDraft } from "./ste"
import type { Assessment, Decision, DecisionOption, Entry, Finding, PrRecord, PrRef, Snapshot, Verdict } from "./types"

export class LedgerError extends Error {}

export interface AskRequest {
  title: string
  problem: string
  risk: string
  recommended: string
  options: { label: string; kind: "fix" | "investigate" }[]
  recommendedNumber: number
}

export interface IngestResult {
  added: Entry[]
  changed: Entry[]
}

const revisionOf = (f: Finding) => `${f.updatedAt}|${f.body.length}|${hash(f.body)}`

function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export const LEAVE_LABEL = "Leave the code unchanged."

export function parseAnswer(text: string): { decisionId: string; option: number } | undefined {
  const m = /\bD-(\d+)(?:\s*[:\-]\s*|\s+)(?:option\s*)?([1-9])\b/i.exec(text)
  return m ? { decisionId: `D-${m[1]}`, option: Number(m[2]) } : undefined
}

export class Ledger {
  constructor(readonly record: PrRecord, private readonly policy: PolicyOptions = defaultPolicy) {}

  static create(pr: PrRef, sessionID: string, policy?: PolicyOptions): Ledger {
    return new Ledger({ pr, sessionID, head: "", state: "open", entries: {}, decisions: [], nextDecision: 1 }, policy)
  }

  entry(id: string): Entry {
    const e = this.record.entries[id]
    if (!e) throw new LedgerError(`Unknown finding ${id}.`)
    return e
  }

  ingest(snapshot: Snapshot): IngestResult {
    const result: IngestResult = { added: [], changed: [] }
    this.record.head = snapshot.head
    this.record.state = snapshot.state
    for (const finding of snapshot.findings) {
      const revision = revisionOf(finding)
      const existing = this.record.entries[finding.id]
      if (!existing) {
        const entry: Entry = { finding, revision, status: "new" }
        this.record.entries[finding.id] = entry
        result.added.push(entry)
      } else if (existing.revision !== revision) {
        this.withdraw(existing)
        Object.assign(existing, { finding, revision, status: "new", assessment: undefined, verdict: undefined, note: "The reviewer edited this finding." })
        result.changed.push(existing)
      }
    }
    return result
  }

  private withdraw(entry: Entry) {
    const decision = this.record.decisions.find(d => d.id === entry.decisionId && d.status === "open")
    if (decision) decision.status = "withdrawn"
    entry.decisionId = undefined
  }

  assess(id: string, assessment: Assessment): Verdict {
    const entry = this.entry(id)
    if (entry.status === "blocked") throw new LedgerError(`Finding ${id} waits for a user decision.`)
    if (!assessment.summary.trim()) throw new LedgerError("The assessment needs a summary with evidence.")
    const verdict = decide(assessment, this.policy)
    entry.assessment = assessment
    entry.verdict = verdict
    entry.status = verdict.action === "skip" ? "skipped" : "assessed"
    if (verdict.action === "skip") entry.note = assessment.summary
    return verdict
  }

  ask(id: string, request: AskRequest): Decision {
    const entry = this.entry(id)
    if (entry.verdict?.action !== "ask" || entry.status !== "assessed") {
      throw new LedgerError(`Finding ${id} does not need a decision. Assess it first.`)
    }
    if (request.options.length < 1 || request.options.length > 3) throw new LedgerError("Give 1 to 3 options. The plugin adds the final leave option.")
    const options: DecisionOption[] = [
      ...request.options.map((o, i) => ({ number: i + 1, label: o.label, kind: o.kind })),
      { number: request.options.length + 1, label: LEAVE_LABEL, kind: "leave" as const },
    ]
    if (!Number.isInteger(request.recommendedNumber) || request.recommendedNumber < 1 || request.recommendedNumber > options.length) {
      throw new LedgerError("recommendedNumber must match one option.")
    }
    const draft = { id: `D-${this.record.nextDecision}`, title: request.title, problem: request.problem, risk: request.risk, recommended: request.recommended, options, recommendedNumber: request.recommendedNumber }
    const errors = validateDraft(draft).filter(i => i.severity === "error")
    if (errors.length > 0) {
      throw new LedgerError("Rewrite the decision in simpler English:\n" + errors.map(e => `- "${e.sentence}": ${e.message}`).join("\n"))
    }
    this.record.nextDecision++
    const decision: Decision = { id: draft.id, findingId: id, text: renderDecision(draft), options, recommended: request.recommendedNumber, status: "open" }
    this.record.decisions.push(decision)
    entry.status = "blocked"
    entry.decisionId = decision.id
    return decision
  }

  /** Called only for real user prompts. Returns the finding it resolved, if any. */
  answer(decisionId: string, option: number): Entry | undefined {
    const decision = this.record.decisions.find(d => d.id === decisionId)
    if (!decision || decision.status !== "open") return undefined
    const chosen = decision.options.find(o => o.number === option)
    if (!chosen) return undefined
    decision.status = "answered"
    decision.answer = option
    const entry = this.entry(decision.findingId)
    if (chosen.kind === "fix") {
      entry.status = "approved"
      entry.note = `The user approved: ${chosen.label}`
    } else if (chosen.kind === "investigate") {
      entry.status = "new"
      entry.verdict = undefined
      entry.note = `The user asked for this check: ${chosen.label}`
    } else {
      entry.status = "skipped"
      entry.note = "The user chose to leave the code unchanged."
    }
    return entry
  }

  recordFix(id: string, commit: string): Entry {
    const entry = this.entry(id)
    if (entry.status !== "approved" && !(entry.status === "assessed" && entry.verdict?.action === "fix")) {
      throw new LedgerError(`Finding ${id} is not cleared for a fix.`)
    }
    if (!/^[0-9a-f]{7,40}$/i.test(commit)) throw new LedgerError("commit must be a Git commit hash.")
    entry.status = "fixed"
    entry.commit = commit
    return entry
  }

  openDecisions(): Decision[] {
    return this.record.decisions.filter(d => d.status === "open")
  }

  pending(): Entry[] {
    return Object.values(this.record.entries).filter(e => e.status === "new" || e.status === "approved" || (e.status === "assessed" && e.verdict?.action === "fix"))
  }
}
