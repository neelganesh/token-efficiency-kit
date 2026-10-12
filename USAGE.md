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
