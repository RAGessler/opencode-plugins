import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { CostWidget } from "./widget"
import type { CostState } from "./monitor"

const theme = { text: { base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888") } }
const range = { from: 1, to: 2, label: "Current sprint", dates: "Oct 26 – Nov 8" }
const ready: CostState = {
  range, loading: false,
  snapshot: {
    range, total: 15, projectCount: 2, updated: 1,
    models: [{ id: "model", label: "gpt-model", cost: 15 }],
    projects: [{ id: "project", label: "opencode-standup", cost: 15 }],
  },
}

describe("sidebar widget", () => {
  test("renders actual terminal elements at sidebar width and updates reactively", async () => {
    const [state, setState] = createSignal(ready)
    const view = await testRender(() => <CostWidget state={state()} theme={theme} collapsed={false} toggleCollapsed={() => {}} />, { width: 36, height: 24 })
    try {
      await view.renderOnce()
      const frame = view.captureCharFrame()
      expect(frame).toContain("▾ Costs · Current sprint")
      expect(frame).toContain("Oct 26 – Nov 8")
      expect(frame).toContain("$15.00")
      expect(frame).toContain("Top models")
      expect(frame).toContain("Top projects")
      expect(frame).toContain("opencode-standup")
      expect(frame).toContain("not billing")
      setState({ ...ready, error: "offline" })
      await view.renderOnce()
      expect(view.captureCharFrame()).toContain("Stale")
      expect(view.captureCharFrame()).toContain("$15.00")
    } finally { await view.dispose() }
  })

  test("shows unavailability rather than a fabricated $0.00", async () => {
    const view = await testRender(() => <CostWidget state={{ range, loading: false, error: "Cost data unavailable" }} theme={theme} collapsed={false} toggleCollapsed={() => {}} />, { width: 36, height: 24 })
    try {
      await view.renderOnce()
      expect(view.captureCharFrame()).toContain("Cost data unavailable")
      expect(view.captureCharFrame()).not.toContain("$0.00")
    } finally { await view.dispose() }
  })

  test("keeps dollar amounts visible for long names and limits rankings to three rows", async () => {
    const models = Array.from({ length: 4 }, (_, i) => ({ id: String(i), label: `provider/a-very-long-model-name-${i}`, cost: 15 - i }))
    const view = await testRender(() => <CostWidget state={{ ...ready, snapshot: { ...ready.snapshot!, models } }} theme={theme} collapsed={false} toggleCollapsed={() => {}} />, { width: 30, height: 24 })
    try {
      await view.renderOnce()
      const frame = view.captureCharFrame()
      expect(frame).toContain("$15.00")
      expect(frame).toContain("$14.00")
      expect(frame).toContain("$13.00")
      expect(frame).not.toContain("$12.00")
    } finally { await view.dispose() }
  })

  test("collapses details into a compact bar while keeping the total visible", async () => {
    const view = await testRender(() => <CostWidget state={ready} theme={theme} collapsed={true} toggleCollapsed={() => {}} />, { width: 36, height: 24 })
    try {
      await view.renderOnce()
      const frame = view.captureCharFrame()
      expect(frame).toContain("▸ Costs · Current sprint")
      expect(frame).toContain("$15.00")
      expect(frame).not.toContain("Top models")
      expect(frame).not.toContain("Top projects")
      expect(frame).not.toContain("not billing")
    } finally { await view.dispose() }
  })

  test("clicking the cost heading toggles the details", async () => {
    const [collapsed, setCollapsed] = createSignal(false)
    const view = await testRender(() => <CostWidget state={ready} theme={theme} collapsed={collapsed()} toggleCollapsed={() => setCollapsed(value => !value)} />, { width: 36, height: 24 })
    try {
      await view.renderOnce()
      const before = view.captureCharFrame()
      const headingRow = before.split("\n").findIndex(line => line.includes("Costs · Current sprint"))
      expect(headingRow).toBeGreaterThanOrEqual(0)
      await view.mockMouse.click(2, headingRow)
      await view.flush()
      const after = view.captureCharFrame()
      expect(after).toContain("▸ Costs · Current sprint")
      expect(after).toContain("$15.00")
      expect(after).not.toContain("Top models")
    } finally { await view.dispose() }
  })
})
