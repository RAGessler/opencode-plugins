import type { OpenCodeClient, Project, SessionStatsInfo } from "@opencode/client"
import type { PeriodRange } from "./periods"

export interface CostRow {
  id: string
  label: string
  cost: number
}
export interface CostSnapshot {
  range: PeriodRange
  total: number
  models: CostRow[]
  projects: CostRow[]
  projectCount: number
  updated: number
}

const EPSILON = 0.000001

function money(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("OpenCode returned an unavailable or invalid cost")
  }
}

function validateStats(stats: SessionStatsInfo): void {
  money(stats?.cost)
  if (!Array.isArray(stats.models)) throw new Error("OpenCode model costs are unavailable")
  let attributed = 0
  for (const row of stats.models) {
    money(row.cost)
    if (!row.model?.id || !row.model.providerID) throw new Error("OpenCode model identity is unavailable")
    attributed += row.cost
  }
  if (attributed - stats.cost > EPSILON) throw new Error("Model costs exceed the reported total")
}

function projectName(project: Project): string {
  return project.name?.trim() || project.canonical.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || project.canonical || project.id
}

function ranked(rows: Iterable<CostRow>): CostRow[] {
  return [...rows].filter(row => row.cost > 0).sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

/**
 * Fetch disjoint project snapshots, never session/family lifetime totals.
 * V2's statistics projection excludes inherited fork messages and includes
 * subagent usage by message time. Each refresh builds a replacement snapshot.
 */
export async function loadCosts(client: OpenCodeClient, range: PeriodRange, signal?: AbortSignal): Promise<CostSnapshot> {
  const cancel = new AbortController()
  const request = { signal: signal ? AbortSignal.any([signal, cancel.signal]) : cancel.signal }
  const projects = await client.project.list({ archived: true }, request).catch(() => {
    throw new Error("OpenCode project costs are unavailable")
  })
  if (!Array.isArray(projects)) throw new Error("OpenCode project costs are unavailable")
  const inventory = [...new Map(projects.map(project => [project.id, project])).values()]
  const results: Array<{ project: Project; stats: SessionStatsInfo }> = []
  let cursor = 0
  // Bound requests even for a user with hundreds of repositories. All calls
  // use the same explicit time range and the connected client's auth. An
  // omitted from for all-time lets V2 find the earliest billable message.
  await Promise.all(Array.from({ length: Math.min(4, inventory.length) }, async () => {
    while (cursor < inventory.length) {
      request.signal.throwIfAborted()
      const project = inventory[cursor++]
      const stats = await client.experimental.session.stats({
        from: range.from, to: range.to, project: project.id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, tools: "none",
      }, request).catch(() => {
        throw new Error("OpenCode cost statistics are unavailable; OpenCode V2.2.5 or compatible is required")
      })
      validateStats(stats)
      results.push({ project, stats })
    }
  })).catch(error => {
    cancel.abort()
    throw error
  })

  let total = 0
  let unattributed = 0
  const models = new Map<string, CostRow & { provider: string; model: string }>()
  const projectRows: CostRow[] = []
  for (const { project, stats } of results) {
    total += stats.cost
    projectRows.push({ id: project.id, label: projectName(project), cost: stats.cost })
    let attributed = 0
    for (const row of stats.models) {
      const { providerID, id } = row.model
      // Combine reasoning variants, but not different providers' model IDs.
      const key = JSON.stringify([providerID, id])
      const model = models.get(key) ?? { id: key, label: id, cost: 0, provider: providerID, model: id }
      model.cost += row.cost
      models.set(key, model)
      attributed += row.cost
    }
    unattributed += Math.max(0, stats.cost - attributed)
  }
  const providers = new Map<string, Set<string>>()
  for (const row of models.values()) {
    const set = providers.get(row.model) ?? new Set<string>()
    set.add(row.provider)
    providers.set(row.model, set)
  }
  const modelRows: CostRow[] = [...models.values()].map(row => ({
    id: row.id, cost: row.cost,
    label: providers.get(row.model)!.size > 1 ? `${row.provider}/${row.model}` : row.model,
  }))
  if (unattributed > EPSILON) modelRows.push({ id: "unattributed", label: "Unattributed", cost: unattributed })
  return { range, total, models: ranked(modelRows), projects: ranked(projectRows), projectCount: inventory.length, updated: Date.now() }
}

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
export function formatCost(cost: number): string {
  return cost > 0 && cost < 0.005 ? "<$0.01" : dollars.format(cost)
}
