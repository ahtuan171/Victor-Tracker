# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: not yet scaffolded

The repo contains configuration and drafts only — no application code. Bootstrap order:

```bash
uv tool install specify-cli
specify init --here --integration claude   # run from creator-hub/, which already exists
```

Then run the SpecKit commands (see workflow rules) before writing application code. Nothing under
`backend/` or `frontend/` should exist until `specs/content-calendar/tasks.md` does.

## What this is

CreatorHub — a personal brand operating system for a content creator. Four planned modules:
Content Calendar, Growth Tracker, Media Kit Generator, Deal/Collab Tracker.

**v0.1 ships Content Calendar only.** The other three are later iterations, each re-running the full
8-stage workflow with a new `spec.md` against the same `constitution.md`. Do not add fields,
endpoints, or screens for the other modules while working on v0.1 — that is the main failure mode
this project is structured to avoid.

## Detailed rules

@.claude/rules/workflow.md
@.claude/rules/tech-defaults.md
@.claude/rules/design.md

## Working memory

@.claude/memory.md

## Non-negotiables

Three rules that override convenience in any given moment:

1. **`specs/` outranks code.** When they disagree, one is wrong — decide which, fix it, and say so
   in the MR. Never code around the gap.
2. **`spec.md` contains no technology.** What and why only. Technology lives in `plan.md`.
3. **Nothing outside the current spec gets built.** Useful ideas become input for the next
   iteration; write them into `.claude/memory.md` under Deferred, do not implement them.
