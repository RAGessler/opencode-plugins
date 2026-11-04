/** Read-only smoke test. Never creates sessions, prompts, or database writes. */
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { loadCosts, formatCost } from "../plugin/costs"
import { parseOptions, periodRange } from "../plugin/periods"

const endpoint = await Service.discover()
if (!endpoint) throw new Error("No healthy OpenCode service. Open OpenCode first.")
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
const options = parseOptions({ period: "sprint" })
const range = periodRange({ period: options.period }, options.sprint)
const signal = AbortSignal.timeout(60_000)
const result = await loadCosts(client, range, signal)
const overall = await client.experimental.session.stats({ from: range.from, to: range.to, tools: "none" }, { signal })
const modelSum = result.models.reduce((sum, row) => sum + row.cost, 0)
if (Math.abs(modelSum - result.total) > 0.00001) throw new Error("Model costs do not reconcile")
if (Math.abs(result.total - overall.cost) > 0.01) {
  throw new Error("Project costs differ from global statistics; retry when active calls settle")
}
const allTime = periodRange({ period: "all" }, options.sprint)
const allTimeResult = await loadCosts(client, allTime, signal)
const allTimeOverall = await client.experimental.session.stats({ to: allTime.to, tools: "none" }, { signal })
const allTimeModelSum = allTimeResult.models.reduce((sum, row) => sum + row.cost, 0)
if (Math.abs(allTimeModelSum - allTimeResult.total) > 0.00001 || Math.abs(allTimeResult.total - allTimeOverall.cost) > 0.01) {
  throw new Error("All-time project/model costs do not reconcile with V2 statistics")
}
console.log(`V2 API verified: ${result.projectCount} projects; ${range.label}, ${range.dates}`)
console.log(`Reported total ${formatCost(result.total)}; model and project totals reconcile`)
console.log("Top models:", result.models.slice(0, 3).map(row => `${row.label}: ${formatCost(row.cost)}`).join(", "))
console.log("Top projects:", result.projects.slice(0, 3).map(row => `${row.label}: ${formatCost(row.cost)}`).join(", "))
console.log(`All time ${formatCost(allTimeResult.total)} across ${allTimeResult.projectCount} projects; totals reconcile`)
