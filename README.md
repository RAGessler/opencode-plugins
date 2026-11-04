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

For checkout-based development, run `npm ci --ignore-scripts` from the repo and
use the absolute checkout path as the entry's `package` value instead of the npm
package specifier.

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

```bash
npm run typecheck
npm test
npm run test:integration
npm run verify:live
npm pack --dry-run
```

Unit tests include real OpenTUI rendering at sidebar width. The integration check
requires `opencode` on `PATH`; it starts a private server under an isolated
temporary HOME/XDG tree, imports synthetic usage, exercises real fork operations,
and removes its own fixtures afterward. It never writes to the normal service or
calls a model. `verify:live` is a read-only check against an already-running local
service that reconciles project/model totals with global V2 statistics.

The release workflow publishes the npm package and attaches its tarball to a
GitHub Release when a `v<package-version>` tag is pushed. Before the first
release, add an npm automation token with publish permission for
`opencode-standup` as the repository Actions secret `NPM_TOKEN`. The workflow
rejects tags that do not match `package.json`; the first tag for this package is
`v1.0.0`.

The npm package is released on version tags. Releases no longer build or attach
Python wheels. Nothing is automatically installed into your global configuration.

Dependency audit at implementation time: the pinned OpenCode/OpenTUI dependency
tree reports 26 moderate advisories, with no high/critical findings. npm does not
offer a compatible fix for the SDK dependency chain; no forced upgrades or
incompatible OpenTUI downgrades have been applied.

---

## Deprecated legacy Python application (OpenCode V1 only)

This standalone Python TUI is unsupported and does not work with OpenCode V2.
No additional Python wheel releases will be made. Historical wheel downloads
remain attached to the existing [GitHub Releases](https://github.com/RAGessler/opencode-standup/releases).
For supported OpenCode V2 usage, install the plugin described above.

`opencode-standup` is a Textual TUI command center for OpenCode sessions across your repositories.

It provides:

- A standup view grouping sessions by project for today, the last workday, this week, or all time
- A current sprint view for September 14 through September 25, 2026
- An on-demand AI summary of the previous workday using OpenCode chat and Jira context
- Cost and token rollups, including subagent spend
- A GitHub activity view for pull requests you opened, merged, reviewed, or commented on
- Session rename, archive, unarchive, and resume actions

## Requirements

- Python 3.10 or newer
- OpenCode installed and usable from the terminal
- An OpenCode session database at `~/.local/share/opencode/opencode.db`

The app reads OpenCode's SQLite database directly. It also starts `opencode serve` on demand when you rename or archive a session, and runs `opencode <directory> --session <id>` when you open a session. The OpenCode database schema and REST API are therefore part of the compatibility surface.

## Historical setup (existing wheels only; deprecated)

These instructions apply only to existing Python wheel downloads and OpenCode
V1 installations. Future GitHub releases contain the V2 plugin package, not a
Python wheel.

### 1. Configure GitHub access, if needed

The legacy tool was distributed as a wheel attached to GitHub Releases. No further Python wheels will be published. If you already have a legacy installation, its GitHub activity setup still works as described below.

You can also configure a GitHub personal access token (classic) with repository read access using environment variables:

```bash
export OPENCODE_STANDUP_GITHUB_USERNAME=YOUR_GITHUB_USERNAME
export OPENCODE_STANDUP_GITHUB_TOKEN=YOUR_GITHUB_TOKEN
```

The token is used only for GitHub API and release-asset access.

### 2. Install an existing legacy wheel

If you already have a legacy wheel, it can still be installed with `pipx`. No newer Python wheel will be released, and the app does not work with OpenCode V2.

```bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
pipx install /path/to/opencode_standup-0.1.0-py3-none-any.whl
```

The legacy wheel installs its dependencies from public PyPI. Do not expect the legacy in-app update check to find newer Python wheels.

### 3. Check prerequisites

```bash
python3 --version
opencode --version
test -f "$HOME/.local/share/opencode/opencode.db" && echo "OpenCode database found"
```

Python must be 3.10 or newer. If the database check fails, launch OpenCode and create or use at least one session first, then check the path again.

If the command is not found afterward, add the launcher directory to the current shell's `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add the same line to `~/.zshrc` or `~/.bashrc` to make it permanent, then open a new terminal or reload the file.

### 4. Launch it

```bash
opencode-standup
```

The default view shows sessions from the previous workday. Use the keybindings below to change the time range, refresh, or open a session.

## Usage

```bash
opencode-standup
opencode-standup --scope week
opencode-standup --scope sprint
opencode-standup --date 2026-09-15
opencode-standup --days-ago 1
opencode-standup --db /path/to/opencode.db
```

The database path can also be configured with `OPENCODE_STANDUP_DB`:

```bash
OPENCODE_STANDUP_DB=/path/to/opencode.db opencode-standup
```

The command exits with an error if the configured database does not exist.

In the TUI, press `?` for the full keybinding list. The primary bindings are:

- `1` through `5`: change the standup time scope, including the current sprint
- `s`: generate an AI summary when the selected scope is Last workday
- `[` and `]`: switch between the Standup and GitHub tabs
- `g`: refresh GitHub activity
- `e`: rename the selected session
- `x`: archive the selected session
- `A`: show or hide archived sessions
- `u`: unarchive the selected archived session
- `o`: open the selected session in OpenCode
- `r`: refresh
- `Shift+U`: check for updates
- `q`: quit

Select a session row with the arrow keys before using an action. Rename and archive start a local `opencode serve` process only when needed. Unarchive writes directly to the OpenCode database because the current OpenCode API does not expose an unarchive operation.

### AI Standup Summary

When the selected scope is **Last workday**, press `s` to generate a summary above the normal overview. It contains a short narrative followed by bullets for progress, Jira work, blockers or risks, and next steps. The summary is generated on demand with the provider and model already configured for `opencode`.

The app sends bounded excerpts from relevant OpenCode session prompts and assistant responses, along with session metadata and Jira ticket metadata, to OpenCode. Tool output and reasoning are excluded. Jira enrichment uses the authenticated `twg` command for your Jira activity during the previous workday and is optional; if it is unavailable, the app generates a clearly labeled chat-only summary.

### GitHub Activity

The GitHub tab loads automatically in the background for the selected time scope. It shows pull requests you opened, pull requests you authored that were merged, pull requests you reviewed, and pull requests where you added a conversation comment in the `ShamrockTrading` organization. Inline code-review comments are represented by review activity rather than duplicated as comments. `o` opens the selected pull request in your browser and `g` refreshes the activity manually. GitHub searches return up to 100 recently updated matching pull requests per category; the All time view is also bounded to the most recent 366 days.

If GitHub credentials are not configured, switch to the GitHub tab and press `c`. The guided setup opens GitHub's token settings, asks for the token, validates it against `/user`, and stores it in `$XDG_CONFIG_HOME/opencode-standup/github.json` (or `~/.config/opencode-standup/github.json`) with owner-only permissions. Environment variables and `.netrc` remain supported and take precedence over the guided setup credentials.

GitHub activity uses the authenticated account returned by GitHub, not the configured username. It uses authenticated REST API searches with `OPENCODE_STANDUP_GITHUB_TOKEN` and `OPENCODE_STANDUP_GITHUB_USERNAME`, the `github.com` entry in `.netrc`, or credentials saved by the guided setup. The token must be able to read the `ShamrockTrading` repositories whose activity you want to see, including private repositories. A classic token needs the `repo` scope. A fine-grained token must be granted read access to the relevant organization repositories and pull requests. If ShamrockTrading uses SAML SSO, authorize the token for the organization in GitHub after creating it. Missing credentials, organization access, authentication errors, rate limits, and GitHub outages are shown as unavailable activity and do not block the standup view.

When generating the Last workday AI summary, the app adds up to 40 GitHub activity records and 4,000 characters of GitHub metadata such as repository, pull request number, title, activity type, and URL. It never sends the GitHub token to OpenCode and does not send GitHub comment bodies.

The context and process limits can be adjusted with environment variables:

```bash
OPENCODE_STANDUP_SUMMARY_MAX_CHARS=12000
OPENCODE_STANDUP_SUMMARY_SESSION_MAX_CHARS=2600
OPENCODE_STANDUP_SUMMARY_TIMEOUT=120
OPENCODE_STANDUP_JIRA_TIMEOUT=20
```

## Updating

The TUI checks the latest GitHub Release once per day in the background. It does not block startup if GitHub is unavailable or credentials are missing. When a release is available, the TUI shows the current and available versions and asks for confirmation before upgrading.

You can also update manually by downloading the newer wheel from the GitHub Release and running:

```bash
pipx install --force /path/to/opencode_standup-0.2.0-py3-none-any.whl
```

Press `Shift+U` in the TUI to check immediately for updates. The installed version is shown in the upper-right corner, and `!` appears there when an update is available. The update check requests release metadata from GitHub and the upgrade downloads the wheel attached to that GitHub Release. It does not upload OpenCode sessions, transcripts, or Jira data.

The legacy `scripts/install.sh` remains available for development from a source checkout. It installs that checkout in editable mode and is not the normal end-user installation path.

## Uninstalling

Remove the launcher and the dedicated virtual environment:

```bash
pipx uninstall opencode-standup
```

This does not modify OpenCode's database or sessions.

## Troubleshooting

### `opencode-standup: command not found`

The launcher directory is not on `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### `python3: command not found` or Python is too old

Install Python 3.10 or newer, then rerun the `pipx` installation command.

### `opencode database not found`

Check the default location:

```bash
ls -l "$HOME/.local/share/opencode/opencode.db"
```

If OpenCode stores its database elsewhere, pass it explicitly with `--db` or `OPENCODE_STANDUP_DB`.

### Rename or archive fails

Confirm that OpenCode is available on `PATH` and can start its server:

```bash
command -v opencode
opencode --version
opencode serve --help
```

### Open/resume fails

The selected session's repository directory must still exist, and the `opencode` executable must be available on `PATH`.

## Development

The repository is private, so contributors need GitHub access and an authenticated GitHub CLI or Git credential:

```bash
gh auth login
gh repo clone RAGessler/opencode-standup
cd opencode-standup
```

Create a development environment and install the project in editable mode:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --editable .
.venv/bin/opencode-standup --help
```

Basic validation:

```bash
.venv/bin/python -m compileall src
```

Build and audit release artifacts locally:

```bash
.venv/bin/python -m pip install build twine
rm -rf dist build
.venv/bin/python -m build
.venv/bin/python -m twine check dist/*
.venv/bin/python scripts/audit_package.py dist/*
```

Releases are created by pushing a version tag such as `v0.2.0`. GitHub Actions runs tests, audits the artifacts, attaches the wheel and source distribution to a GitHub Release, and publishes the release. Consumers download the wheel from that release; no Python package registry is required.

The application requires a real OpenCode database to launch the interactive TUI. Use `--db` to point it at a test database when validating locally.
