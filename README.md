# token-efficiency-kit

Cut what your coding agent loads and reads, without adding any. One checkbox setup for **Claude Code, GitHub Copilot (VS Code and CLI), Codex, Cursor, Windsurf and Cline**. Plan before any change, one confirmation, every change logged and reversible, no dependencies.

## Set up in one prompt (recommended)

Paste the prompt in [PROMPT.md](PROMPT.md) into your coding agent. It pulls this project at a pinned release, shows a checkbox menu, audits what it installs (RTK is audited live against the newest release), applies your choices after one confirmation, and tells you how to verify.

## Or one command

```bash
git clone --depth 1 --branch v2.0.2 https://github.com/neelganesh/token-efficiency-kit.git && node token-efficiency-kit/kit.mjs setup
```

Works on macOS, Linux and Windows (CI runs the tests on all three). On macOS RTK installs with `brew install rtk` (Homebrew cannot pin a version, so the kit audits whatever version brew offers); on Windows PowerShell 5, replace `&&` with `;`. Needs Node 18+ and git. You get a checkbox list (type numbers to toggle, Enter to continue):

```
 [x] 1. Core rules file: smallest change, read less, concise replies  (+272 tokens; the token saver)
 [ ] 2. Agentic orchestration (Claude Code): Sonnet main, Haiku helpers, Opus reviewer  (+217 tokens; better use of models, NOT a cost saver)
 [ ] 3. Ponytail skill: minimal-diff coding mode  (+106 tokens)
 [ ] 4. Caveman skill: terse replies  (+64 tokens)
 [ ] 5. RTK shell-output compression: live audit of the latest release, then install
 [ ] 6. Clean up: move Caveman Cloud skills aside, disable RTK telemetry
```

Then which tools get the rules (detected ones pre-ticked), then the **plan with the tokens added per tool**, then one "Apply this plan?". Nothing is written before that answer; `--dry-run` shows the plan and writes nothing; adding more than 600 tokens per tool is refused (`--max-added N`).

## What each component is, and the evidence

| Component | Evidence | Default |
|---|---|---|
| Core rules file (~270 tokens) | Distilled from ponytail's rules; cuts over-building and shortens replies. The only component aimed at saving tokens. | on |
| Agentic orchestration (Claude Code) | Sonnet main, Haiku for mechanical subagents, an Opus reviewer agent. About using each model well, **not a cost saver**: it adds ~217 tokens. | off |
| Ponytail skill (MIT, vendored) | Author's benchmark: -45% output tokens, -26% cost, same hidden-test pass rate (87/90 vs 86/90). Self-run, on Claude. Skipped if the ponytail plugin is already on. | off |
| Caveman skill (Apache-2.0, vendored) | Author's own numbers: ~3% output vs a plain "be concise" control, ~0% on the total bill. | off |
| RTK | Real for noisy shell output; its headline "% saved" is inflated. Not bundled; installed after a live audit. | off |
| Clean-up | Moves Caveman Cloud skills (they send data to a third party) to `skills.disabled/`; turns RTK telemetry off. | on if found |

On a real 5-week history, output was ~4-7% of weighted cost and cache reads dominated, so output trimming moves the bill little. What matters: a small fixed prefix, short sessions, a healthy prompt cache.

## Supported tools (add your own in one line)

Where the rules go is data, in [targets.json](targets.json). To support another IDE, add an entry (`file`, `mode`: `block` for a shared file, `file` for a rules file we own, optional `header` such as front matter).

| Target | File | Mode |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | block |
| Codex | `~/.codex/AGENTS.md` | block |
| GitHub Copilot (VS Code, CLI) | `.github/copilot-instructions.md` | block |
| Any AGENTS.md reader | `AGENTS.md` | block (duplicates tokens if Copilot or Codex also reads it) |
| Cursor | `.cursor/rules/token-kit.mdc` | file, `alwaysApply: true` |
| Windsurf | `.windsurf/rules/token-kit.md` | file |
| Cline | `.clinerules/token-kit.md` | file |

The Cursor, Windsurf and Cline folders follow each tool's documented rules location; confirm on your version. The skills and the orchestration component are Claude Code only.

## Auditable and reversible

- **Plan first.** Everything it will do is listed, with token costs, before the single confirmation.
- **Log.** Every write and move is appended to `~/.token-kit/log.jsonl`; `node kit.mjs log` prints it.
- **Undo.** `node kit.mjs uninstall [--dry-run]` removes our marked blocks and files, keeps your content, and leaves anything you edited. First backups are saved as `*.pre-token-kit`.
- **Verify the kit.** `node kit.mjs verify` checks shipped files against `checksums.sha256`. `node --test` runs the test suite.
- **See your own setup.** `node kit.mjs inspect` ranks what your agents load before your first message; `node kit.mjs audit` flags gateways, plaintext keys, cloud skills, telemetry.
- **Network.** The default flow is offline. The only networked paths are optional and confirmed: the RTK flow (git, and your package manager) and `models --live` (one call to Anthropic's models API). Delete `models.mjs` for a kit with no key-sending code. [AUDIT.md](AUDIT.md) records what was reviewed and what was not.

## RTK: live audit, then install

`node kit.mjs rtk --audit-latest` lists RTK's releases, picks the newest one installable on your platform, clones it read-only into a temp folder, diffs it against the release this kit reviewed (0.49.0) and flags: new network hosts, new dependencies, changes to `build.rs`, install and release scripts, telemetry code, the hooks written to your agent config, process spawning, `unsafe`. Test code is ignored. It prints the report and a `sensitive.diff` to read. The verdict is a heuristic: **CLEAN** or **REVIEW**. Your agent (see the prompt) or you read the diff and decide; nothing is installed from a REVIEW release unless you pass `--version` yourself.

Real example from this kit's own run: 0.50.0 (the newest on Windows' winget) returned REVIEW because `build.rs`, the release workflow and `telemetry.rs` changed. Also: **winget does not carry 0.49.0 or 0.51.0**, so the kit offers the closest installable version and says its source was not reviewed.

Install, hook and verification (`node kit.mjs rtk --tool copilot --repo .`, asks y/N at every step): install via winget / brew / cargo (never a piped download), telemetry off (plus `RTK_TELEMETRY_DISABLED=1` on Windows), `rtk init --copilot` (writes `.github/hooks/rtk-rewrite.json`), and removal of RTK's redundant ~260-token instruction block. `--check` verifies the binary, that `rtk gain` works (rules out the unrelated "Rust Type Kit" package), telemetry off, the rewrite engine, the hook file, the hook rewriting a real VS Code Copilot event, `rtk verify`, and `rg`. Then the live check: restart VS Code, ask agent mode to run `git status`, and `rtk gain --history` must show a new row.

## GitHub Copilot in VS Code

Copilot is billed per token in AI credits (1 credit = $0.01) with cached input at 10% of input, so context size matters as in Claude Code. Older plans may still use legacy per-request billing; check yours. Model guidance for GPT-6 Sol and Luna, prices and the A/B method: [COPILOT-MODELS.md](COPILOT-MODELS.md). Copilot has no first-call counter, so measure with AI credits on a few repeatable tasks.

## Measure (Claude Code, 2 minutes)

`setup` saves your baseline (median first-call size of your last 5 sessions). Open a **new session in an empty folder**, send `Reply with exactly one word: ok`, run `node kit.mjs measure`. In our test, disabling a 300-skill plugin and three connectors cut the prefix from 98,395 to 77,196 tokens (-22%); removing two idle MCP servers changed it by 34. Full guide: [MEASURE.md](MEASURE.md).

## More

[USAGE.md](USAGE.md) all commands · [PROMPT.md](PROMPT.md) one-prompt setup · [AGENT-AUDIT-PROMPT.md](AGENT-AUDIT-PROMPT.md) personalised audit of any agent · [COPILOT-MODELS.md](COPILOT-MODELS.md) · [MEASURE.md](MEASURE.md) · [AUDIT.md](AUDIT.md) · `THIRD_PARTY/` licenses.

Layout: `kit.mjs` (commands) · `wizard.mjs` (menu, plan, log, uninstall) · `rtk.mjs`, `rtk-audit.mjs` · `inspect.mjs` · `models.mjs` (optional) · `targets.json` · `AGENTS.md` and `.github/copilot-instructions.md` (identical rules) · `claude/` · `skills/ponytail`, `optional/caveman` (vendored: ponytail HEAD 9b58c1ff MIT, caveman v3.2.0 Apache-2.0).
