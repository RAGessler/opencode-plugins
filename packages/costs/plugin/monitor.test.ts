import { describe, expect, test } from "bun:test"
import { createCostMonitor, type CostState } from "./monitor"
import type { CostSnapshot } from "./costs"
import type { PeriodRange } from "./periods"

const week: PeriodRange = { from: 1, to: 2, label: "This week", dates: "Nov 2 – Nov 8" }
const sprint = { ...week, from: 0, label: "Current sprint" }
const snapshot = (range = week): CostSnapshot => ({ range, total: 10, models: [], projects: [], projectCount: 1, updated: 1 })
function deferred<T>() {
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  return { promise, resolve, reject }
}

describe("cost refresh lifecycle", () => {
  test("coalesces overlapping refreshes and replaces rather than adds totals", async () => {
    let calls = 0
    const states: CostState[] = []
    const monitor = createCostMonitor(async () => { calls++; return snapshot() }, state => states.push(state))
    await Promise.all([monitor.refresh(week), monitor.refresh(week)])
    expect(calls).toBe(1)
    await monitor.refresh(week)
    expect(calls).toBe(2)
    expect(states.at(-1)?.snapshot?.total).toBe(10)
    monitor.dispose()
  })

  test("aborts an old period and never lets late responses overwrite the new period", async () => {
    const first = deferred<CostSnapshot>()
    const second = deferred<CostSnapshot>()
    let firstSignal: AbortSignal | undefined
    const states: CostState[] = []
    const monitor = createCostMonitor((range, signal) => {
      if (range === week) { firstSignal = signal; return first.promise }
      return second.promise
    }, state => states.push(state))
    const old = monitor.refresh(week)
    await Promise.resolve()
    const next = monitor.refresh(sprint)
    expect(firstSignal?.aborted).toBe(true)
    expect(states.at(-1)?.snapshot).toBeUndefined()
    second.resolve(snapshot(sprint))
    await next
    first.resolve(snapshot())
    await old
    expect(states.at(-1)?.range).toEqual(sprint)
    monitor.dispose()
  })

  test("retains explicitly stale data on failure, but never substitutes zero", async () => {
    let fail = false
    const states: CostState[] = []
    const monitor = createCostMonitor(async range => {
      if (fail) throw new Error("offline")
      return snapshot(range)
    }, state => states.push(state))
    await monitor.refresh(week)
    fail = true
    await monitor.refresh(week)
    expect(states.at(-1)).toMatchObject({ error: "Cost data unavailable", snapshot: { total: 10 } })
    await monitor.refresh(sprint)
    expect(states.at(-1)?.snapshot).toBeUndefined()
    monitor.dispose()
  })

  test("disposal cancels pending work and suppresses further updates", async () => {
    const pending = deferred<CostSnapshot>()
    let signal: AbortSignal | undefined
    const states: CostState[] = []
    const monitor = createCostMonitor((_, current) => { signal = current; return pending.promise }, state => states.push(state))
    const request = monitor.refresh(week)
    await Promise.resolve()
    monitor.dispose()
    expect(signal?.aborted).toBe(true)
    pending.resolve(snapshot())
    await request
    await monitor.refresh(week)
    expect(states).toHaveLength(1)
  })
})
