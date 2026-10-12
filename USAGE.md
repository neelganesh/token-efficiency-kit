# Usage

Needs Node 18+ and git. Everything is local and read-only unless a command says it writes. Run commands from the kit folder as `node kit.mjs <command>`.

## 1. First time (about 5 minutes)

| Step | Command | What happens |
|---|---|---|
| 1 | `node kit.mjs inspect` | Shows what each agent loads before your first message, ranked waste, and fixes. Read-only. |
| 2 | `node kit.mjs audit` | Security view: gateways, plaintext keys, cloud skills, RTK telemetry. Read-only. |
| 3 | `node kit.mjs setup` | Guided: asks y/N for each change, shows tokens added, saves your baseline. |
| 4 | Apply the top findings from step 1, one at a time | Edit config yourself or let your agent do it (see the audit prompt). |
| 5 | New session in an empty folder, send `Reply with exactly one word: ok` | Produces a clean first call to measure. |
| 6 | `node kit.mjs measure` | Prints the new first-call size against your baseline. Keep the change only if it went down. |

## 2. Commands

### `inspect` : find what bloats the start of every session
```
node kit.mjs inspect [--tool claude|codex|copilot|all] [--repo PATH] [--no-usage]
```
- **claude**: `CLAUDE.md` files and their `@imports`, project auto-memory, user skills and agents, every enabled plugin's skills, commands, agents, MCP servers and SessionStart hook, MCP servers in `~/.claude.json` and `.mcp.json`, hooks in settings.
- **codex**: `~/.codex/AGENTS.md`, repo `AGENTS.md`, MCP servers in `config.toml`.
- **copilot**: `.github/copilot-instructions.md`, `AGENTS.md`, `.github/instructions/*`, `.vscode/mcp.json`.
- Compares the estimate with your **measured** first call so you see how much is fixed system overhead.
- Uses your own transcripts (Claude Code only; skip with `--no-usage`) to flag plugins, skills and MCP servers you never used.
- Findings are sorted by estimated tokens saved per session. Estimates are bytes/4: they cannot see MCP tool names, server instructions or hook output. **Trust `measure` for the real number.**
- Context bugs it catches: duplicate skill names, skill folders without `SKILL.md`, oversized descriptions, huge or double-imported `CLAUDE.md`, unused plugins, unused MCP servers, too many MCP servers, SessionStart hooks that inject text, a gateway that can break prompt caching.

### `audit` : security and telemetry check
```
node kit.mjs audit [--strict]
```
Flags third-party gateways, API keys stored in plaintext settings, Caveman Cloud skills, caveman CLI telemetry, RTK version and telemetry state, skill count above 60, oversized `CLAUDE.md`. `--strict` exits 1 on any WARN (for CI).

### `setup` : guided install
```
node kit.mjs setup [--yes] [--repo PATH] [--max-added N] [--dry-run]
```
Verifies the kit, runs `audit`, stores your baseline, then asks before each install. Refuses to add more than `--max-added` tokens (default 600). `--yes --dry-run` prints the plan and writes nothing.

### `rtk` : confirmed RTK install, hook and verification (VS Code Copilot first)
```
node kit.mjs rtk [--tool copilot|claude] [--scope repo|global] [--repo PATH] [--check] [--slim] [--yes] [--dry-run]
```
- **Guided (default):** shows current state, then asks y/N before each step: install RTK (winget / brew / cargo, pinned to audited 0.49.0 except brew), disable telemetry (plus `setx RTK_TELEMETRY_DISABLED 1` on Windows), run `rtk init --copilot` (repo) or `rtk init -g --copilot` (`--scope global`) or `rtk init -g` for Claude, and remove RTK's redundant instruction block (~260 tokens per request).
- **`--check`:** read-only PASS/WARN/FAIL table: binary, `rtk gain`, telemetry, rewrite engine, hook file, hook rewriting a real VS Code Copilot event, passthrough of other commands, `rtk verify`, `rg`. Ends with the **live check**: restart VS Code, ask agent mode to run `git status`, confirm a new row in `rtk gain --history`.
- **If RTK was installed but `rtk` is not found:** open a NEW terminal (the installer updates PATH for new shells only) and run `--check`.
- **`--yes`** answers yes to every step including the install: use only when you have already decided. **Undo:** `rtk init --uninstall --copilot` in the repo.

### `install` : non-interactive install
```
node kit.mjs install --tool claude|codex|copilot|all [--repo PATH] [--with-ponytail-skill] [--with-caveman] [--apply-settings] [--force] [--dry-run]
```
Writes only a marked block (`<!-- token-kit:start -->` ... `<!-- token-kit:end -->`), backs each file up once as `*.pre-token-kit`, skips the rules block if the ponytail plugin is on. `--apply-settings` sets `model: sonnet` and the Haiku subagent default if unset and no gateway is configured.

### `fix`
```
node kit.mjs fix [--dry-run]
```
Moves Caveman Cloud skills to `~/.claude/skills.disabled/` (move them back to undo) and turns RTK telemetry off if it is on.

### `budget`, `measure`, `verify`
- `budget`: always-loaded tokens each install would add.
- `measure [--last N]`: per session first-call size, number of calls, cache-hit %, and change versus your baseline. A cache-hit well below 90% in long sessions means something is breaking the prompt cache (model switches, tool or MCP changes mid-session, `/compact`).
- `verify`: checks the shipped files against `checksums.sha256` and that the Copilot file equals `AGENTS.md`.

## 3. Let an agent do it

- Install everything with one confirmation: [AGENT-INSTALL-PROMPT.md](AGENT-INSTALL-PROMPT.md)
- Audit any agent's initial context and get personalised fixes: [AGENT-AUDIT-PROMPT.md](AGENT-AUDIT-PROMPT.md)

## 4. Undo

- Restore `*.pre-token-kit` next to any file we changed, or delete the block between the two markers.
- Move folders back from `~/.claude/skills.disabled/`.
- Nothing else is written, except `~/.claude/.token-kit-baseline.json` (a tiny number, never loaded into context).

## 5. Habits that matter more than any tool

Start a new session per task, `/clear` between unrelated tasks, do not switch models mid-session, and keep always-loaded text short. See [MEASURE.md](MEASURE.md).

## `models` : list and set default models
```
node kit.mjs models [--tool claude|copilot] [--live] [--model ID] [--yes] [--dry-run]
```
- Asks which tool if you do not pass `--tool`, and asks before every write.
- **claude**: without `--live` it offers the aliases `sonnet` (main) and `haiku` (subagents), which always resolve to the newest model, so they never go stale. With `--live` it asks first, then makes **one read-only GET to `api.anthropic.com/v1/models`** using `ANTHROPIC_API_KEY` from your environment (never from files, never stored or printed; refuses any other host), shows the newest model per family, and lets you keep the aliases or pin a full ID. Writes `model` and `CLAUDE_CODE_SUBAGENT_MODEL` to `~/.claude/settings.json` with a backup. Skipped when `ANTHROPIC_BASE_URL` is set. Applies to new sessions.
- **copilot** (Copilot CLI): GitHub documents no API that lists the models of your plan, so the kit does not guess one. Run `/model` in Copilot CLI to see them, then pass an ID (or `auto`): the kit sets `model` in `~/.copilot/settings.json` (`$COPILOT_HOME` respected) with a backup. VS Code Copilot Chat uses its model picker; no default-model setting is documented. Repo allowlists (`.github/allowed_models.txt`) and managed defaults are admin policy and are never touched.
- For a workplace, delete `models.mjs` to remove the only code that can send a key over the network.
