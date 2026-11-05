import { describe, expect, test } from "bun:test"
import { Ledger } from "./ledger"
import type { Finding, Snapshot } from "./types"
import { Watcher, WAKE_MARKER } from "./watcher"

const finding = (id: number, over: Partial<Finding> = {}): Finding => ({
  id: `inline:${id}`, kind: "inline", source: "copilot", author: "copilot", severity: "high",
  path: "a.ts", line: id, body: `Issue ${id}`, url: "", updatedAt: "t", ...over,
})

function setup(opts: { debounceMs?: number; maxFailures?: number } = {}) {
  let time = 0
  let snapshot: Snapshot | Error = { head: "abcdef123", state: "open", findings: [] }
  const delivered: string[] = []
  let deliverFails = false
  const persisted: number[] = []
  const ledger = Ledger.create({ owner: "o", repo: "r", number: 7 }, "ses_1")
  const watcher = new Watcher({
    fetch: async () => { if (snapshot instanceof Error) throw snapshot; return snapshot },
    deliver: async (_id, text) => { if (deliverFails) throw new Error("x"); delivered.push(text) },
    persist: async () => { persisted.push(time) },
    now: () => time, debounceMs: opts.debounceMs ?? 100, maxFailures: opts.maxFailures ?? 3,
  })
  return {
    ledger, watcher, delivered, persisted,
    set: (s: Snapshot | Error) => { snapshot = s },
    advance: (ms: number) => { time += ms },
    failDelivery: (v: boolean) => { deliverFails = v },
  }
}
const open = (...findings: Finding[]): Snapshot => ({ head: "abcdef123", state: "open", findings })

describe("Watcher", () => {
  test("reports new findings once, after the quiet period", async () => {
    const t = setup()
    t.watcher.watch(t.ledger)
    t.set(open(finding(1)))
    await t.watcher.tick()
    expect(t.delivered).toEqual([])
    t.advance(100)
    await t.watcher.tick()
    expect(t.delivered.length).toBe(1)
    expect(t.delivered[0]).toContain(WAKE_MARKER)
    expect(t.delivered[0]).toContain("inline:1 · high · copilot (copilot) · a.ts:1")
    expect(t.delivered[0]).not.toContain("Issue 1")
    t.advance(500)
    await t.watcher.tick()
    expect(t.delivered.length).toBe(1)
  })
  test("new activity restarts the quiet timer and batches findings", async () => {
    const t = setup()
    t.watcher.watch(t.ledger)
    t.set(open(finding(1)))
    await t.watcher.tick()
    t.advance(80)
    t.set(open(finding(1), finding(2)))
    await t.watcher.tick()
    t.advance(80)
    await t.watcher.tick()
    expect(t.delivered.length).toBe(0)
    t.advance(20)
    await t.watcher.tick()
    expect(t.delivered.length).toBe(1)
    expect(t.delivered[0]).toContain("2 findings")
  })
  test("immediate mode reports at the first poll", async () => {
    const t = setup()
    t.watcher.watch(t.ledger, { immediate: true })
    t.set(open(finding(1)))
    await t.watcher.tick()
    expect(t.delivered.length).toBe(1)
  })
  test("mentions open decisions in the report", async () => {
    const t = setup()
    t.ledger.ingest(open(finding(1)))
    t.ledger.assess("inline:1", {
      validity: "confirmed", severity: "high", inScope: true, effort: "large",
      risk: { publicInterface: false, storedData: false, accessControl: false, sharedBehavior: false, dependency: false }, summary: "s",
    })
    t.ledger.ask("inline:1", { title: "T", problem: "A problem.", risk: "A risk.", recommended: "Do it.", options: [{ label: "Do it.", kind: "fix" }], recommendedNumber: 1 })
    t.watcher.watch(t.ledger, { immediate: true })
    t.set(open(finding(1), finding(2)))
    await t.watcher.tick()
    expect(t.delivered[0]).toContain("Open user decisions: D-1")
    expect(t.delivered[0]).not.toContain("inline:1 ·")
  })
  test("a failed delivery is retried at the next poll", async () => {
    const t = setup()
    t.watcher.watch(t.ledger, { immediate: true })
    t.set(open(finding(1)))
    t.failDelivery(true)
    await t.watcher.tick()
    t.failDelivery(false)
    await t.watcher.tick()
    expect(t.delivered.length).toBe(1)
  })
  test("stops after repeated poll failures", async () => {
    const t = setup({ maxFailures: 2 })
    t.watcher.watch(t.ledger)
    t.set(new Error("down"))
    await t.watcher.tick()
    expect(t.watcher.watching().length).toBe(1)
    await t.watcher.tick()
    expect(t.watcher.watching()).toEqual([])
    expect(t.delivered[0]).toContain("Monitor stopped")
  })
  test("stops when the PR merges", async () => {
    const t = setup()
    t.watcher.watch(t.ledger)
    t.set({ head: "abcdef123", state: "merged", findings: [] })
    await t.watcher.tick()
    expect(t.watcher.watching()).toEqual([])
    expect(t.delivered[0]).toContain("PR merged")
  })
  test("persists after every successful poll", async () => {
    const t = setup()
    t.watcher.watch(t.ledger)
    await t.watcher.tick()
    await t.watcher.tick()
    expect(t.persisted.length).toBe(2)
  })
})
