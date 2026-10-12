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
