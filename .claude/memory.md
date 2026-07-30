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

## Traps

**2026-07-30 — `passlib` is confirmed broken on Python 3.13; the project uses `pwdlib`.** Verified at
T002, and the failure is *not* the `bcrypt.__about__` one this note originally predicted. With
`bcrypt` 5.0.0, `CryptContext(schemes=["bcrypt"])` dies at first use inside passlib's own backend
probe (`detect_wrap_bug`), which hashes an over-72-byte password expecting bcrypt to truncate:
`ValueError: password cannot be longer than 72 bytes`. passlib 1.7.4 is unmaintained, so this will
not be fixed. `pwdlib[bcrypt]` works on 3.13 with bcrypt 5.0.0.

**2026-07-30 — bcrypt itself refuses passwords over 72 bytes; it no longer truncates.** Independent
of the hashing library. Login (T012) and the seed script (T015) must bound password length at the
boundary and say so, rather than wrapping it — silently truncating would make two different passwords
open the same account.

**2026-07-30 — `shadcn init` can half-succeed.** On this machine (shadcn 4.16.0, Next 16, Tailwind 4)
it wrote `components.json` and stopped: no `lib/utils.ts`, no theme tokens in `globals.css`. `shadcn
add` then succeeds and produces a component importing a nonexistent `cn` and referencing undefined CSS
variables, so the failure surfaces later as an unstyled component rather than as an init error. Both
files are now checked in by hand. Check for them after any future `init`.

**2026-07-30 — an index declared only in a migration is an index Alembic will delete.** Autogenerate
compares indexes against model metadata, so the backlog partial index — written by hand into the T011
migration and nowhere else — showed up as "removed index" on the very next `alembic check`, and the
next generated revision would have dropped it. Declare constraints and indexes in
`__table_args__` *and* the migration, and run `alembic check` after every revision. (CHECK
constraints are never compared, so they cannot drift this way; indexes can.)

**2026-07-30 — Alembic's generated `downgrade` does not drop enum types it implicitly created.**
`sa.Enum(...)` inside `create_table` emits `CREATE TYPE` on upgrade, but the generated downgrade only
drops the table. The type survives, and the *second* `upgrade` fails with "type platform already
exists". Invisible unless you actually run `upgrade → downgrade base → upgrade`. Create and drop enum
types explicitly with `postgresql.ENUM(..., create_type=False)`, and run that round trip on every
migration that touches one.

**2026-07-30 — a SQLAlchemy enum column stores the Python member *names* by default.** `Status.IDEA`
persists as `IDEA` while the contract, the frontend, and every fixture use `idea`. Pass
`values_callable=lambda e: [m.value for m in e]`. It only surfaces on a round trip against a real
database, so an in-memory test suite would never catch it.

**2026-07-30 — pydantic-settings matches constructor kwargs by field name, not by environment-variable
name.** `Settings(JWT_SECRET="...")` populates nothing — the field is `jwt_secret` — so a test written
that way passes for the wrong reason, and a "missing variable" assertion passes even when the variable
is present. Test settings through the real environment with `monkeypatch.setenv` and `_env_file=None`.

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
