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

**2026-07-29, superseded 2026-08-05 — one module per iteration.** The original entry said v0.1 was
Content Calendar only and that Growth Tracker, Media Kit and Deal Tracker would each get their own
8-stage iteration. **Those three are cancelled** (see the 2026-08-05 pivot entry below); the rule
they were an instance of is not, and it is the half worth keeping: the goal of a cycle is a working
pipeline end to end, not a feature-complete product, because several modules at once produces
neither. That reasoning is what the pivot was measured against, and it is why Content Calendar was
kept rather than rewritten.

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

**2026-07-31 — the constitution VI exception ended at T025. This is the entry T076 needs.** Before
T025 was started, `only_allow_merge_if_pipeline_succeeds` was set to `true` and `main`'s
allowed-to-push dropped from Maintainers to **no one**, then both were read back from the GitLab API
rather than taken on trust. **T025–T028 went through MRs !1–!4**, one per task, each merged only
after a green pipeline.

**The exception's exact range, which is what T076 records:** one local fast-forward (the stage-1
specs) plus every `--no-ff` merge from T001 through T024 — **25 merge commits on `main` before the
gate existed**, none of which passed a check that could have stopped them. Not a count to
recalculate later: `git log --oneline --merges` now includes the real MR merges too, so the number
only means anything pinned to the commit where it was taken (`caca814~4`).

The entry above stays because T076 still has to record the fast-forward *specifically* — it is the
one merge that predates even the local branch-per-task convention.

**2026-08-01 — stage 2 is closed, and the export is not where the earlier decision expected it.**
The design lives in claude.ai project `32445b82-32e5-4ac4-86d3-4fcc885a5484`, a **regular** project —
not the `VictorHub Design System` project created at stage-2 groundwork specifically so its type
would be right. That project is still empty. Nothing was lost: `DesignSync get_file` reads a regular
project fine, and the project-type decision only ever protected *pushing a component library back*,
which this export never needed. Keep the `create_project` reasoning in `CLAUDE.md`'s Decisions table —
it is still correct about what is irreversible — but stop treating the empty project as the source of
truth. The export in `design/content-calendar/` is.

The data-shape audit ran **clean**: every control maps to one of the six editable fields, so no
`spec.md` amendment was needed and constitution IV is satisfied. Findings are written into
`design/content-calendar/BRIEF.md` rather than here, because the next reader of that question will be
holding the brief. **Only the token layer and `/login` were integrated** — the other ten surfaces are
built at their own tasks from T033 on, which is the difference between adapting a design and letting
a picture reorder the task board.

**Two lessons from getting here, both still live:**

- **A config file that is "verified" as parseable is not verified.** Three red pipelines preceded the
  first green one and none of the three failures was in application code: a pnpm approval file pnpm
  itself wrote as a placeholder; the correct fix applied to the wrong file (`package.json` is pnpm
  10's location, pnpm 11 reads `pnpm-workspace.yaml`); and a `JWT_SECRET` short of the minimum
  `Settings` enforces. All three passed a YAML syntax check. All three had never executed.
- **One failed pipeline is not evidence that CI does not work.** Pipeline #1 created zero jobs with
  `yaml_errors: null` — a one-off at project creation — and that single data point was enough to
  justify merging T023 and T024 locally. The very next push ran all 10 jobs. Push again before
  concluding anything about a runner.

**2026-08-01 — the seed blocker is closed, and the durable half is not "an account exists".** The
account exists (one row, a real domain — `.local` is a reserved TLD that `email-validator` refuses),
and quickstart V1 has been walked in a browser. That part is now history and belongs in the build log.
What stays here is what the walk *revealed about the suite*: **every automated frontend test stubs the
proxy**, because CI has no FastAPI behind it, so a fully green frontend run says nothing about whether
the browser → proxy → FastAPI → Postgres path works. One hand-walk proved more than 90 tests did.
The rule that follows: **hand-walk the quickstart at every phase checkpoint**, and treat "the suite is
green" as evidence about the frontend in isolation, never about the seam. Re-seeding is not available
as a fix — a *different* email is refused outright, because `content_item` has no owner column (INV-4)
and two creators would silently share every item.

**2026-08-02 — parallel tracks are worth it exactly when the trees are disjoint, and not otherwise.**
Phase 4 was split in two: the backend pair (T036–T037) ran in a `general-purpose` subagent in its own
git worktree while the frontend chain (T038–T042) ran here. They never touched the same file, both
merged behind their own green pipelines, and the only coordination needed was a rebase when `main`
moved underneath the slower one.

**The frontend chain was deliberately *not* split**, and that is the reusable half of this note: T038
to T042 is linear because each task is the previous one's only consumer — the mapping has no shape
until the cues render it, the cues have no home until the chip composes them, the chip has no surface
until the drawer and the grid draw it. Two agents on that chain would spend more time rebasing than
building, and each MR would gate on a pipeline that runs in serial anyway. Split by **tree**, not by
task count; if two tasks would edit one file, they are one track.

One thing the split cost: the worktree has no `.env` of its own and `app/config.py` refuses to import
without one, so an agent working in `backend/` there has to copy the root file in. Worth saying in the
prompt rather than letting it discover this.

**2026-08-05 — the product pivoted, and the constitution went to 2.0.0 to say so.** VictorHub is now
a personal travel memory map: a world map of places visited and places wanted, a visited pin opening
the photographs and notes kept against it. Growth Tracker, Media Kit Generator and Deal/Collab
Tracker are **cancelled**, not deferred — do not treat them as a backlog.

Three things about *how* this was done are worth keeping, because each was a real choice with a
rejected alternative:

- **The amendment happened at the Reflect stage and nowhere else.** Iteration 001 had just closed
  there — retro written, `v0.1.0` tagged — which is the only window the constitution's own amendment
  procedure allows. Doing it later, mid-002, would have been the exact move principle IV's governance
  section forbids: amending the rules to fit work already underway.
- **Principle II was strengthened rather than merely carried over.** A location history plus
  photographs is a pattern of life, and it is not recoverable once disclosed — a stronger claim than
  anything v0.1 held. The rule that follows and that a later session will be tempted to soften: **no
  public object-store bucket, ever**, and no third-party request may carry a place name, pin label or
  record id. Map tiles are the case that makes this concrete, since a tile request necessarily
  discloses the viewport and it would be easy to let a label ride along with it.
- **Content Calendar was kept, not rewritten.** It is 271 backend and 432 frontend tests of working
  software, and retargeting `content_item` to trips would have destroyed most of that while moving
  the map forward by nothing (principle V). It moves behind the nav drawer and keeps its behaviour.

**2026-08-05 — a map is the first library this project has accepted, and that is consistent rather
than a reversal.** The calendar was hand-built because every calendar library's value is time-of-day
layout, which FR-012a had removed — the library scored **zero**, so any cost bought nothing. That was
a *measurement*, not a preference for hand-rolling, and the same measurement comes out the other way
for a world map: projection, tiled loading, inertial pan/zoom and pin placement over all three are not
a weekend's work. A static SVG world map was considered seriously and rejected on one point — it
cannot zoom past country outlines, and a memory attaches to a place, not to a country. Its real
advantage (no third-party request at all) is why the tile disclosure is written down in
`tech-defaults.md` rather than waved through.

**2026-08-14 — the product's brand text was renamed a second time, VictorHub → Victor Tracker,
collapsing a two-layer naming scheme into one.** `002-pixel-arcade-skin`'s T049 (2026-08-11) had
already picked "Victor Tracker" as the in-app comic-book masthead text (`Victor Tracker · Issue #NN`,
`CalendarShell`'s header) — chosen specifically because the redesign brief's own literal "SPIDEY
TRACKER" example crosses into Marvel's IP ("Spidey" is Spider-Man's own nickname), and "Victor" was
picked because it ties back to "VictorHub", the brand name at the time. That left two names live at
once: "VictorHub" as the real brand text (docs, `<title>`, package names) and "Victor Tracker" as a
second, cosmetic layer inside the calendar's own header. On 2026-08-14 the owner decided to stop
carrying both and made "Victor Tracker" the product's actual brand text, superseding "VictorHub"
everywhere — see the Deferred entry above for the mechanical Tier 1/Tier 2 record.

**Worth recording separately from the mechanics: this rename surfaced during a session that also had
to twice decline using an actual Spider-Man mask image** the owner supplied as a proposed background
asset for the (real, already-shipped) "Victor Tracker" header — the same character-likeness exclusion
`002`'s own design brief already states (`design/002-pixel-arcade-skin/BRIEF.md`: "no Spider-Man
wordmark, no spider emblem, no character likeness, no studio logos"), and now restated again in
`design/003-travel-map/BRIEF.md` as "permanent, not scoped to that one iteration." The two threads are
related, not coincidental: "Victor Tracker" exists specifically *because* this product's own design
process already ruled out leaning on Spider-Man IP, and the exclusion held again here even though this
time an actual image asset was offered rather than just a design idea. **The rule this confirms:
owner permission does not resolve a third-party IP concern** — Marvel/Sony's rights to the character
are not the owner's to waive, and that is true regardless of how the request is phrased or how many
times it is repeated. Also worth keeping: the mockup screenshot that prompted this whole thread was
initially reported as "not found anywhere in the codebase" — a real search error (grepping
`VictorHub` instead of `VICTOR TRACKER`, the actual rendered string), not a sign the screenshot was
fake. **A negative grep result proves the search term was absent, not that the feature is.** Try the
literal on-screen string, in its actual case, before concluding a UI element doesn't exist in the
source.

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

**2026-07-31 — the entry below is now VERIFIED, not predicted.** `test:backend` ran green against an
empty `postgres:17-alpine` service container on pipeline #5, so the T017 harness does migrate the
schema itself with no `alembic upgrade head` in the job. The rule it protects is unchanged and still
load-bearing: **do not add a migration step to `.gitlab-ci.yml`** — two of them racing is worse than
neither, and the compensation is now proven rather than assumed.

**2026-08-02 — an amendment applied to one artifact is not applied, and the Phase 4 checkpoint caught
one nine tasks late.** The Phase 3 checkpoint overturned "the calendar passes a date range" and wrote
the resolution into `tasks.md`. The same claim was also in `contracts/openapi.yaml` and in
`research.md` R-007, and both were left asserting the opposite of the built code for the whole of
Phase 4. The contract had even come to **contradict itself four lines apart** — one paragraph stale,
the next correct — and a document that disagrees with itself is believed at whichever line the next
reader opens.

This was live rather than cosmetic, because **`specs/` outranks code**: T061's platform filter reads
that exact paragraph, so the next agent would have been *right* to send a date range, and the backlog
would have emptied. A stale spec is the dangerous direction of drift — stale code gets caught by a
test, a stale spec gets **obeyed**.

The rule: when a checkpoint amends a decision, **grep the claim across `specs/` and both
`AGENTS.md`**, and fix every artifact in the same merge request. Do not fix the file you happened to
have open. Related: this is also why `/speckit-analyze` earns its place beside `reviewer` — a clean
`reviewer` pass missed it, because reviewing code against specs cannot see two specs disagreeing.

**2026-08-02, extended 2026-08-03 — the contract has carried a defect at four checkpoints running,
and Phase 6 showed the failure mode is the *reason*, not the conclusion.** Phase 4 CRITICAL, Phase 5
HIGH, Phase 6 MEDIUM, **Phase 7 MEDIUM** — every one of them in `contracts/openapi.yaml`. Phase 7's
is the variant that breaks the usual defence: it was a **silence**, not a wrong sentence — the
contract never said which of `format: uri` and `pattern` it enforced, so the client guessed a subset
and shipped a validator stricter than the API. **"Grep the claim" cannot find an absent claim.** Stop
treating this as bad luck:
the contract is the artifact least often opened while building a surface and the one that outranks
code when someone does open it, so a wrong sentence there survives longest and is obeyed hardest.
**Read the whole `description` block of any operation you touch, every time.**

Phase 6's instance is the instructive one because the *conclusion* was still true. The contract said
the calendar sends no query parameters "because **each of these bounds `scheduled_date`**". Correct
advice, wrong reason — and the reason is the load-bearing half, because it is what a future agent
consults about some parameter that does not exist yet. Read literally it licenses sending any
parameter that bounds a different column, which is precisely backwards; `platform` (T060) was already
that parameter. **A rule stated as a property of today's parameters silently becomes a licence when a
new one arrives.** State the general form — here: every parameter narrows what the *server* returns,
and both surfaces read one loaded state.

The same amendment's "period" framing was also still in `data-model.md` and in **T061's own task
line**, nine tasks after it was overturned. Grepping the claim found them; reading the files would
not have.

**2026-08-03 — drift does not only *survive*, it **overwrites a correct record**, and the artifact
count is what makes it look authoritative.** Every prior instance of this trap was a stale claim
nobody had revisited. This one is the opposite and it is worse. The Phase 4 checkpoint recorded the
dev-overlay obstruction correctly — *"untappable under `next dev` and only under `next dev`. CI runs
the production bundle."* T057 then re-derived it from the symptom (a `view-month` click intercepted in
a local run), concluded `playwright.config.ts` "runs `next dev`" **without opening the config**, and
wrote the widened version into `CLAUDE.md`, `frontend/AGENTS.md`, `tasks.md` and a call-site comment
in `pipeline.spec.ts`. The config actually reads
`` `${process.env.CI ? "pnpm start" : "pnpm dev"}` `` — CI has never had the overlay.

**Four artifacts said one thing and one said the other, and the majority was the wrong one.** Worth
holding onto, because "grep the claim" was followed here and would have produced *conflicting* hits
rather than a clean answer — `frontend/AGENTS.md` contained both halves, fifty lines apart. When a
grep comes back split, **the tiebreaker is the executable artifact, never the count**: one line of
`playwright.config.ts` outranks any number of paragraphs about it. Same shape as the contract
problem, one level down — prose describing a config drifts from the config exactly as prose
describing code drifts from code.

It was already spending a later task's budget, which is the concrete cost: T057's paragraph made
"run the suite against `pnpm start`" **T069's** job, and T069 had nothing to do — CI already did.
A false claim in `specs/` does not sit inert, it **allocates work**.

**2026-08-05 — the sixth instance was in the record of the exception itself, and `git log` is the
executable artifact that settled it.** T076 had to state the constitution VI exception's exact range.
Four artifacts — `CLAUDE.md`, this file, `plan.md` and `CLAUDE.local.md` — said "every `--no-ff` merge
from **T008** through T024, 25 merge commits". The count was right and the range was wrong: the
merges start at **T001** (`299b496`), and all 24 task tags T001–T024 appear across those 25 commits.
Fixed in all four in T076's MR.

Two things make it worth keeping rather than just correcting. First, **the drifted claim was the
exception record itself** — the one paragraph whose entire job is to be the durable account of the
project's single knowing constitution breach, in the artifact set built to carry it. Nothing is
immune because nothing is important enough to be immune. Second, **the tiebreaker generalises past
config files**: the 2026-08-03 entry above says a split grep is resolved by the *executable*
artifact, and there the executable artifact was `playwright.config.ts`. Here it is
`git log --oneline --merges caca814~4` — **history is executable too.** Whenever a claim is about
what happened, the repository can be asked directly, and four paragraphs of agreeing prose lose to
one command.

**And the correction itself nearly reproduced the defect, which changes the rule above.** The first
grep was scoped to the files that seemed likely — `CLAUDE.md`, `.claude/`, `specs/`, both
`AGENTS.md` — and found four hits. There were **five**: `CHANGELOG.md` carried the same sentence and
was not in the list. It surfaced only on an unscoped repo-wide search. **A grep narrowed by intuition
about where a claim lives reproduces the very defect it is run to catch** — the artifact you forget
to search is by definition the one you were not thinking about. So the instruction in the entries
above, "grep the claim across `specs/` and both `AGENTS.md`", is **too narrow as written**: that
enumeration is a hint about where hits are *likely*, not a boundary. **Search the whole repository,
then filter the hits.**

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

**2026-08-15 — the reference product's remaining surfaces, triaged against this spec.** The owner
shared four screenshots of the real Spidey Tracker and asked which of its features are worth
building here. The triage below is the answer, and the point of writing it down is that **three of
its most attractive ideas are things this product's constitution forbids outright** — so the list
exists as much to record the rejections as the acceptances.

**Rejected outright, no trigger, do not revisit as "just a small version":**

- **"Report sightings" / "Share on X" / the social feed side panel.** Three separate surfaces in the
  reference, one answer here: a public or shared view of this map is named in the constitution's
  Scope Constraints as forbidden, and social-platform APIs are already Deferred with their own
  entry. This product's whole premise is a *private* archive — principle II calls a location history
  plus photographs "a pattern of life, not recoverable once disclosed". A share button is the single
  fastest way to undo that, and it would look like a small feature.
- **The "you are here" live-tracking dot** (the pulsing marker following the device). Automatic
  location capture, forbidden unconditionally and named *first* among the exclusions precisely
  because it is the most attractive one.
- **"Videos" / "Events" / marketing chrome.** No entity in `data-model.md` backs either, and neither
  is a travel-memory concept — they are film-promotion surfaces.

**Already planned — not new work, just confirmation the plan matches the reference:**

- **The status-filter chips down the left edge** are `T050`'s `StatusFilter` (Phase 7, US5). The
  reference putting them on a rail rather than a row is a layout note for that task, nothing more.
- **The radar/compass** is already sanctioned by `design/003-travel-map/BRIEF.md` as **pure chrome,
  decorative only, no binding to real map data** — optional, owner's call, and explicitly *not*
  allowed to become live tracking.

**Worth building, in a later iteration with its own `spec.md` — the two that genuinely fit:**

- **A Travel Log** (the reference's "Activity Log"): the same Destinations the map draws, as a
  reverse-chronological list — status badge, name, date. Its whole appeal is that it needs **no new
  column at all**: `destination.name`, `.status`, `.start_date` already exist, so it is a second
  presentation of loaded state, the same relationship `BacklogDrawer` has to the calendar. It
  answers a question the map genuinely cannot ("what did I do, in what order"), because a map is
  organised by *place* and a trip is remembered by *time*. **Trigger**: the owner has enough visited
  places that scanning pins stops being how they find one. Not a side effect of a map task — it is a
  surface, so it needs its own spec and its own place in a story.
- **A full-screen photo viewer** for a visited Destination. `DestinationSheet` currently draws a
  3-column grid of presigned thumbnails, and a photograph of a place you went is the one thing in
  this product worth looking at large — FR-007/FR-008 are satisfied by the grid, but only barely.
  The reference's card carousel is the shape. Small, self-contained, and the highest ratio of value
  to risk on this list. **Trigger**: the first time the owner actually wants to look at a photo
  rather than confirm one is attached.

**The layout lesson, already applied rather than deferred**: the reference's map is *inset*, with a
band of real content beneath it, and that shape is why it reads as an instrument. Applied on
2026-08-15 (`MapShell` + `DestinationStrip`), so it is recorded here as done, not as an idea.

**2026-08-05, superseded 2026-08-08 — renaming the project away from "CreatorHub".** The name
stopped describing the product at the 2.0.0 amendment and was deliberately left alone for the
reasons below, until the owner asked for the rename explicitly on 2026-08-08.

**Tier 1 is done as of 2026-08-08**: every brand-text occurrence of "CreatorHub" in documentation,
UI strings, page titles and comments is now "VictorHub", the `docker-compose.yml` project name is
`victorhub`, and the backend package name is `victorhub-backend` — all through a single MR
(`chore/rename-victorhub`), gated by the usual pipeline. **Deliberately left unchanged**: the local
Postgres user/database defaults (`creatorhub` / `creatorhub_test`), the session/theme cookie names
(`ch_session`, `ch_theme`) — none of these are user-visible, and changing them buys nothing while
risking a live session or a stray Docker volume.

**Tier 2 is still open**: the GitLab project path (`origin` = `.../creator-hub`), the GitHub mirror,
and the Render/Vercel service names/URLs (`creator-hub-1dgs.onrender.com`,
`creator-hub-hazel.vercel.app`) all still say the old name, because each is a **live** system that
this session cannot safely change unattended — renaming touches remotes, mirror force-push
semantics, and possibly the live URLs themselves. The runbook (order: GitHub mirror → GitLab
push-mirror config → GitLab project path → `origin` → Render → Vercel → re-walk `t072-walk.mjs` →
update docs with final URLs) is recorded in the rename plan from that session; do it as its own pass
whenever dashboard access is available, not as a side quest inside a feature branch.

**Superseded again 2026-08-14 — a second Tier 1 pass, VictorHub → Victor Tracker.** Same shape as the
first: `chore/rename-victor-tracker` touched every brand-text occurrence of "VictorHub" in
documentation, UI strings, page titles and comments, moved the `docker-compose.yml` project name to
`victor-tracker`, and the backend package name to `victor-tracker-backend`. **Same exclusions as
before, unchanged again**: local Postgres `creatorhub`/`creatorhub_test` defaults, the
`ch_session`/`ch_theme` cookie names. **Tier 2 above is still the accurate, current state** — every
infra name it lists still says "creator-hub", now two brand-text renames behind. See the Decisions
entry below for why the name changed a second time (it collapses a naming scheme
`002-pixel-arcade-skin` had already introduced) and for a note on the Spider-Man-IP question that
came up in the same session.

**2026-08-05 — retargeting `content_item` from content pipeline to trip itinerary.** Content Calendar
survives the pivot unchanged, behind the nav drawer. Its `platform`, `status` and `published_url`
columns are meaningless for travel and its `title`/`scheduled_date` pair is exactly right, so the
honest version of "a calendar for planning trips" is a migration plus a re-spec, not a rename of some
labels. Deferred because the rewrite would break most of 271 backend and 432 frontend tests while
moving the map forward by nothing. **Trigger**: you actually use the calendar to plan a trip and the
three dead fields get in the way. It is a full iteration with its own `spec.md` — the constitution
says so explicitly, so this is not a judgement call a future session gets to make on its own.

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

**2026-08-05 — The stacked cold start, which is the only reason an acceptance criterion fails.**
Measured at T072: capture is 3 interactions and **1.89s warm**, but **47.27s** on the first
interaction of the day — the `/calendar` document alone is **44.18s**. **SC-001 fails cold and holds
warm**, and the cause is that the first request crosses **two** suspended free tiers: Render's
service spins down *and* Neon's database auto-suspends, stacked. The interaction count, the half of
SC-001 the product controls, is 3 either way.

The remedy is operational, not a design change: **a paid tier on either service, or a keep-warm
ping**. Not done at v0.1 because it costs money for a single-user tool whose owner can wait 45
seconds once a day. **Trigger for picking it up**: a second person uses it, or the creator reports
avoiding the app at the start of the day. Note before choosing the cheap option — a keep-warm ping
must wake **both** services, and pinging Render's `/health` does not touch Neon, because `/health`
does not query the database.

**2026-08-11 — The Travel Tracker product spec, captured but not started.** Full input is
`drafts/travel-tracker.spec.draft.md` (the same role `content-calendar.spec.draft.md` played for
001) — Map/Calendar/Trip linked through `Destination`/`Activity`, MVP field list already scoped down
by the owner, a full dashboard mock. **Two sections (§8 Route, §1/§9/§10/§13 Budget) collide with
named constitutional exclusions** — CLAUDE.md's "What this is" lists "route planning, budgets" first
among the things this product is structured to keep out. **The owner's 2026-08-11 decision: amend the
constitution to permit both, rather than strip them from the draft.** Automatic location capture (the
third named exclusion) is not requested anywhere in the draft, so that one stands as ratified.

**Trigger to pick this up: `002-pixel-arcade-skin` reaches T047 (tag + retro) and closes.** The
owner's explicit sequencing (2026-08-11): finish 002's remaining Phase 5–7 first rather than leave it
half-done while a second iteration opens — the same "one module at a time" reasoning as the
2026-07-29 entry above. When it is time: `/speckit-constitution` first (2.0.0 → next, recording the
route/budget permission with its reasoning), then the `new-feature` skill / `/speckit-specify` against
the draft file — which has **not** been through `/speckit-clarify` and has open questions the draft
file's own closing section lists (a geocoding provider for turning a typed search into lat/long is
the one most likely to block T001 of that iteration).

**2026-08-15 — Route and trip budgeting: constitutionally permitted, deliberately not built in 003,
and this is the entry `spec.md` said would exist.** `specs/003-travel-map/spec.md`'s Assumptions
section defers both "despite being constitutionally permitted since the 2.1.0 amendment — **Recorded
as a deferred item once this spec is committed**". The spec was committed and merged (MR !68) and no
such entry was ever written. That is the **seventh** instance of this project's own recurring trap,
with `.claude/memory.md` as the artifact left behind this time rather than `contracts/openapi.yaml` —
and it is worth noticing that the promise itself named the file it was owed to. Discharged here.

**Route (draft §8).** The distinction that matters, because the draft draws them as one feature:
**a line between Destination coordinates in trip order is nearly free** — a MapLibre line layer over
data the map has already loaded, one ordering column on `destination`, and no request leaves the
browser that was not leaving it already. **Real routing** — road or rail geometry, distance,
duration — needs a routing provider, and that is a third-party request carrying *the sequence of
places the owner is going to*, which is a materially larger disclosure than the tile viewport
`tech-defaults.md` accepted. Principle II governs the second and has nothing to say about the first.
**Do not price them as the same feature.** **Trigger**: a Trip with three or more Destinations where
the order starts mattering — the same moment `destination` needs its ordering column, so the
migration and the line layer arrive together.

**Budget (draft §1, §9, §10, §13).** Not a field, an iteration: currency, per-Destination versus
per-Trip totals, and what a total means when a Trip is half-planned. The reason "budget", "cost" and
"expenses" appear in four separate places in the draft is that they are one feature seen from four
screens. **Trigger**: the owner actually tracks money against a trip. Transportation and
Accommodation (see the V2/V3 entry below) arrive with it, not separately.

**2026-08-15 — Destination category and priority, and the second filter dimension they smuggle in.**
`spec.md`'s Assumptions defers both, stating "the map's filter for this iteration is by status only".
They are the cheapest items on this whole list — two nullable columns and two controls — which is
exactly why they are the most likely to be slipped into a task scoped for something else.

**The specific warning**: draft §7 puts a category filter directly beside the status filter, and
`StatusFilter` must not grow a second axis on its own initiative. A second axis is not a component
change; it changes what the empty state says, what the clear control clears, and what SC-001's "tell
them apart without tapping any of them" is promising. That is a spec question.

**And category must not compete for the pin's encoding channel.** `design/003-travel-map/BRIEF.md`
locks the pin as a shield silhouette with an outline→half→solid progression, and what it encodes is
**status**. Draft §4's eleven emoji-led values are a filter and a label, never a second pin shape.

**Trigger**: filtering by status stops being how the owner finds a place — in practice, when
`visited` alone is a few dozen pins.

**2026-08-15 — Activity and an itinerary Calendar: the largest deferred thing, and the one with a
question that must be settled before any of it is estimated.** FR-027 states 003 does not build it
and that any future iteration starts from its own `spec.md`. Draft §5/§6/§16 describe it fully: an
Activity has a title, a date, a start time and a location, and the Calendar draws Trip, Destination
and Activity together.

**The question, which belongs to `/speckit-clarify` and must not be answered by assumption**: is
`Activity` a new table, or is it the `content_item` retarget the 2026-08-05 entry above already
describes? Those two entries are one decision seen from opposite ends — that one asks "what happens
to Content Calendar", this one asks "where do itinerary items live" — and answering either silently
answers the other. The draft's own closing section flags this too.

**A second inheritance, easy to miss**: an Activity carries a **start time**, and the whole of 001
was built on "calendar day only, no time of day" (FR-012a) specifically to keep timezones and DST out
of the data. An itinerary with 09:00 in it reopens exactly that, and "Time-of-day scheduling" is
already its own Deferred entry above. Whoever picks this up inherits three linked entries, not one.

**Trigger**: the owner plans a real multi-day trip and wants a day-by-day timeline rather than a set
of pins.

**2026-08-15 — The rest of the input draft's V2 and V3 lists, triaged rather than left as a wish
list.** `drafts/travel-tracker.spec.draft.md` §9, §10, §13 and §14 hold everything 003 did not take.
Kept as one entry because none of them is individually a spec, and splitting them into eleven entries
would make a wish list look like a backlog.

- **Arrive with Budget, not separately** — Transportation (§9), Accommodation (§10), Reservations.
  All the same shape: an entity beside a Destination carrying a cost, a time and a booking reference.
  Building any of them before Budget produces a cost field with nowhere to total.
- **Cheap metadata, no new machinery** — Trip cover image, description, tags (§1, §13). Cover image
  reuses the presigned R2 path 003 already built end to end, so it is genuinely small. **Travel
  companions is a text field, not an account** — worth stating, because it looks like it brushes the
  multi-user entry above and does not: principle VII forbids speculative `user_id` columns, not
  recording who you went with.
- **Needs a principle II reading before anyone estimates it** — Google Maps integration, route
  optimization, weather (§14). All three send coordinates or trip data to a third party; the draft's
  closing section already flags the first. **Weather looks innocuous and is not** — a forecast request
  keyed to a place and a future date discloses where the owner will be and when.
- **No opinion yet, and none needed** — AI itinerary, statistics, photo timeline, packing list,
  checklists, reviews (§13, §14). Photo timeline is the likeliest of these to become worth doing,
  because it is a third presentation of data already stored — the same class as the Travel Log.

**Trigger for the group: none.** This is input for a future `/speckit-specify`, not scheduled work.
Pick an item out of the list when a real need names it, and give it its own `spec.md`.

**2026-08-15 — Reading a photograph's EXIF geotag to place its pin: not a feature session's call.**
Not in the draft. Recorded because it is the obvious next idea once photographs and coordinates are
both in the product, and because it is the nearest miss on the exclusion the constitution names
first.

Both directions, stated honestly. It is **not** automatic location capture in the sense the
constitution forbids: the owner picks a file, deliberately, after the trip; there is no background
collection and no device permission. But it **is** location data entering the product without anyone
typing it, extracted from an artifact the owner may not know carries coordinates at all.

**The rule this entry exists to set: that is a constitution question, not a judgement available to a
session building a feature.** Route and budget needed the 2.1.0 amendment to become permissible and
they sit further from the line than this does. **Trigger**: nothing is built until
`/speckit-constitution` has stated a reading explicitly — permitting it with a reason, or refusing it
with one. "It seemed fine" is not that reading.

**2026-08-15 — Caching geocoding results.** `GET /locations/search` proxies Nominatim, whose usage
policy is roughly one request per second and requires an identifying User-Agent. Nothing caches
today: every completed search is a fresh upstream call, in a product whose owner searches the same
few places repeatedly. Deferred because one owner does not reach that limit, and a cache is a table
plus an invalidation question for a problem that has not appeared. **Trigger**: search feels slow, or
the provider rate-limits. The fix then is caching the query→coordinates pair — not switching
provider, which costs an API key and a new disclosure to solve a caching problem.

**2026-08-15 — If 004 needs a subject, this is the shortlist in order.** Ranked by value against
cost, so that whoever opens the next iteration does not re-derive the ordering:

1. **Travel Log** and the **full-screen photo viewer** — the reference-product triage entry. Neither
   needs a new column; both re-present data the surfaces already load.
2. **Destination category and priority** — two columns, one filter dimension, one spec question.
3. **Route, straight-line only** — one ordering column and a line layer. Explicitly *not* a routing
   provider; see the Route entry for why that distinction is load-bearing.
4. **Activity and the itinerary Calendar** — the largest, and blocked on the `content_item` question.
   `/speckit-clarify` comes first for this one, not last.
5. **Budget**, with Transportation and Accommodation attached to it.
6. Everything else in the V2/V3 entry, on demand.

**This is a ranking, not a plan.** Nothing here is scheduled and nothing here gets built until it has
its own `spec.md` — the third non-negotiable is unchanged. Items 1–3 are each small enough that a
single iteration could reasonably carry two of them; items 4 and 5 are each a full iteration alone.
