# Audit any agent's initial context (prompt)

Paste into Claude Code, Codex or GitHub Copilot agent mode with shell access, git and Node 18+. It audits the agent you are running in, ranks what to change for your setup, and changes nothing without your yes.

```
Audit my agent setup for wasted initial context (everything loaded before my first message) and recommend personalised fixes. Read-only until I approve.

Rules: Clone only https://github.com/neelganesh/token-efficiency-kit at tag v2.0.5 (git clone --depth 1 --branch v2.0.5) into a new empty folder outside any project; no other network access. Read kit.mjs, wizard.mjs, inspect.mjs, rtk.mjs, rtk-audit.mjs and models.mjs first and search them for "http", "fetch(", "node:net", "node:http", "curl", "wget"; the only expected hits are the RTK repository URL and git calls in rtk.mjs and rtk-audit.mjs (used only after I choose RTK) and, in the optional models.mjs, one fetch to api.anthropic.com that runs only with --live after I confirm. If my security policy forbids network code, delete models.mjs. Never print secrets. Change nothing yet.

1. Run: node kit.mjs inspect --tool all   (add --repo <my repo path> if I use Copilot or Codex in a repo)
   Run: node kit.mjs audit
2. For the tool you are running in, report: the table of what loads before my first message, the estimated total versus the measured first call, and the findings in order of tokens saved.
3. Go beyond the script. Look for context bugs it cannot see: instruction files that contradict each other, rules duplicated across CLAUDE.md, AGENTS.md and plugins, skills whose descriptions overlap, stale paths or tools mentioned in instructions, MCP servers whose instructions are long, hooks that print on every session, project-level files that repeat global ones. List each with the file and why it costs tokens.
4. Give me a ranked action plan, each item with: what to change, exact command or edit, estimated tokens saved per session, risk (what I lose), and how to undo. Prefer reversible moves (disable, move to skills.disabled/, scope to one project) over deletion. Do not recommend anything that lowers answer quality for work I actually do: check my usage counts before suggesting a removal.
5. Ask me which items to apply. Apply only those, one at a time, backing up every file first.
6. Tell me to open a NEW session in an empty folder, send: Reply with exactly one word: ok, then run node kit.mjs measure. Report before vs after. If the first call did not go down, undo the last change and say so.
```
