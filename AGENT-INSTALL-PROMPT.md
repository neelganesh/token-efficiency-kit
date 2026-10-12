# One prompt that does everything (one confirmation)

Paste the block into Claude Code, Codex or GitHub Copilot agent mode (needs shell, git, Node 18+).

```
Install token-efficient defaults from https://github.com/neelganesh/token-efficiency-kit, pinned to tag v1.0.1, for the tool I am running in. Do it end to end, asking me for ONE confirmation.

Hard rules
- Added always-loaded tokens must be <= 600 in total, and my first-call context must not go up. If the measured result is worse than the baseline, undo it (restore the *.pre-token-kit backups) and tell me.
- Never pipe a download into a shell. Only network action allowed: git clone of the URL above. No telemetry, gateways, hooks, MCP servers, or Caveman Cloud skills. Never print secrets.
- Do not delete my files. Back up every file you change. If my existing setup (CLAUDE.md, AGENTS.md, skills, plugins) is newer or better than the kit's, keep mine and tell me what differs.
- Stop and ask if anything conflicts with managed or enterprise policy.

Steps
1. Clone with --depth 1 --branch v1.0.1 into a new empty folder outside any project. Read README.md, kit.mjs and AGENTS.md. Search kit.mjs for "http", "fetch(", "node:net", "node:http", "curl", "wget"; there must be none. Run: node kit.mjs verify and: node --test kit.test.mjs (both must pass).
2. Plan (read-only): node kit.mjs audit ; node kit.mjs budget ; node kit.mjs setup --yes --dry-run (add --repo <path> if I use Copilot in a repo). Summarize in one table: files to change, tokens added, audit WARNs, overlaps with my config.
3. Ask me ONE yes/no question: "Apply this plan?" Wait.
4. On yes: node kit.mjs setup --yes (same --repo). Also run node kit.mjs fix if the plan listed Caveman Cloud skills.
5. Tell me to open a NEW session in an empty folder and send: Reply with exactly one word: ok. Then run: node kit.mjs measure and report baseline vs new first-call size, and cache-hit. If it is higher than baseline, undo and report.
```
