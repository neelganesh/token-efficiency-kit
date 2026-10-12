# token-efficiency-kit

Cut the tokens your coding agent loads and reads, without adding any. Works with **Claude Code, Codex and GitHub Copilot**. By default the kit's own code makes no network calls and has no telemetry, gateway or hooks. Two optional, confirmed actions touch the network: the RTK install (runs your package manager) and `models --live` (one read-only GET to Anthropic's `/v1/models`, key from your environment only). The second lives in its own file, `models.mjs`; delete it for a fully offline kit.

## One-line install (asks before every change)

```bash
git clone --depth 1 --branch v1.3.0 https://github.com/neelganesh/token-efficiency-kit.git && node token-efficiency-kit/kit.mjs setup
```

PowerShell 5: replace `&&` with `;`. For Copilot, run inside your repo and add `--repo .` to `setup`. Needs Node 18+ and git.

`setup` verifies the kit, audits what you already have, records your **baseline**, then asks y/N for each change and shows the always-loaded tokens it would add. It refuses to add more than 600 (`--max-added N`). Rerunning is safe: files are backed up once as `*.pre-token-kit` and only our marked block is replaced.

Not sure what bloats your setup? Run `node token-efficiency-kit/kit.mjs inspect` (read-only): it lists what each agent loads before your first message, your unused plugins, skills and MCP servers, and ranked fixes. All commands: [USAGE.md](USAGE.md). Prefer an agent? One-confirmation install: [AGENT-INSTALL-PROMPT.md](AGENT-INSTALL-PROMPT.md). Personalised audit of any agent: [AGENT-AUDIT-PROMPT.md](AGENT-AUDIT-PROMPT.md).

## GitHub Copilot in VS Code (most users): do this

In your repo (needs Node 18+ and git; Windows, macOS or Linux):

```bash
git clone --depth 1 --branch v1.3.0 https://github.com/neelganesh/token-efficiency-kit.git ../token-efficiency-kit
node ../token-efficiency-kit/kit.mjs inspect --tool copilot --repo .     # what Copilot loads per request, with fixes
node ../token-efficiency-kit/kit.mjs setup --repo .                      # adds a ~270-token rules file, asks first
node ../token-efficiency-kit/kit.mjs rtk --tool copilot --repo .         # optional: shell-output compression
```

The `rtk` command shows the install command and **asks before every step**: install (`winget` on Windows, pinned to the audited 0.49.0; `brew` on macOS; `cargo` on Linux), telemetry off, writing the hook, and removing RTK's redundant 260-token instruction block. It then verifies the install (see below). Restart VS Code afterwards.

Cost note: GitHub now bills Copilot **per token** in AI credits (1 credit = $0.01), with cached input at 10% of the input price (GPT-6 Sol $2.00 input / $0.20 cached / $10.00 output per 1M tokens; GPT-6 Luna $0.10 / $0.01 / $0.50; context above 272K costs more). So context size and caching matter in Copilot as in Claude Code. Older plans may still use the legacy per-request billing; check which applies to you. The always-loaded file is sent with every request, so keep it small (this one is ~270 tokens). Model guidance for GPT-6 Sol and Luna: [COPILOT-MODELS.md](COPILOT-MODELS.md).

## Rule: our files must not add cost

Everything always-loaded is re-read on every model call. So:
- The Claude install adds about 490 tokens (rules ~270 + routing ~100 + one agent description ~115), or about 220 if the ponytail plugin is on, because the rules block is **skipped** when that plugin already supplies equivalent rules.
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
| `optional/caveman` (Apache-2.0, vendored) | Author's own numbers: ~3% output, ~0% of the total bill; on a per-token Copilot plan expect only the small output share (measure before trusting) | off |
| RTK | Real for noisy shell output; its headline "% saved" is inflated. Not bundled. | separate |

Measured on a real 5-week history: output was ~4-7% of weighted cost, and cache reads dominated, so output-trimming tools cannot move the bill much. The levers that matter: a small fixed prefix, short sessions, and a healthy prompt cache (keep it above 90%). [AUDIT.md](AUDIT.md) has the security and telemetry findings for each tool.

## Commands

| Command | Effect |
|---|---|
| `inspect [--tool claude\|codex\|copilot\|all] [--repo PATH] [--no-usage]` | what each agent loads before your first message; MCP, plugin and skill waste; ranked fixes |
| `rtk [--tool copilot\|claude] [--scope repo\|global] [--repo PATH] [--check] [--slim]` | confirmed RTK install + hook + PASS/FAIL verification |
| `models [--tool claude\|copilot] [--live] [--model ID]` | Claude: list the newest models live (opt-in, `ANTHROPIC_API_KEY` from env) and set `model` and the subagent default. Copilot CLI: set `model` from an ID you give (no documented listing API) |
| `setup [--yes] [--repo PATH] [--max-added N] [--with-rtk]` | guided audit + install + baseline; offers RTK at the end |
| `audit [--strict]` | read-only report (gateways, plaintext keys, cloud skills, skill count, RTK) |
| `install --tool claude\|codex\|copilot\|all` | non-interactive install; flags `--with-ponytail-skill`, `--with-caveman`, `--apply-settings`, `--force` |
| `fix [--dry-run]` | moves Caveman Cloud skills to `skills.disabled/`, disables RTK telemetry if on |
| `budget` | tokens each install adds |
| `measure [--last N]` | first-call size, calls and cache-hit per session, plus change vs baseline |
| `verify` | checksums of shipped files; Copilot file equals `AGENTS.md` |

Tests: `node --test kit.test.mjs`.

## RTK (optional, guided, verified)

```bash
node kit.mjs rtk --tool copilot --repo .      # or --tool claude ; add --scope global for ~/.copilot
node kit.mjs rtk --check --tool copilot --repo .   # verify only, changes nothing
node kit.mjs rtk --slim --repo .              # remove RTK's redundant instruction block
```

What `rtk` does, asking y/N before each step: install RTK (`winget install --id rtk-ai.rtk --exact --version 0.49.0` on Windows, `brew install rtk` on macOS, `cargo install --locked --git ... --tag v0.49.0` on Linux; never a piped download), turn telemetry off (`rtk telemetry disable`, plus a persistent `RTK_TELEMETRY_DISABLED=1` on Windows via `setx`), run `rtk init --copilot` (writes `.github/hooks/rtk-rewrite.json`) or `rtk init -g` for Claude Code, and offer to remove RTK's instruction block from `copilot-instructions.md`.

**Verification** (`--check`, also run at the end of the guided flow) prints PASS/WARN/FAIL for: the binary and its version; `rtk gain` working (rules out the unrelated "Rust Type Kit" package with the same name); telemetry off; the rewrite engine (`git status` becomes `rtk git status`); the hook file; the hook rewriting a real VS Code Copilot event and leaving other commands alone; `rtk verify` (hook integrity and 154 filter tests); and `rg` being available. Then the **live check** proves the agent really uses it: restart VS Code, ask agent mode to "run git status in the terminal", and `rtk gain --history` must show a new `git status` row.

Notes: for Copilot CLI the hook only suggests the rewrite, so keep RTK's instruction block there; filters can truncate output, so add `exclude_commands` for `cat` and `git diff` if you need exact text; treat `rtk gain` totals as rough. RTK can only touch Bash output (44% of tool output in our data; Read was 37%). Undo: `rtk init --uninstall --copilot` in the repo.

## Layout

`USAGE.md` · `AGENT-AUDIT-PROMPT.md` · `inspect.mjs` · `AGENTS.md` canonical rules · `.github/copilot-instructions.md` identical copy · `claude/` routing block and agent · `skills/ponytail`, `optional/caveman` vendored · `kit.mjs` · `kit.test.mjs` · `AUDIT.md` · `MEASURE.md` · `AGENT-INSTALL-PROMPT.md` · `THIRD_PARTY/` licenses.

Vendored: ponytail from HEAD 9b58c1ff (2026-10-10, MIT, after v5.1.0); caveman from v3.2.0 / 2e08b91 (Apache-2.0). Update by diffing upstream, then regenerate `checksums.sha256`.
