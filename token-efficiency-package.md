# Token-efficiency package (audited 2026-10-12)

## Audit result (what was actually checked)

| Component | Network / telemetry | Verdict |
|---|---|---|
| ponytail 5.1.0 runtime hooks (`hooks/*.js`) | No network code. One subprocess: `git ls-files` (3s timeout, ponytail-map.js). | OK |
| ponytail `scripts/publish-openclaw-skills.js` | spawns subprocess, dev-only publish script | Not run at runtime. Exclude from install. |
| RTK 0.48.0 (external binary) | Telemetry is opt-in; `rtk telemetry status` = disabled here. Source/binary NOT audited. | OK if telemetry stays off; verify binary provenance |
| caveman core skill (`SKILL.md` text rules) | Instructions only | OK |
| caveman-compress | Calls Anthropic SDK (if ANTHROPIC_API_KEY set) or `claude --print`. Sends the file you compress to the model. | Optional. Do not run on sensitive files. |
| caveman-setup / -discover / -evidence-review / -manage / -optimize / -learn | Route traffic through "Caveman Cloud" gateway with a Cave API key | EXCLUDE (third-party telemetry by design) |
| caveman hook scripts (mode-tracker, stats) | NOT FOUND on disk, NOT audited | Review before enterprise rollout |

Limits: grep-level scan only (network calls, exec, telemetry strings). Not a full code review. RTK binary and caveman hooks unreviewed.

## Include (allowlist)
- `caveman` (terse output), `caveman-explore` + `cavecrew` (cheap read-only subagents)
- `ponytail` (minimal-diff coding)
- `rtk` binary + its Bash hook (shell output filtering)
- Model routing rules (below)

## Exclude
All `caveman-*cloud*` skills listed above, any gateway/base-URL override, large unused plugin bundles (every skill description is loaded each session).

## Install prompt (paste into the enterprise agent)

```
Set up token-efficient defaults. Rules: change only what is listed; back up each file first (*.pre-token-setup); never print secrets; stop and ask if anything below conflicts with managed/enterprise policy.

1. VERIFY BEFORE INSTALL. For each of: caveman (core, caveman-explore, cavecrew), ponytail, rtk:
   - Pin an exact version/commit; record source URL and checksum.
   - grep the files for: https?://, fetch(, http(s).request, net/dgram/child_process, curl, wget, telemetry, analytics, posthog, sentry, ANTHROPIC_BASE_URL, API keys. List every hit and explain it. Abort that component if any unexplained outbound call exists.
   - For rtk: run `rtk telemetry status`; it must show disabled. Do not run `rtk telemetry enable`.
2. DO NOT install caveman-setup, caveman-discover, caveman-evidence-review, caveman-manage, caveman-optimize, caveman-learn, or any gateway/Cave API key config. Do not set ANTHROPIC_BASE_URL.
3. SETTINGS (user settings.json): "model": "sonnet"; env CLAUDE_CODE_SUBAGENT_MODEL=haiku. Do NOT set CLAUDE_CODE_SUBAGENT_MODEL_FORCE. Put per-agent `model:` and `effort:` in agent frontmatter, not in settings.
4. AGENT: create agents/opus-reviewer.md (frontmatter: name, description "architecture/security/risky-diff review only; pass a compact brief", model: opus, effort: high, tools: Read, Grep, Glob, Bash).
5. CLAUDE.md append:
   # model routing
   - Main session Sonnet. Haiku only for read-only or mechanical work (search, sweeps, formatting). Judgment or code-writing stays on Sonnet.
   - Opus only via opus-reviewer, only when a mistake is costly; give it a brief, not history.
   - Delegate only when a side task would flood context; small tasks inline.
6. LOAD EFFICIENTLY: disable plugins/MCP servers not used in the last 30 days (check transcripts). Keep the skill list short. Do not switch models mid-session; /clear between unrelated tasks.
7. VERIFY: new session -> /model shows Sonnet 5.5; opus-reviewer is listed; `rtk gain` runs; no process contacts hosts other than the model API. Report a table of what was installed, version, checksum, and any hit from step 1.
```

## After a week
Run `/caveman-stats` and `rtk gain`. If caveman `Est. net` is negative for your workload, switch it to lite or off. Treat RTK's headline % as inflated (its `read` accounting did not match its own average).
