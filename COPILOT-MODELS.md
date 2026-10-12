# GPT-6 Sol and Luna in GitHub Copilot

Checked against GitHub's docs on 2026-10-12. Items marked **unverified** need a check on your plan before you rely on them.

## Facts (GitHub docs)
- Both models are GA in Copilot. **Luna**: Pro, Pro+, Max, Business, Enterprise. **Sol**: Pro+, Max, Business, Enterprise (not Pro).
- Billing is **per token**, converted to AI credits (1 credit = $0.01). Business and Enterprise get per-user credit allowances pooled at the billing entity. The older per-request billing is labelled "legacy"; check which one your plan uses.

| Per 1M tokens | Input | Cached input | Cache write | Output |
|---|---|---|---|---|
| GPT-6 Sol, up to 272K context | $2.00 | $0.20 | $2.50 | $10.00 |
| GPT-6 Sol, over 272K | $4.00 | $0.40 | $5.00 | $15.00 |
| GPT-6 Luna, up to 272K | $0.10 | $0.01 | $0.125 | $0.50 |
| GPT-6 Luna, over 272K | $0.20 | $0.02 | $0.25 | $0.75 |

- The cost shape is the same as Claude: cached input costs 10% of input, output costs 5x input, and a long context costs about double. So the same levers apply: a small fixed prefix, short sessions, a healthy cache, and **staying under 272K tokens**.
- Sol costs the same per token as Claude Sonnet 5.5 ($2/$10), and Luna the same as Claude Haiku 5.5 ($0.10/$0.50). Luna's long-context step is 2x at 272K, not 5x at 100K like Haiku.
- OpenAI positions Sol for complex coding and agentic work and Luna for fast, high-volume tasks (OpenAI's announcement and secondary coverage; not a GitHub statement).

## Routing guide (our recommendation, not GitHub's)
| Task | Model |
|---|---|
| Writing or changing code, debugging, design, anything where a mistake is costly | **Sol** |
| Read-only or mechanical work: search, summarising logs, renaming, formatting, boilerplate, simple Q&A | **Luna** |
| Final review of a risky change | Sol at a higher reasoning setting (unverified: the docs list configurable reasoning for both models; reasoning tokens are normally billed as output) |

Habits that apply to any model: pick the model at the start of a chat and stay on it (a switch likely loses the cache; unverified for Copilot), start a new chat per task, keep the context under 272K, and keep `.github/copilot-instructions.md` short.
**Pin the model when measuring.** GitHub's Auto model selection can route between models, which would spoil a comparison.

## What from this kit applies to GPT models
| Piece | Applies? |
|---|---|
| `AGENTS.md` / `copilot-instructions.md` rules | Yes, plain text. **Untested on GPT-6**: the ponytail benchmark behind these rules ran on Claude. |
| RTK hook | Yes, it rewrites terminal commands whichever model issued them. |
| `inspect` (instruction files, MCP config) | Yes. No usage history for Copilot. |
| `opus-reviewer`, Sonnet/Haiku routing, `--apply-settings` | **No**, Claude Code only. |
| `measure` (first-call size) | **No**, it reads Claude Code transcripts. |

Custom Copilot agents are `.agent.md` files in `.github/agents/` or `~/.copilot/agents/`. The CLI docs show `name`, `description`, `tools` and `include-custom-instructions`, and **no model field** (unverified whether one exists or whether VS Code uses the same format). Until confirmed, route by choosing the model in the picker.

## How to measure in Copilot
There is no first-call counter. Use an A/B on AI credits:
1. Pick 5 repeatable tasks in one repo (a bug fix, a small feature, a refactor, a test, a question).
2. Pin one model (say Luna for the mechanical ones, Sol for the rest). Run each task with the kit's instructions file off, then on. Repeat each 3 times.
3. Compare AI credits used (GitHub's billing or usage report; where to find it on your plan is unverified) **and** whether the result was correct. Keep a change only if credits drop and quality does not.
