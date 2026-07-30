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

**2026-07-30 — `passlib` is probably broken on Python 3.13.** `passlib` 1.7.4 is unmaintained and reads
`bcrypt.__about__`, which `bcrypt` ≥ 4.1 removed — init fails with a confusing error about a missing
attribute. Verify at first install; use `pwdlib` or `bcrypt` directly if it bites.

**2026-07-30 — `new Date("2026-08-04")` is parsed as UTC midnight.** Formatting that back in a
timezone west of Greenwich gives the previous day. Never construct a `Date` from a bare `YYYY-MM-DD`
string; `frontend/lib/dates.ts` exists to make that unnecessary. Spec FR-012a means dates are `DATE`
end to end, so this only bites at the display boundary.

**2026-07-30 — `today` must never be read during server rendering.** Vercel's clock is UTC, so a
creator in UTC+7 sees "overdue" flip between server HTML and hydration, plus a React mismatch warning.
Client components only.

**2026-07-30 — dnd-kit `PointerSensor` with no activation constraint eats scroll gestures.** On a
vertically scrolling grid, a swipe starting on a draggable lifts it instead of scrolling, then drops it
wherever the finger lands. Always set a distance or delay constraint on touch. Long-press is not the
fix — it collides with the browser's context menu and with the constitution's rule about destructive
actions near common gestures.

**2026-07-30 — FastAPI's `RequestValidationError` returns `detail` as an array, not a string.** Any
contract or generated client that types it as a string renders `[object Object]`. Install an exception
handler that flattens it if the API promises a uniform `{"detail": "..."}` shape.

**2026-07-30 — a cookie with no `Max-Age` is a session cookie.** Mobile Safari discards it on tab
eviction, so a 30-day token still produces a weekly login prompt — and it looks like a token bug rather
than a cookie bug.

**2026-07-30 — a coverage-based spec check does not catch a design that does not close.**
`/speckit-analyze` reported 95% requirement coverage on a `tasks.md` containing six blocking gaps,
including one that left every content item permanently stuck in `idea`. It checks whether a requirement
is *cited* by a task, not whether the tasks compose into something that works. Run the `reviewer` agent
as well; the two find different classes of defect.

## Deferred

**Social platform APIs (TikTok / Instagram / YouTube).** Out of scope for v0.1 — published links are
pasted by hand. Picking this up means OAuth flows and rate-limit handling, so it needs its own
`/speckit-clarify` pass rather than being bolted onto an existing spec.

**Multi-user.** Constitution principle VII: no speculative `user_id` columns. This becomes a real
migration when a real second user exists.

**2026-07-30 — Multi-platform items.** One item targets at most one platform (spec FR-010a). A video
cut for both TikTok and Reels is two items today. Pick this up if the creator reports duplicate-entry
fatigue; widening one-to-at-most-one into a set is additive, which is why this direction was chosen.
Doing so also splits the published link into one per platform.

**2026-07-30 — A fourth pipeline state.** `draft` currently means "made, awaiting publication"; work
in progress stays an `idea` (spec FR-007). Three states was chosen because that is how many stay
legible in a 375px calendar cell with a non-colour cue each. Trigger for revisiting: the creator
cannot tell which ideas are actually being filmed. Costs a fourth distinguishable visual cue.

**2026-07-30 — Time-of-day scheduling.** Scheduled dates are calendar days only (spec FR-012a).
Deferred because it drags in timezone and DST handling, turns the week view into a time grid, and
makes drag-to-schedule a two-part gesture. It is advisory-only until something auto-publishes, so it
naturally belongs with the social platform APIs item above.

**2026-07-30 — Bulk import of existing ideas.** No import of any kind in v0.1; the spec's Out of
Scope section says so explicitly so it cannot creep back in mid-build. Migrating ideas out of a notes
app is manual retyping, which the title-only capture flow makes a job of minutes. Trigger for
revisiting: the creator abandons migration part-way. Cheapest future form is a paste-many box (one
idea per line) reusing the existing create path — not file upload.

**2026-07-30 — Concurrent-edit detection.** Last write wins, silently (spec FR-023a). No version
marker on the content item and no conflict branch in any update path. Chosen because the only person
who can be overwritten is the creator themselves, from their own second window. This becomes real at
the same moment multi-user does — the two are the same migration.

**2026-07-30 — Live-updating views.** Nothing pushes changes to an open view; a second device's edit
appears on next load or refresh. Deferred with concurrent-edit detection above, since polling or push
plus reconciliation is a larger build than v0.1's one capability justifies.
