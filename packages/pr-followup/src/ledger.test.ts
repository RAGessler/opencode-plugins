import { describe, expect, test } from "bun:test"
import { Ledger, LedgerError, parseAnswer } from "./ledger"
import type { Assessment, Finding, Snapshot } from "./types"

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: "inline:1", kind: "inline", source: "copilot", author: "copilot", severity: "high",
  body: "Fix this.", url: "https://example/1", updatedAt: "2026-11-05T10:00:00Z", ...over,
})
const snap = (...findings: Finding[]): Snapshot => ({ head: "abc1234", state: "open", findings })
const safe: Assessment = {
  validity: "confirmed", severity: "high", inScope: true, effort: "small",
  risk: { publicInterface: false, storedData: false, accessControl: false, sharedBehavior: false, dependency: false },
  summary: "The null check is missing at line 4.",
}
const risky: Assessment = { ...safe, risk: { ...safe.risk, sharedBehavior: true } }
const ask = {
  title: "Invoice status change",
  problem: "The new status can stop payment processing.",
  risk: "The fix also changes old invoices.",
  recommended: "Keep the old behavior.",
  options: [{ label: "Make the recommended fix.", kind: "fix" as const }, { label: "Check old invoices first.", kind: "investigate" as const }],
  recommendedNumber: 1,
}
const newLedger = () => Ledger.create({ owner: "o", repo: "r", number: 1 }, "ses_1")

describe("ingest", () => {
  test("adds findings once and detects edits", () => {
    const l = newLedger()
    expect(l.ingest(snap(finding())).added.length).toBe(1)
    expect(l.ingest(snap(finding())).added.length).toBe(0)
    const edited = l.ingest(snap(finding({ body: "Fix that instead.", updatedAt: "2026-11-05T11:00:00Z" })))
    expect(edited.changed.length).toBe(1)
    expect(l.entry("inline:1").status).toBe("new")
  })
  test("an edit withdraws an open decision", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", risky)
    l.ask("inline:1", ask)
    l.ingest(snap(finding({ body: "Changed.", updatedAt: "later" })))
    expect(l.openDecisions()).toEqual([])
  })
})

describe("safe path", () => {
  test("assess, then record a fix", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    expect(l.assess("inline:1", safe).action).toBe("fix")
    expect(l.pending().length).toBe(1)
    expect(l.recordFix("inline:1", "abc1234").status).toBe("fixed")
    expect(l.pending().length).toBe(0)
  })
  test("rejects an empty summary and a bad commit", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    expect(() => l.assess("inline:1", { ...safe, summary: "  " })).toThrow(LedgerError)
    l.assess("inline:1", safe)
    expect(() => l.recordFix("inline:1", "not-a-hash")).toThrow(LedgerError)
  })
  test("a skip verdict closes the finding", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", { ...safe, validity: "invalid" })
    expect(l.entry("inline:1").status).toBe("skipped")
  })
})

describe("decision path", () => {
  test("cannot fix a risky finding without an answer", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", risky)
    expect(() => l.recordFix("inline:1", "abc1234")).toThrow(LedgerError)
    const d = l.ask("inline:1", ask)
    expect(d.id).toBe("D-1")
    expect(d.options.at(-1)?.kind).toBe("leave")
    expect(l.entry("inline:1").status).toBe("blocked")
    expect(l.openDecisions().length).toBe(1)
    expect(() => l.recordFix("inline:1", "abc1234")).toThrow(LedgerError)
    expect(() => l.assess("inline:1", safe)).toThrow(LedgerError)
  })
  test("only a user answer approves the fix", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", risky)
    l.ask("inline:1", ask)
    expect(l.answer("D-1", 1)?.status).toBe("approved")
    expect(l.openDecisions()).toEqual([])
    expect(l.recordFix("inline:1", "abc1234").status).toBe("fixed")
  })
  test("investigate reopens, leave skips, bad answers are ignored", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", risky)
    l.ask("inline:1", ask)
    expect(l.answer("D-1", 9)).toBeUndefined()
    expect(l.answer("D-9", 1)).toBeUndefined()
    expect(l.answer("D-1", 2)?.status).toBe("new")
    l.assess("inline:1", risky)
    l.ask("inline:1", ask)
    expect(l.answer("D-2", 3)?.status).toBe("skipped")
    expect(l.answer("D-2", 1)).toBeUndefined()
  })
  test("refuses a decision that fails the English check", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", risky)
    expect(() => l.ask("inline:1", { ...ask, problem: "It doesn't work; fix it etc." })).toThrow(/simpler English/)
    expect(l.entry("inline:1").status).toBe("assessed")
  })
  test("refuses a decision for a finding that needs no decision", () => {
    const l = newLedger()
    l.ingest(snap(finding()))
    l.assess("inline:1", safe)
    expect(() => l.ask("inline:1", ask)).toThrow(LedgerError)
  })
})

describe("parseAnswer", () => {
  test("reads common answer forms", () => {
    expect(parseAnswer("D-12 1")).toEqual({ decisionId: "D-12", option: 1 })
    expect(parseAnswer("d-3: option 2 please")).toEqual({ decisionId: "D-3", option: 2 })
    expect(parseAnswer("D-4 - 3")).toEqual({ decisionId: "D-4", option: 3 })
    expect(parseAnswer("I think D-12 is fine")).toBeUndefined()
  })
})
