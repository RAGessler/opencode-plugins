# opencode-standup

## OpenCode V2 sidebar cost plugin

The V2 replacement is a **TUI-only plugin**, tested against **OpenCode 2.2.5**.
It adds a compact section to your existing sidebar, not another dashboard:

- Total OpenCode-reported cost across projects for the selected period
- Top three models and top three projects, ranked by dollars
- Today, Monday-start week, month, rolling sprint, all time, and inclusive custom dates
- Saved period selection, automatic refresh, and a compact home-screen total
- No AI calls, transcript collection, direct database access, or separate server

The original Python app is **deprecated, unsupported, and not compatible with
OpenCode V2**. No more Python wheel releases will be published; existing GitHub
releases remain available. Use this plugin for OpenCode V2.

### Install from npm

OpenCode's documented install path for a TUI-only plugin is the global
`cli.json` plugin list. OpenCode installs and loads the package; no separate
installer script or `npm install` command is needed. Edit
`~/.config/opencode/cli.json`, or `$XDG_CONFIG_HOME/opencode/cli.json` when set,
and **merge** the following entry into its existing `plugins` array. Preserve
other settings and plugin entries. There is no project-local `cli.json`.

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "opencode-standup@1.0.0",
      "options": {
        "period": "sprint",
        "refreshSeconds": 60,
        "sprint": {
          "anchor": "2026-10-26",
          "days": 14
        }
      }
    }
  ]
}
```

Keep the file's existing `$schema` (`https://opencode.ai/v2/cli.json`). The
package exports `./tui` directly as TypeScript/TSX; OpenCode compiles it. CLI
configuration reloads after saving; use `/reload` if needed. The widget follows
normal sidebar visibility and does not force the sidebar open on narrow
terminals. To uninstall, remove this plugin entry and save the file.

For checkout-based development, run `npm ci --ignore-scripts` from the repository
root and use the absolute path of `packages/costs` as the entry's `package` value
instead of the npm package specifier.

### Controls and rolling sprints

- Click the widget heading to collapse or expand its model/project details; the
  total stays visible in the compact bar. The collapsed preference is saved.
- `/costs` opens the period picker.
- `/costs today`, `/costs week`, `/costs month`, `/costs sprint`, or `/costs all` selects a period.
- `/costs all` shows all recorded usage through now.
- `/costs custom` asks for a start and end date (`YYYY-MM-DD`, both inclusive).
- `/costs collapse`, `/costs expand`, or `/costs toggle` also controls the bar.
- `/costs refresh` refreshes immediately.
- **Costs: change period**, **Costs: collapse or expand**, and **Costs: refresh** are available in the command palette.

The selection is persisted and synchronized across TUI instances. `options.period`
is the initial default, not an override of a previously saved selection.
`refreshSeconds` accepts integers from 15 to 3600. The sprint anchor is a local
calendar date and `days` is an integer from 1 to 366. Changing these options reloads
the plugin.

With the defaults, sprints are **October 26–November 8**, **November 9–22**, then
**November 23–December 6**, 2026. November 9 belongs only to the new sprint.
Calendar arithmetic preserves boundaries across daylight saving time. The widget
advances at the next refresh after midnight without requiring a restart.

### Accounting, privacy, and limitations

The plugin calls V2's **experimental session statistics API** once per known
project, including archived projects. It uses that API's fork-aware usage
projection rather than adding session or family lifetime totals. Inherited fork
history is excluded; new fork-family and subagent usage is counted once. Dates
follow the usage message's creation time, not the session's creation time.
Worktrees are grouped by OpenCode project ID. Reasoning variants are combined
under their model; the same model ID on different providers remains separate.

The rankings reconcile to the total. Compaction costs that the API includes
without model attribution appear as **Unattributed**. The API currently excludes
title-generation charges. Values are **OpenCode-reported costs, not invoices**:
subscription billing and provider charges can differ. The upstream API maps
missing historical prices to zero, so it cannot distinguish those from genuine
zero-cost usage. This plugin does not invent prices or claim billing completeness.

If an API request fails or cost data is invalid, the widget shows **unavailable**,
not a fabricated zero or partial total. A previous successful snapshot is kept
only for the same period and is explicitly marked **stale**. Archived sessions
remain included; deleting history from OpenCode can remove it from these totals.
The experimental API may change in later releases; there is no fallback to
database reads.

All queries use the connected TUI client's existing server and authentication,
including remote connections. Only aggregate usage and project metadata are read;
no prompts, assistant text, Jira/GitHub data, or model credentials are collected.
No additional model requests or model charges are generated by the widget.

### Plugin development and validation

Run these from the repository root:

```bash
npm run typecheck -w opencode-standup
npm test -w opencode-standup
npm run test:integration -w opencode-standup
npm run verify:live -w opencode-standup
npm pack --dry-run -w opencode-standup
```

Unit tests include real OpenTUI rendering at sidebar width. The integration check
requires `opencode` on `PATH`; it starts a private server under an isolated
temporary HOME/XDG tree, imports synthetic usage, exercises real fork operations,
and removes its own fixtures afterward. It never writes to the normal service or
calls a model. `verify:live` is a read-only check against an already-running local
service that reconciles project/model totals with global V2 statistics.

The release workflow publishes the npm package and attaches its tarball to a
GitHub Release when a `costs-v<package-version>` tag is pushed. Before the first
release, add an npm automation token with publish permission for
`opencode-standup` as the repository Actions secret `NPM_TOKEN`. The workflow
rejects tags that do not match `packages/costs/package.json`; the first tag for
this package is `costs-v1.0.0`.

Releases no longer build or attach Python wheels. Nothing is automatically
installed into your global configuration.

Dependency audit at implementation time: the pinned OpenCode/OpenTUI dependency
tree reports 26 moderate advisories, with no high/critical findings. npm does not
offer a compatible fix for the SDK dependency chain; no forced upgrades or
incompatible OpenTUI downgrades have been applied.
