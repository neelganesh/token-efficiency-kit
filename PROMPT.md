# One prompt to set everything up

Paste the block into Claude Code, GitHub Copilot (agent mode), Codex, Cursor or any coding agent that can run shell commands (needs git and Node 18+). It pulls this project at a pinned release, shows a checkbox menu, audits what it installs (RTK is audited live), applies your choices after one confirmation, and tells you how to verify.

```
Set up token-efficient defaults from https://github.com/neelganesh/token-efficiency-kit at release tag v2.0.4. You are my installer: be careful, auditable and brief. Nothing changes until I confirm the plan.

HARD RULES
- Never pipe a download into a shell. Only network actions allowed: git clone of that URL, and, only if I choose RTK, the RTK steps below. Do not use telemetry, gateways, or any other install.
- Never print secrets. Back up before changing (the kit does). Do not delete anything of mine; if my existing setup (CLAUDE.md, AGENTS.md, skills, plugins) is newer or better, keep it and tell me what differs.
- If anything conflicts with managed or enterprise policy, stop and ask.
- If a step fails or the kit crashes, stop and only then read FALLBACK.md in the cloned folder and follow it. Do not read it otherwise.
- Always-loaded tokens added per tool must stay <= 600 and my fixed context must not go up (verified at the end).

1. PULL AND CHECK
   git clone --depth 1 --branch v2.0.4 <URL> into a new empty folder outside any project. Print the commit SHA. Read README.md, kit.mjs, wizard.mjs, targets.json and AGENTS.md. Search the .mjs files for "http", "fetch(", "node:net", "node:http", "curl", "wget". Expected: rtk.mjs and rtk-audit.mjs (git and RTK URLs, used only after I choose RTK); models.mjs (optional, one fetch to api.anthropic.com, only with --live); no other hits. Run: node kit.mjs verify ; node --test. Both must pass, or stop.

2. SHOW ME THE MENU
   Run: node kit.mjs components --repo <my repo path or .>   (JSON). Using your own multi-select UI (or a numbered checklist if you have none), ask me to tick what I want. Show each item's token cost and note exactly as given. Defaults are pre-ticked.
   - Core rules file (the only token saver). Then ask which tools get it, pre-ticking the ones marked detected: Claude Code, Codex, GitHub Copilot (VS Code/CLI), Cursor, Windsurf, Cline, generic AGENTS.md. Warn that generic AGENTS.md duplicates tokens if Copilot or Codex also reads it.
   - Agentic orchestration (Claude Code only). Tell me plainly: this is for better use of models, not for saving cost, and it adds tokens.
   - Ponytail skill, Caveman skill (Claude Code skills; caveman saves about nothing on the bill by its own docs).
   - RTK shell-output compression.
   - Clean-up (moves Caveman Cloud skills aside, disables RTK telemetry).

3. RTK (only if I ticked it)
   a. Run: node kit.mjs rtk --audit-latest . This lists RTK releases, picks the newest one installable on this platform, and diffs it against the release this kit reviewed (0.49.0). It prints HIGH and MEDIUM flags and the paths of report.md and sensitive.diff.
   b. YOU read sensitive.diff and report.md. Judge in plain words: did telemetry, build.rs, install or release scripts, the hooks written to my agent config, or dependencies change in a way that sends data out, runs code at install, or weakens permission prompts? Quote the specific lines you rely on. The script is a heuristic; your reading is the audit.
   c. Recommend ONE version with your reasoning (the newest if it reads clean; otherwise the closest older one the kit lists). Say honestly if its source was not reviewed.
   d. Ask me in chat to approve: the exact install command shown by the kit (winget / brew / cargo), telemetry off, writing the hook (VS Code Copilot: .github/hooks/rtk-rewrite.json), and removing RTK's redundant 260-token instruction block. Then run: node kit.mjs rtk --tool <copilot|claude> --repo <path> --version <chosen> --yes
   e. Run: node kit.mjs rtk --check --tool <same> --repo <path> and show me the PASS/WARN/FAIL table. Any FAIL: stop, explain, offer to undo (rtk init --uninstall --copilot).

4. APPLY THE REST
   Run a preview: node kit.mjs setup --yes --dry-run --repo <path> --components <ticked, without rtk> --targets <ticked tools>   (add --apply-settings only if I also want model defaults set).
   Show me the plan and the per-tool token numbers. Ask ONE question: "Apply this plan?" Only on yes, run the same command without --dry-run.

5. VERIFY AND HAND OVER
   - Run: node kit.mjs log   (what changed) and tell me the undo command: node kit.mjs uninstall --dry-run.
   - Tell me to restart my IDE, then open a NEW session in an empty folder and send exactly: Reply with exactly one word: ok . For Claude Code then run: node kit.mjs measure. If the first-call size is higher than my baseline, run the undo and report. For Copilot there is no first-call counter: tell me to run RTK's live check (ask agent mode to run "git status", then rtk gain --history shows a row).
   - Finish with one table: item, action, version or checksum, result, how to undo. List anything skipped and anything you could not verify.
```
