# Token-efficient working rules

## Scope
- Make the smallest change that fully solves the task. Reuse existing helpers, patterns and dependencies before writing new code. Add no unrequested features, options or abstractions.
- Before editing, list what the change must reach: callers, tests, config, exports. Finish all of it.
- New non-trivial logic gets one small test. Never cut input validation, security, error handling that prevents data loss, or accessibility.

## Context
- Search (grep/glob) before reading. Read only the line ranges you need. Do not re-read a file you just edited.
- Do not paste large logs or files back. Quote only the decisive lines.
- Work on one task per session. Summarize long tool output instead of repeating it.

## Replies
- Answer first, then the reason. No greeting, recap or offer of more help.
- Keep code, commands, paths, numbers and error text exact. Never drop "not", "never" or "only".
- Use full plain sentences for security warnings, destructive actions and questions to the user.
- End with one line: what you skipped or did not verify.
