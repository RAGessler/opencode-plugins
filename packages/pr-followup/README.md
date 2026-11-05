# opencode-pr-followup

An OpenCode V2 **server plugin** that watches a pull request the agent opened, triages review feedback, and acts by risk:

- **Safe fixes** are made, tested, committed, and pushed automatically.
- **Risky or deep changes** stop. The plugin asks you to choose, in best-effort [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/), and waits.

It works with the `@draft-pr` skill. After that skill opens the PR and requests the Copilot review, it registers the PR here.

## Install

Add the package to the `plugins` array in `~/.config/opencode/opencode.json` (or a project `opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-pr-followup",
      "options": {
        "pollIntervalSeconds": 60,
        "debounceSeconds": 120,
        "fixLowSeverity": true
      }
    }
  ]
}
```

For a checkout, use the absolute path of `packages/pr-followup` as the `package` value.

Requirements: the [GitHub CLI](https://cli.github.com) (`gh`), logged in with access to the repository.

| Option | Default | Meaning |
| --- | ---: | --- |
| `pollIntervalSeconds` | `60` | How often to poll each PR (30 to 86400). |
| `debounceSeconds` | `120` | How long a PR must stay quiet before one batched report is sent. |
| `fixLowSeverity` | `true` | Fix confirmed, small, safe low-severity findings. Set `false` to skip them. |

## Widget and commands

The plugin adds a **PR Followup** section to the OpenCode sidebar and a status in the home footer. It updates when the plugin changes state, and every 10 seconds.

| Widget | Meaning |
| --- | --- |
| `● PR Followup  watching` | On. Watching one or more PRs, nothing to do. |
| `● PR Followup  working` | On. Findings wait for triage. |
| `▲ PR Followup  needs you` | A decision waits for your answer. Commits and pushes are paused. |
| `● PR Followup  error` | A GitHub request failed. The widget shows the reason. |
| `○ PR Followup  off` | Turned off. |
| `○ PR Followup  unavailable` | The widget cannot reach the plugin. |

Click the heading to collapse it. Commands:

| Command | Action |
| --- | --- |
| `/followup` | Open a menu: turn on, turn off, show status. |
| `/followup on` / `off` / `toggle` | Turn the plugin on or off. |
| `/followup status` | Show a status message. |
| `/followup collapse` / `expand` | Collapse or expand the widget. |

The command palette has **PR Followup: turn on** and **PR Followup: turn off**.

**Off** means: the watcher stops polling, `register` is refused, and no reports arrive. Your choice is saved and survives restarts. While off, an open decision still pauses commits and pushes in its session, so turning the plugin off never releases a pause. The never-force-push and never-merge rules apply only while the plugin is on.

## How it works

```text
@draft-pr opens the PR, then calls pr_followup register
  -> the watcher polls GitHub and finds new feedback
  -> a [PR Followup] report wakes the owning session
  -> the agent reads the findings and calls assess
       fix  -> fix, test, check_head, commit, push, fixed
       skip -> no code change
       ask  -> a decision request goes to you; commits and pushes pause
```

### Who decides what

The agent reports facts about each finding: whether it is valid, whether it is in scope, how much work the fix needs, and whether it could affect a public interface, stored data, access control, shared behavior, or a dependency. The **plugin** turns that into a verdict:

| Finding | Verdict |
| --- | --- |
| Invalid, already fixed, or outside the ticket | skip |
| Unclear, any risk flag, or large effort | ask |
| Confirmed, in scope, small or medium effort, no risk | fix |

Severity sets the work order. It never lowers the risk check.

### What the plugin enforces

These rules do not depend on the agent following instructions:

- **Only your answer resumes work.** The plugin records answers from your real prompts (`D-3 1`). The agent has no tool to record one. Plugin-sent messages are ignored as answers.
- **Pause on open decisions.** While a decision is open, the session cannot run `git commit` or `git push`.
- **Never** force-push, merge, mark ready (`gh pr merge`, `gh pr ready`), or skip hooks (`--no-verify`) in a session that owns a PR, while the plugin is on.
- **Decision text must pass an English check.** The plugin refuses text with sentences over 20 words (instructions) or 25 words (descriptions), contractions, Latin abbreviations, or semicolons.
- **Edited comments reopen.** If a reviewer edits a finding, the old assessment and any open decision are withdrawn.
- **Comment text is untrusted.** Findings are returned inside `<untrusted-comment>` tags. Wake messages never contain comment bodies.

### Simplified English

The check covers a subset of the ASD-STE100 rules. It does **not** check the approved dictionary. A decision that passes is not certified as compliant.

Example decision request:

```text
Decision D-12: Invoice status change

Problem
The reviewer reports that the new status can stop payment processing.
The code check confirms this problem.

Risk
The fix also changes how the system handles old invoices.
The tests do not show if this change is safe.

Recommended action
Keep the old invoice behavior.
Add a separate check for the new status.

Choose one action
1. Make the recommended fix. (Recommended)
2. Check the old invoice behavior first.
3. Leave the code unchanged.

How to answer
Write "D-12" and the number of your choice.
Example: D-12 1

Current state
Automatic changes to this PR are paused.
No fix for this finding has a commit.
```

## Limits

- Monitoring runs only while OpenCode runs. Restarting stops it. Decisions and finding state are saved, and the pause still applies after a restart. Ask the agent to register the PR again to resume.
- Only the session that registered the PR is gated. Subagents are not.
- The widget shows the state of the project where the TUI runs. A plugin instance exists per project.
- The GitHub adapter reads comments, reviews, and the PR head with `gh api`. Copilot's severity is read from the comment text when present. Otherwise the agent rates it.
- The plugin never merges. A person must.

## Development

```bash
npm test -w opencode-pr-followup
npm run typecheck -w opencode-pr-followup
npm run verify:load -w opencode-pr-followup
```

`verify:load` starts a private OpenCode server in a temporary HOME. It confirms that the plugin is active and the skill is registered. It calls no model.
