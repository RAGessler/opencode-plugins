import { describe, expect, test } from "bun:test"
import { classifyCommand, gate, type CommandClass } from "./gate"

describe("classifyCommand", () => {
  test.each<[string, CommandClass]>([
    ["git push", "push"],
    ["git push origin HEAD", "push"],
    ["git push --force", "force-push"],
    ["git push -f origin x", "force-push"],
    ["git push --force-with-lease", "force-push"],
    ["git push origin +main", "force-push"],
    ["git -C /tmp/wt push", "push"],
    ["git commit -m fix", "commit"],
    ["git commit --no-verify -m x", "skip-hooks"],
    ["git commit -nm x", "skip-hooks"],
    ["gh pr merge 12 --squash", "merge"],
    ["gh pr ready 12", "merge"],
    ["npm test && git push", "push"],
    ["git add . && git commit -m a; git push -f", "force-push"],
    ["git status", "other"],
    ["echo git push", "other"],
    ["GIT_TERMINAL_PROMPT=0 git push", "push"],
  ])("%s -> %s", (command, expected) => {
    expect(classifyCommand(command)).toBe(expected)
  })
})

describe("gate", () => {
  test("always denies force push, merge, and skipped hooks", () => {
    for (const command of ["git push -f", "gh pr merge 1", "git commit --no-verify -m x"]) {
      expect(gate({ command, openDecisions: 0 }).effect).toBe("deny")
    }
  })
  test("pauses commit and push while a decision is open", () => {
    expect(gate({ command: "git push", openDecisions: 1 }).effect).toBe("deny")
    expect(gate({ command: "git commit -m x", openDecisions: 2 }).effect).toBe("deny")
    expect(gate({ command: "git push", openDecisions: 0 }).effect).toBe("allow")
    expect(gate({ command: "git diff", openDecisions: 1 }).effect).toBe("allow")
  })
})
