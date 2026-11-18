---
name: session-log
description: Keep a daily handoff log in sessions/YYYY-MM-DD.md so work can resume across Claude Code sessions — read the latest log at the start, append a Goal / Done / Decisions / Open block at the end. Use when the user says wrap up, session over, likh do, save progress, log this session, or when starting work in a repo that has a sessions/ folder.
---

# Session Log

A terse, factual handoff note per working session. It is memory for the next session, not a diary.

## At the start

If `sessions/` exists, read the most recent one or two files before doing anything else and briefly state where work left off and what is open.

## At the end (or when asked)

Create or append to `sessions/<today>.md` (local date, `YYYY-MM-DD`). Several sessions on one day append a new block; never overwrite an earlier one.

```markdown
## Session N — <short title>

**Goal** — what this session set out to do.

**Done**
- What actually changed, with file paths. Facts, not intentions.

**Decisions**
- Calls made and why, especially anything not obvious from the code or that reverses an earlier decision.

**Open / next**
- Unfinished work, known bugs, what the next session should pick up first.
```

## Rules

- Write only what happened in this session; verify against `git status` / `git diff` rather than memory.
- If the folder does not exist, create `sessions/` and make sure it is in `.gitignore` unless the user wants logs committed.
- If the project keeps a build-order or status list in `CLAUDE.md`, update the relevant line too (with the date and session file).
- No secrets, tokens or customer data in the log.
