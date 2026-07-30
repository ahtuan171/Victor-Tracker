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
