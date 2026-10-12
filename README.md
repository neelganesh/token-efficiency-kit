# token-efficiency-kit

Cut the tokens your coding agent loads and reads, without adding any. Works with **Claude Code, Codex and GitHub Copilot**. Local only: no network calls, no telemetry, no gateway, no hooks.

## One-line install (asks before every change)

```bash
git clone --depth 1 --branch v1.0.0 https://github.com/neelganesh/token-efficiency-kit.git && node token-efficiency-kit/kit.mjs setup
```

PowerShell 5: replace `&&` with `;`. For Copilot, run inside your repo and add `--repo .` to `setup`. Needs Node 18+ and git.

`setup` verifies the kit, audits what you already have, records your **baseline**, then asks y/N for each change and shows the always-loaded tokens it would add. It refuses to add more than 600 (`--max-added N`). Rerunning is safe: files are backed up once as `*.pre-token-kit` and only our marked block is replaced.

Prefer an agent to do it all with one confirmation? Paste [AGENT-INSTALL-PROMPT.md](AGENT-INSTALL-PROMPT.md).

## Rule: our files must not add cost

Everything always-loaded is re-read on every model call. So:
- The Claude install adds about 400 tokens total (routing block + one agent description). The rules block (~280) is **skipped** if the ponytail plugin already supplies equivalent rules.
- The ponytail skill (`--with-ponytail-skill`) and caveman (`--with-caveman`) are **opt-in**: even their descriptions are always-loaded.
- No hooks, no MCP servers, no statusline.
- `node kit.mjs budget` prints the exact cost. `setup` prints "tokens added" and enforces the cap.
- You verify the result yourself, below. If the number goes up, undo.

## Measure it (2 minutes)

The fixed prefix (system prompt, tools, skills, CLAUDE.md) is the first call of every session, so it is easy to measure. Full guide: [MEASURE.md](MEASURE.md).

1. Run `setup` (it saves your baseline: the median first-call size of your last 5 sessions).
2. Open a **new session in an empty folder** and send exactly: `Reply with exactly one word: ok`
3. Run `node token-efficiency-kit/kit.mjs measure`. It prints the new first-call size against your baseline.

In our test, disabling a 300-skill plugin and three connectors cut the prefix from 98,395 to 77,196 tokens (-22%). Removing two idle MCP servers changed it by 34 tokens: idle servers are cheap, always-loaded text is not.

## What is in it, and the evidence

| Piece | Evidence | Default |
|---|---|---|
| `AGENTS.md` rules (~280 tokens) | Derived from ponytail's rules; cut over-building | on (skipped if ponytail plugin is on) |
| Model routing + `opus-reviewer` agent (Claude Code) | Anthropic pricing: Haiku ~20x cheaper than Sonnet, Opus 2x Sonnet | on |
| `skills/ponytail` (MIT, vendored) | Author's benchmark: -45% output tokens, -26% cost, same hidden-test pass rate (87/90 vs 86/90). Self-run. | off |
| `optional/caveman` (Apache-2.0, vendored) | Author's own numbers: ~3% output, ~0% of the total bill; no saving on per-request Copilot billing | off |
| RTK | Real for noisy shell output; its headline "% saved" is inflated. Not bundled. | separate |

Measured on a real 5-week history: output was ~4-7% of weighted cost, and cache reads dominated, so output-trimming tools cannot move the bill much. The levers that matter: a small fixed prefix, short sessions, and a healthy prompt cache (keep it above 90%). [AUDIT.md](AUDIT.md) has the security and telemetry findings for each tool.

## Commands

| Command | Effect |
|---|---|
| `setup [--yes] [--repo PATH] [--max-added N]` | guided audit + install + baseline |
| `audit [--strict]` | read-only report (gateways, plaintext keys, cloud skills, skill count, RTK) |
| `install --tool claude\|codex\|copilot\|all` | non-interactive install; flags `--with-ponytail-skill`, `--with-caveman`, `--apply-settings`, `--force` |
| `fix [--dry-run]` | moves Caveman Cloud skills to `skills.disabled/`, disables RTK telemetry if on |
| `budget` | tokens each install adds |
| `measure [--last N]` | first-call size, calls and cache-hit per session, plus change vs baseline |
| `verify` | checksums of shipped files; Copilot file equals `AGENTS.md` |

Tests: `node --test kit.test.mjs`.

## RTK (optional, install separately)

Pin a version and prefer a build from a reviewed tag: `cargo install --locked --git https://github.com/rtk-ai/rtk --tag <tag>` (a self-built binary has no telemetry URL). Set `RTK_TELEMETRY_DISABLED=1`, decline consent at `rtk init`, inspect the hook it writes, and add `exclude_commands` for `cat` and `git diff`. Treat `rtk gain` as a rough guide. It cannot affect more than the Bash share of tool output (44% in our data; Read was 37%).

## Layout

`AGENTS.md` canonical rules · `.github/copilot-instructions.md` identical copy · `claude/` routing block and agent · `skills/ponytail`, `optional/caveman` vendored · `kit.mjs` · `kit.test.mjs` · `AUDIT.md` · `MEASURE.md` · `AGENT-INSTALL-PROMPT.md` · `THIRD_PARTY/` licenses.

Vendored: ponytail from HEAD 9b58c1ff (2026-10-10, MIT, after v5.1.0); caveman from v3.2.0 / 2e08b91 (Apache-2.0). Update by diffing upstream, then regenerate `checksums.sha256`.
