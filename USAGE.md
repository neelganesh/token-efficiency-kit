# Usage

Needs Node 18+ and git. Run commands from the kit folder as `node kit.mjs <command>`. Everything is local and read-only unless a command says it writes; the only networked commands are `rtk` (git and your package manager) and `models --live`, both confirmed first.

## 1. First time (about 5 minutes)

| Step | Command | What happens |
|---|---|---|
| 1 | `node kit.mjs inspect` | Shows what each agent loads before your first message, ranked waste and fixes. Read-only. |
| 2 | `node kit.mjs audit` | Security view: gateways, plaintext keys, cloud skills, RTK telemetry. Read-only. |
| 3 | `node kit.mjs setup` | Checkbox menu, plan with tokens per tool, ONE confirmation, then apply. Saves your baseline. |
| 4 | Apply the top `inspect` findings one at a time | Optional; edit config yourself or let your agent do it ([AGENT-AUDIT-PROMPT.md](AGENT-AUDIT-PROMPT.md)). |
| 5 | New session in an empty folder, send `Reply with exactly one word: ok` | A clean first call to measure. |
| 6 | `node kit.mjs measure` | New first-call size against your baseline. Keep the change only if it went down. |

Prefer an agent to drive it? Paste [PROMPT.md](PROMPT.md).

## 2. Commands

### `setup` : the checkbox wizard
```
node kit.mjs setup [--components rules,orchestration,ponytail,caveman,rtk,cleanup]
                   [--targets claude,codex,copilot,agents-md,cursor,windsurf,cline]
                   [--repo PATH] [--yes] [--dry-run] [--max-added N] [--apply-settings] [--force]
```
1. Verifies the kit (`verify`), runs `audit`, saves your baseline.
2. Components menu: type numbers to toggle, `a` all, `n` none, Enter to continue. Then the tools menu (detected tools pre-ticked).
3. Prints the **plan** (every file, tokens added per tool). Refuses if any tool would exceed `--max-added` (default 600).
4. Asks **"Apply this plan?"** once. Closed or empty input means no. Nothing is written before the answer.
5. Applies, writes the change log, prints how to measure and undo.

Flags: `--components`/`--targets` skip the menus (for scripts and agents); `--yes` answers the confirmation (RTK is excluded unless `--allow-rtk-yes`, because it downloads software); `--dry-run` writes nothing and logs nothing; `--apply-settings` also sets `model: sonnet` and the Haiku subagent default for the orchestration component (skipped when a gateway is configured); `--force` installs the rules block even if the ponytail plugin already provides equivalent rules.

### `components` : machine-readable menu
`node kit.mjs components --repo PATH` prints JSON (components with token costs and notes, targets with a `detected` flag). Agents use it to draw their own multi-select UI.

### `rtk` : live audit, confirmed install, hook, verification
```
node kit.mjs rtk --audit-latest                 # list releases, diff the newest installable one against the reviewed 0.49.0, write report.md and sensitive.diff
node kit.mjs rtk [--tool copilot|claude] [--scope repo|global] [--repo PATH] [--version V] [--update] [--yes]
node kit.mjs rtk --check [--tool ...] [--repo PATH]   # read-only PASS/WARN/FAIL verification
node kit.mjs rtk --slim [--repo PATH]                 # remove RTK's redundant ~260-token instruction block
```
- **Guided (default):** shows current state; if RTK is missing (or `--update`) runs the live audit and offers the newest release only if the audit is CLEAN, else the closest older installable one; then asks y/N before each step: install, telemetry off, hook (`rtk init --copilot` or `rtk init -g`), instruction-block removal.
- **`--version V`:** install exactly V after you read the audit (winget wants its own literal, e.g. `v0.50.0`; the audit output prints it).
- **`--check` ends with the live check:** restart VS Code, ask agent mode to run `git status`, confirm a new row in `rtk gain --history`.
- If `rtk` is not found right after installing, open a NEW terminal (PATH updates only for new shells) and run `--check`. Undo: `rtk init --uninstall --copilot` in the repo.

### `inspect` : find what bloats the start of every session
```
node kit.mjs inspect [--tool claude|codex|copilot|all] [--repo PATH] [--no-usage]
```
Sizes `CLAUDE.md` files and `@imports`, auto-memory, skills, agents, every enabled plugin's skills/commands/agents/MCP servers/SessionStart hook, MCP servers, settings hooks (Claude); `AGENTS.md` and MCP config (Codex); `copilot-instructions.md`, `AGENTS.md`, `.github/instructions/*`, `.vscode/mcp.json` (Copilot). Compares with your measured first call, uses your Claude transcripts (skip with `--no-usage`) to flag plugins, skills and MCP servers you never used, and lists findings by estimated tokens saved. Estimates are bytes/4 and cannot see MCP tool names or hook output; trust `measure`.

### `audit`, `fix`, `models`
- `audit [--strict]`: gateways, plaintext keys, Caveman Cloud skills, caveman CLI telemetry, RTK version and telemetry, skill count, oversized `CLAUDE.md`. `--strict` exits 1 on any WARN.
- `fix [--dry-run]`: moves Caveman Cloud skills to `~/.claude/skills.disabled/` (move back to undo), turns RTK telemetry off.
- `models [--tool claude|copilot] [--live] [--model ID]`: optional. Claude: with `--live` makes one confirmed read-only call to `api.anthropic.com/v1/models` using `ANTHROPIC_API_KEY` from your environment, shows the newest model per family, and sets `model`/subagent (aliases recommended: they never go stale). Copilot CLI: no documented listing API, so you give an ID (see `/model`) and it sets `~/.copilot/settings.json`. Delete `models.mjs` for an offline kit.

### `budget`, `measure`, `verify`
- `budget`: always-loaded tokens each component adds.
- `measure [--last N]`: per-session first-call size, calls, cache-hit %, change versus your baseline. Cache-hit well below 90% in long sessions means something breaks the prompt cache (model switches, tool or MCP changes mid-session, `/compact`).
- `verify`: shipped files against `checksums.sha256`; Copilot file equals `AGENTS.md`.

### `log`, `uninstall`
- `log [--last N]`: every write and move this kit made (`~/.token-kit/log.jsonl`).
- `uninstall [--dry-run]`: removes our marked blocks (keeps your text), deletes files we own, leaves anything you edited, lists skills we moved. Settings changes are not auto-reverted: restore `settings.json.pre-token-kit`.

## 3. Habits that matter more than any tool

New session per task, `/clear` between unrelated tasks, no model switch mid-session, short always-loaded text. See [MEASURE.md](MEASURE.md).
