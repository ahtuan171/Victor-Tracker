# Working memory

Durable notes that do not belong in the spec, the code, or the git history — things a future session
would otherwise have to rediscover. Loaded into context via the import in `CLAUDE.md`.

Keep entries short and dated. Delete entries that stop being true; a stale note is worse than none.

## Conventions for this file

- **Decisions with a reason** — "chose X over Y because Z", where Z is not obvious from the code.
- **Traps** — environment quirks, tooling gotchas, things that broke once and cost an hour.
- **Deferred work** — deliberately postponed, with what would trigger picking it up.

Do not record: what the code already says, what git history already shows, or anything specific to a
single conversation.

---

## Decisions

**2026-07-29 — v0.1 is Content Calendar only.** Growth Tracker, Media Kit, and Deal Tracker each get
their own full 8-stage iteration. The goal of the first cycle is a working pipeline end to end, not
a feature-complete product; four modules at once would produce neither.

**2026-07-29 — Idea capture requires only a title.** Platform and scheduled date are both optional at
creation. Reason: ideas arrive mid-task, and any required field is enough friction to send the
creator back to a notes app. This drives nullable columns and a backlog view separate from the
calendar grid.

## Traps

_(none recorded yet)_

## Deferred

**Social platform APIs (TikTok / Instagram / YouTube).** Out of scope for v0.1 — published links are
pasted by hand. Picking this up means OAuth flows and rate-limit handling, so it needs its own
`/speckit.clarify` pass rather than being bolted onto an existing spec.

**Multi-user.** Constitution principle VII: no speculative `user_id` columns. This becomes a real
migration when a real second user exists.
