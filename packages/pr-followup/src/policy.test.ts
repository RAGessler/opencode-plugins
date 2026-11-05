import { describe, expect, test } from "bun:test"
import { decide } from "./policy"
import type { Assessment } from "./types"

const safe: Assessment = {
  validity: "confirmed", severity: "medium", inScope: true, effort: "small",
  risk: { publicInterface: false, storedData: false, accessControl: false, sharedBehavior: false, dependency: false },
  summary: "Missing null check.",
}
const with_ = (patch: Partial<Assessment>): Assessment => ({ ...safe, ...patch })

describe("decide", () => {
  test("fixes a confirmed, small, safe finding", () => {
    expect(decide(safe).action).toBe("fix")
  })
  test("skips invalid, fixed, and out-of-scope findings", () => {
    expect(decide(with_({ validity: "invalid" })).action).toBe("skip")
    expect(decide(with_({ validity: "already-fixed" })).action).toBe("skip")
    expect(decide(with_({ inScope: false })).action).toBe("skip")
  })
  test("asks when the finding is unclear", () => {
    expect(decide(with_({ validity: "unclear" })).action).toBe("ask")
  })
  test("asks for any risk flag, even at low severity", () => {
    for (const key of ["publicInterface", "storedData", "accessControl", "sharedBehavior", "dependency"] as const) {
      const v = decide(with_({ severity: "low", risk: { ...safe.risk, [key]: true } }))
      expect(v.action).toBe("ask")
      expect(v.reasons.length).toBe(1)
    }
  })
  test("asks for large effort and fixes medium effort without risk", () => {
    expect(decide(with_({ effort: "large" })).action).toBe("ask")
    expect(decide(with_({ effort: "medium" })).action).toBe("fix")
  })
  test("low severity follows the option", () => {
    expect(decide(with_({ severity: "low" })).action).toBe("fix")
    expect(decide(with_({ severity: "low" }), { fixLowSeverity: false }).action).toBe("skip")
  })
})
