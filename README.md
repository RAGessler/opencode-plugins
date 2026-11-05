# opencode-plugins

OpenCode V2 plugins by RAGessler. Each plugin is a separate npm package, so you install only what you want.

| Package | Plugin | What it does |
| --- | --- | --- |
| [`opencode-standup`](packages/costs) | TUI | Sidebar cost widget for OpenCode V2 |
| [`opencode-pr-followup`](packages/pr-followup) | Server | Watches a pull request, fixes safe review feedback, and asks you before risky changes |

## Development

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

Both commands run in every package. Use `-w <package-name>` to run one package.

Releases use one tag per package: `costs-v<version>` and `pr-followup-v<version>`. The tag must match the version in that package's `package.json`.

## Legacy Python application

The original Python TUI is deprecated and does not work with OpenCode V2. It stays in `src/`, `tests/`, and `pyproject.toml` for existing users. See [docs/legacy-python.md](docs/legacy-python.md).
