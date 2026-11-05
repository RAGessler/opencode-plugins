import { describe, expect, test } from "bun:test"
import { OpenCode } from "@opencode/client"
import type { Project, SessionStatsInfo, SessionStatsModelUsage } from "@opencode/client"
import { loadCosts } from "./costs"

const range = { from: new Date("2026-10-26T00:00:00").getTime(), to: new Date("2026-11-09T00:00:00").getTime(), label: "Current sprint", dates: "Oct 26 – Nov 8" }
const tokens = { input: 10, output: 5, reasoning: 0, cache: { read: 20, write: 0 } }
function usage(id: string, cost: number, variant = "default", providerID = "provider"): SessionStatsModelUsage {
  return { model: { id, providerID, variant }, cost, tokens, steps: 1 }
}
function stats(cost: number, models: SessionStatsModelUsage[]): SessionStatsInfo {
  return { range, sessions: 1, subagents: 1, prompts: 1, steps: models.length, tokens, cost, tools: { mode: "none" }, activeDays: 1, streak: 1, activity: [], models }
}
function project(id: string, canonical = `/repos/${id}`): Project {
  return { id, canonical, time: { created: 1, updated: 1, active: 1 }, sandboxes: [] }
}

function fixture(projects: Project[], results: Record<string, SessionStatsInfo | null>, delay?: (id: string) => Promise<void>, expectedRange: { from?: number; to: number } = range) {
  const requests: URL[] = []
  const client = OpenCode.make({ baseUrl: "http://standup.test", fetch: Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push(url)
    if (url.pathname === "/api/project") {
      expect(url.searchParams.get("archived")).toBe("true")
      return Response.json(projects)
    }
    if (url.pathname !== "/api/experimental/session/stats") throw new Error("Unexpected endpoint")
    expect(url.searchParams.get("from")).toBe(expectedRange.from === undefined ? null : String(expectedRange.from))
    expect(url.searchParams.get("to")).toBe(String(expectedRange.to))
    expect(url.searchParams.get("tools")).toBe("none")
    const id = url.searchParams.get("project")!
    await delay?.(id)
    const result = results[id]
    if (!result) return Response.json({ error: "unavailable" }, { status: 500 })
    return Response.json({ data: result })
  }, { preconnect: fetch.preconnect }) })
  return { client, requests }
}

describe("V2 cost collection", () => {
  test("ranks by cost, combines model variants, and keeps providers distinct", async () => {
    const { client } = fixture([project("a"), project("b")], {
      a: stats(12, [usage("model-a", 8, "high"), usage("model-b", 4)]),
      b: stats(15, [usage("model-a", 5), usage("model-a", 10, "default", "other")]),
    })
    const result = await loadCosts(client, range)
    expect(result.total).toBe(27)
    expect(result.projects.map(x => [x.id, x.cost])).toEqual([["b", 15], ["a", 12]])
    expect(result.models.map(x => x.cost)).toEqual([13, 10, 4])
    expect(result.models[0].label).toBe("provider/model-a")
    expect(result.models.reduce((sum, x) => sum + x.cost, 0)).toBe(result.total)
  })

  test("uses upstream fork-safe usage exactly once, never session or family lifetime totals", async () => {
    // The V2 statistics projection owns fork/subagent deduplication: original
    // $10 + new fork $2 + nested fork $3 + subagent $4 = $19, not $49.
    const { client, requests } = fixture([project("a"), project("a")], {
      a: stats(19, [usage("model-a", 19)]),
    })
    expect((await loadCosts(client, range)).total).toBe(19)
    expect(requests.filter(x => x.pathname.endsWith("/stats"))).toHaveLength(1)
    // A refresh replaces a snapshot; it never adds another copy of past usage.
    expect((await loadCosts(client, range)).total).toBe(19)
    expect(requests.every(x => !x.pathname.includes("/message") && !x.pathname.endsWith("/session"))).toBe(true)
  })

  test("keeps compaction or other unattributed costs visible and reconciled", async () => {
    const { client } = fixture([project("a")], { a: stats(12, [usage("model-a", 10)]) })
    const result = await loadCosts(client, range)
    expect(result.models.find(x => x.id === "unattributed")?.cost).toBe(2)
    expect(result.total).toBe(12)
  })

  test("fails closed on unavailable costs instead of displaying a false zero or partial total", async () => {
    const { client } = fixture([project("a"), project("b")], { a: stats(10, [usage("model-a", 10)]), b: null })
    await expect(loadCosts(client, range)).rejects.toThrow("unavailable")
    const invalid = stats(0, [])
    const { client: invalidClient } = fixture([project("a")], { a: { ...invalid, cost: Number.NaN } })
    await expect(loadCosts(invalidClient, range)).rejects.toThrow("cost")
  })

  test("rejects inconsistent model totals", async () => {
    const { client } = fixture([project("a")], { a: stats(5, [usage("model-a", 10)]) })
    await expect(loadCosts(client, range)).rejects.toThrow("exceed")
  })

  test("bounds project request concurrency and includes archived projects", async () => {
    let active = 0
    let maximum = 0
    const projects = Array.from({ length: 10 }, (_, i) => project(String(i)))
    const { client } = fixture(projects, Object.fromEntries(projects.map(p => [p.id, stats(1, [usage("model-a", 1)])])), async () => {
      maximum = Math.max(maximum, ++active)
      await Bun.sleep(2)
      active--
    })
    expect((await loadCosts(client, range)).total).toBe(10)
    expect(maximum).toBeLessThanOrEqual(4)
  })

  test("an empty project inventory yields an explicit empty snapshot", async () => {
    const { client } = fixture([], {})
    expect(await loadCosts(client, range)).toMatchObject({ total: 0, models: [], projects: [], projectCount: 0 })
  })

  test("all-time stats omit from and count through the current instant", async () => {
    const allTime = { ...range, from: undefined, label: "All time", dates: "All recorded usage" }
    const { client, requests } = fixture([project("a")], { a: stats(10, [usage("model-a", 10)]) }, undefined, allTime)
    const result = await loadCosts(client, allTime)
    expect(result.total).toBe(10)
    const request = requests.find(url => url.pathname.endsWith("/stats"))!
    expect(request.searchParams.has("from")).toBe(false)
    expect(Number(request.searchParams.get("to"))).toBe(allTime.to)
  })
})
