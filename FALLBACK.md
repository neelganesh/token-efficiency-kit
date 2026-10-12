# Fallback: only if the normal flow failed

Do not read this file unless `PROMPT.md` / `node kit.mjs` failed. It costs nothing when everything works because nothing loads it.

## Rules for the agent (apply first)
1. Stop at the first failure. Do not retry in a loop, do not "fix" by running other installers, do not pipe a download into a shell, do not disable verification.
2. Run `node kit.mjs log` (if it runs) to see what was already changed. Report that list to the user.
3. Find your failure below, do only that fix, tell the user, and ask before anything outside the table.
4. Network allowed: the git clone of this repo, and (only if the user chose RTK) the RTK steps. Nothing else.
5. If still stuck: undo (`node kit.mjs uninstall --dry-run`, then without `--dry-run` on a yes), and give the user the exact error text. Never print secrets.

## Failure -> action
| What failed | Do this |
|---|---|
| `git` or `node` missing | Tell the user to install Git and Node 18+ (nodejs.org, or `brew install node git`, or `winget install OpenJS.NodeJS Git.Git`). Stop until done. |
| `git clone` fails (proxy, auth, offline) | Ask the user to download the release zip for the tag from the repo's Releases page, unzip into an empty folder, and give you the path. Do not try other mirrors. |
| `node kit.mjs verify` fails | The files differ from the release. Do not run the kit. Re-clone once into a new folder. If it fails again, stop and report which file failed. |
| `node --test` fails | Report the failing test name. It may be OS-specific. Use the manual steps below instead of the wizard. |
| Menu or prompts do not work (no terminal input) | Run `node kit.mjs components` (JSON), ask the user in chat, run `node kit.mjs setup --yes --dry-run ...`, show the plan, and on a yes run it without `--dry-run`. |
| `refusing: <tool> ... tokens` (cap) | Working as designed. Drop a component or tool; raise `--max-added` only if the user says so. |
| `rtk --audit-latest` cannot list or clone | Skip the audit, tell the user the RTK source was not checked, and offer to skip RTK. Install an unaudited RTK only if the user says so in chat. |
| RTK install command fails | See "RTK manual", then `node kit.mjs rtk --check`. |
| `rtk --check` shows FAIL | `binary`: open a NEW terminal. `right package`: wrong `rtk` installed; uninstall it and use rtk-ai/rtk. `telemetry`: `rtk telemetry disable`. `hook`: re-run `node kit.mjs rtk --tool <t> --repo <path>`. Still FAIL: `rtk init --uninstall --copilot` (Claude: `rtk init -g --uninstall`) and report. |
| "not plain JSON" / skip messages | Leave that file alone. Add the block by hand (below). |
| Managed or enterprise policy blocks a write | Stop. Ask the user's admin. Do not work around it. |
| First-call size went up in `node kit.mjs measure` | Run the undo, report the numbers. |
| Crash with a stack trace | Report the message and the last `node kit.mjs log` lines. Use the manual steps. |

## Manual steps (no kit needed)
Rules text = the contents of `AGENTS.md` in this repo (~270 tokens). Put it, and nothing more, in the file for each tool the user chose:

| Tool | File | How |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | append inside `<!-- token-kit:start -->` ... `<!-- token-kit:end -->` |
| Codex | `~/.codex/AGENTS.md` | same markers |
| GitHub Copilot | `<repo>/.github/copilot-instructions.md` | same markers |
| Any AGENTS.md reader | `<repo>/AGENTS.md` | same markers (duplicates tokens if Copilot or Codex also read it) |
| Cursor | `<repo>/.cursor/rules/token-kit.mdc` | whole file; first lines `---`, `description: Token-efficient working rules`, `alwaysApply: true`, `---` |
| Windsurf | `<repo>/.windsurf/rules/token-kit.md` | whole file |
| Cline | `<repo>/.clinerules/token-kit.md` | whole file |

Before editing an existing file, copy it to `<name>.pre-token-kit`. Never delete the user's own content. Undo: remove the marked block, or delete the file you created.

Optional (Claude Code only): routing block from `claude/CLAUDE.snippet.md` (markers `token-kit-routing`), reviewer agent `claude/agents/opus-reviewer.md` to `~/.claude/agents/`, skills `skills/ponytail/SKILL.md` and `optional/caveman/SKILL.md` to `~/.claude/skills/<name>/SKILL.md`. Model defaults from `claude/settings.snippet.json` only if the user asks, merged by hand into `~/.claude/settings.json`.

## RTK manual
- Windows: `winget install --id rtk-ai.rtk --exact` (add `--version <v>` using a literal from `winget show --id rtk-ai.rtk --versions`).
- macOS: `brew install rtk`. Linux: `cargo install --locked --git https://github.com/rtk-ai/rtk --tag v<version>`, or the release page with its checksum verified by hand.
- Then: `rtk --version`, `rtk gain` (must work, else wrong package), `rtk telemetry disable`.
- Hook: Copilot in VS Code: `rtk init --copilot` in the repo. Claude Code: `rtk init -g`. Then `node kit.mjs rtk --slim` removes the redundant ~260-token block.
- Verify: `node kit.mjs rtk --check --tool <copilot|claude> --repo <path>`.

## Report format
One table: step, result, what you tried, current state of the user's files, how to undo. Say plainly what is left unfinished.
