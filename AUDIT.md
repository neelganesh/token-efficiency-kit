# Audit record (2026-10-12)

Method: shallow clones, read-only static review by subagents plus grep for network, exec, telemetry and file writes. Nothing was built or executed. Not a full code review.

## ponytail (DietrichGebert/ponytail, MIT, HEAD 9b58c1ff, tag v5.1.0)
- Network/telemetry: none in hooks, scripts or plugins.
- Exec: `git ls-files` (3s timeout) in `hooks/ponytail-map.js:37`; `scripts/publish-openclaw-skills.js` is maintainer-only.
- Writes: flag files and config under `~/.claude`, `~/.config/ponytail`; never edits `settings.json` on install.
- Injected context: ~900 tokens at session start (+ up to ~500 map), repeated in every subagent. Per-turn on hosts without session hooks.
- Note: first session start injects a statusline-setup nudge containing a PowerShell command run with `-ExecutionPolicy Bypass` (path shell-checked, only offered to the user). This kit does **not** use the hooks.
- Savings: self-run benchmark, 39 tasks x 5 runs, Claude Code + Opus 5.5: output tokens -45%, cost -26%, hidden checks 87/90 vs 86/90. Earlier 80-94% figures were inflated by a chatty baseline (the README admits it). A third-party test: ~44% less code but trimmed bad-input handling on 5/24 tasks.
- Verdict: keep, vendored skill only.

## caveman (JuliusBrussee/caveman, Apache-2.0 since 3.0, HEAD 2e08b91, v3.2.0)
- Safe (no network): `skills/caveman/SKILL.md`, hooks in `src/hooks/*.js` (only exec: stats subprocess, 2.5s).
- Phones home / sends data: the caveman CLI (telemetry ON by default to a Supabase function: commands, token counts, install ID, OS, IP; opt out `CAVEMAN_TELEMETRY=0` / `DO_NOT_TRACK=1`); `caveman-setup` and `-discover` (route app LLM traffic via gateway.caveman.so with a CAVE_API_KEY); `caveman-compress` (sends file contents to a model provider).
- Installers: a piped-download shell installer and `npx -y github:...`; hook installers fetch from the unpinned `main` branch; `--with-init` edits many agent configs. Not used here.
- Savings (author's own `docs/HONEST-NUMBERS.md`): caveman level ~3% output reduction vs "Answer concisely." control (n=10, single run, older text); input saving 0%; rule overhead ~1,160 tokens plus a per-prompt reminder, unmeasured. Outside tests cited: -44% billed output but +0.06% total cost; net bill within +/-0.2%. Caveman's docs say Copilot is billed per request, but GitHub's current docs show per-token billing (legacy plans still per request), so that note is outdated for most plans.
- Verdict: optional only, default off. Never install the cloud/gateway skills (`fix` disables them).

## RTK (rtk-ai/rtk, Apache-2.0, audited HEAD 27a659f, Cargo 0.49.0, latest tag v0.51.0)
- Telemetry: off by default; needs consent; one HTTPS POST at most per 23h (device hash, usage counts, version/OS). Only active if the build has a compiled-in URL (release builds do; self-builds do not). Hard off: `RTK_TELEMETRY_DISABLED=1`.
- Other network: only telemetry and the erasure request. No auto-update found.
- Installer: checksum from the same origin as the binary; no signature check; unpinned resolves "latest".
- Writes: `tracking.db`, device salt, tee store with full output of failed commands.
- Hook: PreToolUse on Bash; exit 0 returns `permissionDecision: allow` (auto-approve rewritten commands).
- Savings accounting: tokens = ceil(bytes/4); `rtk read` baseline is the whole file even when `head -n N` would print a few lines, so absolute "saved" numbers are inflated. Percentages per command are more reliable. Filters can truncate or strip comments; failed output is stored and a recall hint is shown.
- Verdict: useful for noisy shell output, install separately, pinned, telemetry off, exclusions set.

## Unconfirmed
RTK payload code beyond lines 150-166; per-turn overhead of all three on real workloads; the Go proxy/extension in caveman; which Copilot billing model (per-token AI credits or legacy per-request) applies to your plan; Windows hook behavior of RTK.

## RTK install and Copilot integration (checked 2026-10-12 against HEAD 27a659f)
- Windows install: `winget install rtk-ai.rtk` (preferred over a manual zip; winget verifies its manifest hash). Needs `rg` on PATH for some filters.
- `rtk init --copilot` (repo) writes `.github/hooks/rtk-rewrite.json` (one PreToolUse hook: `rtk hook copilot`, 5s timeout) and upserts an RTK block into `.github/copilot-instructions.md`. `-g` writes to `~/.copilot` (or `$COPILOT_HOME`).
- VS Code Copilot Chat gets a transparent rewrite (`updatedInput`); Copilot CLI gets deny-with-suggestion, so keep the instruction block there.
- The instruction block (~260 tokens) tells the model to prefix commands with `rtk`; with the VS Code hook it is redundant. `kit.mjs rtk --slim` removes it with a backup.
- Verified on RTK 0.48.0: `rtk hook copilot` rewrote `git status` to `rtk git status` and passed `echo hi` through; `rtk rewrite "git status"` printed the rewrite with exit code 3 (so the kit reads output, not exit code); `rtk verify` reported 154/154 tests.
- Unverified: VS Code's own switch for agent hooks on every version; confirm with the live check.

## models.mjs (added in v1.3.0)
- The only kit code that sends an API key: one GET to `https://api.anthropic.com/v1/models`, header `x-api-key` from the `ANTHROPIC_API_KEY` environment variable, `anthropic-version: 2023-06-01`, redirects disabled, 15s timeout, host allow-list (`api.anthropic.com`, `127.0.0.1`, `localhost`), runs only with `--live` after a y/N prompt. The key is never written, logged or printed (tested). Optional: delete the file and `kit.mjs` reports "offline build".
- Copilot: no documented model-listing API was found in GitHub's docs (2026-10-12), so none is called. The CLI documents `--model`, `COPILOT_MODEL` and `~/.copilot/settings.json` key `model`; the kit writes only the last.

## Live RTK audit and install selection (v2.0.0)
- `rtk-audit.mjs` uses git only: `ls-remote --tags` and a read-only blobless bare clone into a temp folder; nothing from RTK is built or run by the kit. It diffs the reviewed release (0.49.0) against the newest installable one and flags new code hosts, new dependencies, changes to `build.rs` / install scripts / release workflow / telemetry code, hook and init code, process spawning and `unsafe`. Test code and docs are ignored. Heuristic: a CLEAN verdict is not a security review, and a dev-only dependency still shows as a new dependency.
- Measured on 2026-10-12 against the real repo: 0.49.0 to 0.50.0 returned REVIEW (`build.rs`, `.github/workflows/release.yml`, `src/core/telemetry.rs`, `src/core/telemetry_cmd.rs` changed; new dependency `temp-env`); 0.49.0 to 0.51.0 returned REVIEW with 189 files changed.
- Platform fact found while building it: winget lists v0.50.0, v0.48.0, v0.47.0 and older, but not 0.49.0 or 0.51.0, and some entries carry a `v` prefix. The kit uses winget's literal strings and, when the reviewed version is not installable, offers the closest one and says plainly that its source was not reviewed.
- The kit never installs a REVIEW release by itself; an explicit `--version` after reading `sensitive.diff` is required.

## wizard.mjs (v2.0.0)
- Local only. Writes rules files per `targets.json`, optional skills and agent file, appends `~/.token-kit/log.jsonl`, and `uninstall` reverses what the log lists (our markers and files only; edited files are left). Piped or closed input never counts as consent.

## Prompt walkthrough (2026-10-12, v2.0.0 then v2.0.3)
PROMPT.md was executed step by step as an agent would: clone at the tag and print the SHA; network-string scan (hits only in `rtk.mjs`, `rtk-audit.mjs`, `models.mjs`); `verify` and tests; `components` rendered as the checkbox menu; live RTK audit of 0.50.0 with the diff actually read (telemetry and trust hunks are refactors; `build.rs` adds a local source-file check; `temp-env` is a dev-dependency; permission code is stricter: a command with no matching rule now yields an ask, never an auto-allow; `init.rs` scanned for spawning, network and deletions, only RTK's own `remove_file` uninstall paths, not read line by line); RTK hook written and checked in a throwaway repo; dry-run, apply, `log`, `uninstall --dry-run`. Not exercised: a real winget/brew/cargo install (RTK was already present), a live VS Code session, and a real agent running the prompt. Defect found and fixed in v2.0.3: the RTK hook, instruction-block removal and install were not written to the change log, so `uninstall` could not point at them.
