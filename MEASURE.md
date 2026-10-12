# How to measure token savings

## What you measure
The **first call** of a session contains only the fixed prefix: system prompt, built-in tools, skills and agent descriptions, plugin tools, `CLAUDE.md`/`AGENTS.md`, plus your first message. It is re-read on every later call, so each token removed there is saved on every call of every session.

## Procedure
1. Baseline: `node kit.mjs setup` stores the median first-call size of your last 5 sessions (or note the top line of `node kit.mjs measure`).
2. Make the change (install, disable a plugin, remove a connector).
3. Open a **new session in an empty folder** (a project `CLAUDE.md` would add tokens and spoil the comparison). Send exactly:
   `Reply with exactly one word: ok`
4. Run `node kit.mjs measure`. Read the newest line and the "baseline ... -> newest" line.
5. Change one thing at a time. Repeat from step 2.

## Reading the output
`first-call` is input + cache-read + cache-creation tokens of the first model call. `cache-hit` is cache-read share over the whole session: one-call sessions show about 60% (the first call writes the cache); healthy longer sessions show 90%+. A fall in cache-hit means something breaks the prompt cache (switching models mid-session, changing MCP servers or tools mid-session, `/compact`).

## Rules of thumb from our run
- Biggest win: a plugin with ~300 skills and ~50 agents (about 21k tokens).
- Idle MCP servers: deferred tool names are cheap (34 tokens for two servers).
- Output-trimming (terse styles) touches 4-7% of weighted cost. Expect little.
- Compare only sessions from the same app and the same folder type.

## Whole-history view (optional)
`node kit.mjs measure --last 30` lists recent sessions with calls and cache-hit. Sessions that began with a fixed prefix above your median usually have extra plugins or a large `CLAUDE.md`; run `node kit.mjs audit`.
