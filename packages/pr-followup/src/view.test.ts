import { describe, expect, test } from "bun:test"
import { parseStatus, summarize, type PrView, type StatusView } from "./view"

const pr = (over: Partial<PrView> = {}): PrView => ({ pr: "o/r#1", head: "abc", watching: true, waiting: 0, fixed: 0, skipped: 0, decisions: [], ...over })
const view = (over: Partial<StatusView> = {}): StatusView => ({ enabled: true, pollSeconds: 60, prs: [], ...over })

describe("summarize", () => {
  test("offline when there is no view", () => {
    expect(summarize(undefined).tone).toBe("offline")
  })
  test("off when disabled, and says how to enable", () => {
    const s = summarize(view({ enabled: false, prs: [pr()] }))
    expect(s.tone).toBe("off")
    expect(s.lines.join(" ")).toContain("/followup on")
  })
  test("on with no PR", () => {
    expect(summarize(view())).toMatchObject({ tone: "idle", label: "on" })
  })
  test("watching a quiet PR", () => {
    const s = summarize(view({ prs: [pr()] }))
    expect(s).toMatchObject({ tone: "idle", label: "watching" })
    expect(s.lines).toContain("Watching 1 PR.")
  })
  test("working when findings wait", () => {
    const s = summarize(view({ prs: [pr({ waiting: 2 })] }))
    expect(s.tone).toBe("working")
    expect(s.lines).toEqual(["o/r#1", "  2 to triage", "/followup off to disable"])
  })
  test("attention beats working and names the decisions", () => {
    const s = summarize(view({ prs: [pr({ waiting: 2, decisions: ["D-3"] }), pr({ pr: "o/r#2", decisions: ["D-4"] })] }))
    expect(s.tone).toBe("attention")
    expect(s.lines[0]).toBe("2 decisions need your answer.")
    expect(s.lines).toContain("  2 to triage · D-3 waiting")
  })
  test("shows a GitHub error", () => {
    const s = summarize(view({ prs: [pr()], lastError: "gh: not logged in" }))
    expect(s.tone).toBe("error")
    expect(s.lines.join("\n")).toContain("gh: not logged in")
  })
})

describe("parseStatus", () => {
  test("accepts a valid view and rejects junk", () => {
    expect(parseStatus(view())).toBeDefined()
    expect(parseStatus(null)).toBeUndefined()
    expect(parseStatus({ enabled: "yes", prs: [] })).toBeUndefined()
    expect(parseStatus({ enabled: true })).toBeUndefined()
  })
})
