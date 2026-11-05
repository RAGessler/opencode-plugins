import { describe, expect, test } from "bun:test"
import type { Severity } from "./types"
import { createGitHub, parsePrRef, parseSeverity, parseSnapshot, REPLY_MARKER } from "./github"

describe("parsePrRef", () => {
  test("reads short and URL forms", () => {
    expect(parsePrRef("acme/widgets#42")).toEqual({ owner: "acme", repo: "widgets", number: 42 })
    expect(parsePrRef("https://github.com/acme/widgets/pull/42/files")).toEqual({ owner: "acme", repo: "widgets", number: 42 })
    expect(() => parsePrRef("nonsense")).toThrow()
  })
})

describe("parseSeverity", () => {
  test.each<[string, Severity]>([
    ["**Severity: High** - null deref", "high"],
    ["Medium: rename this", "medium"],
    ["🔴 High\nbody", "high"],
    ["nit: spacing", "low"],
    ["Priority - Low", "low"],
    ["Consider a different approach.", "unknown"],
  ])("%s -> %s", (body, expected) => expect(parseSeverity(body)).toBe(expected))
})

describe("parseSnapshot", () => {
  const raw = {
    pull: { head: { sha: "abc" }, state: "open" },
    inline: [
      { id: 1, user: { login: "copilot-pull-request-reviewer[bot]", type: "Bot" }, body: "High: bug", path: "a.ts", line: 3, html_url: "u1", updated_at: "t" },
      { id: 2, user: { login: "me" }, body: `${REPLY_MARKER}\nDone.`, path: "a.ts" },
      { id: 3, user: { login: "bob" }, body: "   " },
    ],
    issue: [{ id: 9, user: { login: "bob" }, body: "Please add a test.", html_url: "u9", updated_at: "t" }],
    reviews: [
      { id: 5, user: { login: "copilot-pull-request-reviewer[bot]", type: "Bot" }, body: "Overview of changes", state: "COMMENTED" },
      { id: 6, user: { login: "bob" }, body: "Needs work", state: "CHANGES_REQUESTED", submitted_at: "t" },
      { id: 7, user: { login: "bob" }, body: "draft", state: "PENDING" },
    ],
  }
  test("keeps real findings and drops replies, blanks, summaries, and pending reviews", () => {
    const s = parseSnapshot(raw)
    expect(s.head).toBe("abc")
    expect(s.state).toBe("open")
    expect(s.findings.map(f => f.id)).toEqual(["inline:1", "conversation:9", "review:6"])
    expect(s.findings[0]).toMatchObject({ source: "copilot", severity: "high", path: "a.ts", line: 3 })
    expect(s.findings[1]?.source).toBe("human")
  })
  test("reads merged and closed state", () => {
    expect(parseSnapshot({ ...raw, pull: { state: "closed", merged: true } }).state).toBe("merged")
    expect(parseSnapshot({ ...raw, pull: { state: "closed" } }).state).toBe("closed")
  })
})

describe("createGitHub", () => {
  test("calls gh for each source and flattens pages", async () => {
    const calls: string[][] = []
    const gh = createGitHub(async args => {
      calls.push(args)
      if (args.length === 2) return JSON.stringify({ head: { sha: "h" }, state: "open" })
      return JSON.stringify([[{ id: 1, user: { login: "bob" }, body: "x", updated_at: "t" }], [{ id: 2, user: { login: "bob" }, body: "y", updated_at: "t" }]])
    })
    const s = await gh.snapshot({ owner: "o", repo: "r", number: 3 })
    expect(calls.length).toBe(4)
    expect(s.head).toBe("h")
    expect(s.findings.filter(f => f.kind === "conversation").length).toBe(2)
  })
})
