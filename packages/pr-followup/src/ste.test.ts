import { describe, expect, test } from "bun:test"
import { lintSte, renderDecision, validateDraft, type DecisionDraft } from "./ste"

describe("lintSte", () => {
  test("accepts short active sentences", () => {
    expect(lintSte("The code stops the payment. Keep the old behavior.", "description")).toEqual([])
  })
  test("limits procedures to 20 words and descriptions to 25", () => {
    const twentyOne = Array.from({ length: 21 }, () => "word").join(" ") + "."
    expect(lintSte(twentyOne, "procedure").some(i => i.severity === "error")).toBe(true)
    expect(lintSte(twentyOne, "description")).toEqual([])
    const twentySix = Array.from({ length: 26 }, () => "word").join(" ") + "."
    expect(lintSte(twentySix, "description").length).toBe(1)
  })
  test("rejects contractions, Latin abbreviations, and semicolons", () => {
    expect(lintSte("It doesn't work.", "description").length).toBe(1)
    expect(lintSte("Check the tests, etc.", "procedure").length).toBe(1)
    expect(lintSte("Stop; start again.", "procedure").length).toBe(1)
  })
  test("does not treat possessives as contractions", () => {
    expect(lintSte("The user's data changes.", "description")).toEqual([])
  })
  test("warns about possible passive voice without an error", () => {
    const issues = lintSte("The file was changed.", "description")
    expect(issues.map(i => i.severity)).toEqual(["warning"])
  })
})

const draft: DecisionDraft = {
  id: "D-12", title: "Invoice status change.",
  problem: "The reviewer reports that the new status can stop payment processing. The code check confirms this problem.",
  risk: "The fix also changes how the system handles old invoices. The tests do not show if this change is safe.",
  recommended: "Keep the old invoice behavior. Add a separate check for the new status.",
  options: [
    { number: 1, label: "Make the recommended fix.", kind: "fix" },
    { number: 2, label: "Check the old invoice behavior first.", kind: "investigate" },
    { number: 3, label: "Leave the code unchanged.", kind: "leave" },
  ],
  recommendedNumber: 1,
}

describe("renderDecision", () => {
  test("the example draft has no errors", () => {
    expect(validateDraft(draft).filter(i => i.severity === "error")).toEqual([])
  })
  test("renders every section and marks the recommendation", () => {
    const text = renderDecision(draft)
    for (const part of ["**Decision D-12: Invoice status change**", "**Problem**", "**Risk**", "**Recommended action**", "**Choose one action**", "1. Make the recommended fix. (Recommended)", "3. Leave the code unchanged.", "Example: D-12 1", "**Current state**"]) {
      expect(text).toContain(part)
    }
  })
  test("fixed template text passes the lint", () => {
    const text = renderDecision(draft)
    const fixed = text.slice(text.indexOf("**How to answer**"))
    expect(lintSte(fixed.replaceAll("*", ""), "procedure").filter(i => i.severity === "error")).toEqual([])
  })
})
