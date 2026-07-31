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

**2026-07-30 — the stage-1 specs reached `main` by a local fast-forward, not a merge request.**
`workflow.md` says planning artifacts belong on `main` before implementation, and constitution VI says
`main` is merge-request-only. With no remote there is no gate to satisfy, so a local merge is exactly
the self-merge principle VI exists to prevent. Chosen deliberately over creating the GitLab project
first, because that would have blocked all implementation on an account setup that blocks nothing
else. **T076 must record this as a knowing exception**, not omit it — the point of the gate is that
its absence gets written down. Implementation tasks still use one branch per task, merged `--no-ff`,
so the history has the shape a real MR flow would produce once the remote exists.

**2026-07-30 — the constitution VI exception is no longer one fast-forward; it covers every merge to
date.** The entry above was written about a single act — the specs reaching `main`. Every implementation task since
has merged the same way, so the standing count is **one fast-forward plus one merge per completed
task**, and it grows by one with every task until a remote exists. Do not write the running total here;
it goes stale within a session. Count it at the time with `git log --oneline --merges | wc -l`.
Recording this separately because an exception whose scope drifts without
being restated is indistinguishable from an exception nobody is tracking, which is the exact failure
principle VI exists to prevent. Two consequences: **T076 records the count and the range, not just the
fast-forward**, and the cost of deferring stage 3 is not flat — each task added before the gate exists
is one more change that never passed it. Delete this entry once `main` is protected and the first real
MR has merged; replace it with the task number where the gate became real.

**2026-07-31 — a remote exists and `main` is protected, but the local `--no-ff` flow continues, by
decision.** `CLAUDE.md` previously said the local flow stops being valid the moment `main` is
protected. It now is (`gitlab.com/ahtuan1701/creator-hub`, private, `glab` authenticated) — and the
gate still does not exist: the **first and only pipeline failed with zero jobs created and
`yaml_errors: null`**, meaning no runner accepted it, which on GitLab.com free tier is almost always
the account-validation requirement for shared runners. `only_allow_merge_if_pipeline_succeeds` is
`false` and `main`'s push access is **Maintainers**, not "no one", so the repo owner can still push
directly. An MR today would therefore be a self-merge with extra clicks, which is not what
constitution VI asks for — it asks for a gate. T023–T028 continue merging locally. **The exception
count above keeps growing**, and the trigger to stop is not "a remote exists" but "a pipeline
actually ran and gated something".

## Traps

Only the ones that bite outside a single tree. **Backend traps live in
[`backend/AGENTS.md`](../backend/AGENTS.md), frontend traps in
[`frontend/AGENTS.md`](../frontend/AGENTS.md)** — they load automatically when working there. A trap
belongs here only if it can bite while editing a root-level file.

**2026-07-30 — a coverage-based spec check does not catch a design that does not close.**
`/speckit-analyze` reported 95% requirement coverage on a `tasks.md` containing six blocking gaps,
including one that left every content item permanently stuck in `idea`. It checks whether a requirement
is *cited* by a task, not whether the tasks compose into something that works. Run the `reviewer` agent
as well; the two find different classes of defect.

**2026-07-30 — `creatorhub_test` already has the schema locally, so a test harness that assumes one
will pass here and fail in CI.** The local test database was migrated by hand at T011; the
`postgres:17-alpine` service container in `.gitlab-ci.yml`'s `test:backend` job starts empty and the
job runs `uv run pytest` with **no `alembic upgrade head` before it**. A `conftest.py` that connects
and starts querying therefore works on this machine and fails on the first pipeline with a missing-table
error that looks like a fixture bug. The harness must create the schema itself — and prefer
`alembic upgrade head` over `SQLModel.metadata.create_all`, because `create_all` builds the enum types
and constraints from model metadata rather than from the migration, so the artifact that actually runs
in production goes untested and the `values_callable` trap (now in `backend/AGENTS.md`) loses the only
place it could resurface. **This one stays at root** because it bites while editing `.gitlab-ci.yml`,
where the backend file does not load.

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
