import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import type { StatusView } from "./view"
import { FollowupWidget, type WidgetTheme } from "./widget"

const color = (hex: string) => ({ base: RGBA.fromHex(hex) })
const theme = {
  text: { base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888"), feedback: { success: color("#00ff00"), warning: color("#ffaa00"), error: color("#ff0000"), info: color("#0000ff") } },
} as unknown as WidgetTheme
const base: StatusView = { enabled: true, pollSeconds: 60, prs: [] }
const pr = { pr: "acme/widgets#12", head: "abc1234", watching: true, waiting: 0, fixed: 0, skipped: 0, decisions: [] as string[] }

async function frame(view: StatusView | undefined, collapsed = false, width = 36) {
  const r = await testRender(() => <FollowupWidget view={view} theme={theme} collapsed={collapsed} toggleCollapsed={() => {}} />, { width, height: 14 })
  try {
    await r.renderOnce()
    return r.captureCharFrame()
  } finally {
    await r.dispose()
  }
}

describe("FollowupWidget", () => {
  test("shows a running state with the PR", async () => {
    const f = await frame({ ...base, prs: [pr] })
    expect(f).toContain("▾ ● PR Followup")
    expect(f).toContain("watching")
    expect(f).toContain("acme/widgets#12")
    expect(f).toContain("/followup off to disable")
  })
  test("shows off and how to turn it on", async () => {
    const f = await frame({ ...base, enabled: false })
    expect(f).toContain("○ PR Followup")
    expect(f).toContain("off")
    expect(f).toContain("/followup on")
  })
  test("shows unavailable when the plugin cannot be reached", async () => {
    const f = await frame(undefined)
    expect(f).toContain("unavailable")
    expect(f).toContain("Cannot reach")
  })
  test("shows a warning when a decision needs the user", async () => {
    const f = await frame({ ...base, prs: [{ ...pr, waiting: 2, decisions: ["D-3"] }] })
    expect(f).toContain("▲ PR Followup")
    expect(f).toContain("needs you")
    expect(f).toContain("1 decision needs your answer.")
    expect(f).toContain("D-3 waiting")
  })
  test("collapsed shows only the heading and state", async () => {
    const f = await frame({ ...base, prs: [pr] }, true)
    expect(f).toContain("▸ ● PR Followup")
    expect(f).not.toContain("acme/widgets")
  })
  test("fits a narrow sidebar and updates reactively", async () => {
    const [view, setView] = createSignal<StatusView | undefined>({ ...base, prs: [pr] })
    const r = await testRender(() => <FollowupWidget view={view()} theme={theme} collapsed={false} toggleCollapsed={() => {}} />, { width: 28, height: 14 })
    try {
      await r.renderOnce()
      expect(r.captureCharFrame()).toContain("acme/widgets")
      setView({ ...base, enabled: false })
      await r.renderOnce()
      expect(r.captureCharFrame()).toContain("off")
      expect(r.captureCharFrame()).not.toContain("acme/widgets")
    } finally {
      await r.dispose()
    }
  })
})
