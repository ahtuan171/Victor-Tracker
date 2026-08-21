# Changelog

All notable changes to Victor Tracker are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project ships one module per iteration, each restarting the full eight-stage workflow with its
own `spec.md`. **The product pivoted after v0.1**: it is a personal travel memory map, not a
content-creator brand operating system.

**On the name.** The product's brand text has been renamed twice — "CreatorHub" → "VictorHub"
(2026-08-08) → **"Victor Tracker"** (2026-08-14). The **infrastructure** still says "creator-hub":
the GitLab project path, the GitHub mirror, and the Render/Vercel service names and URLs, none of
which is user-visible and each of which is a live system with its own runbook
(`.claude/memory.md`, Deferred). Entries below their own dates use whichever name was current then,
deliberately — they are a record, not a rename target.

## [Unreleased]

## [0.5.0] — 2026-08-19

**Travel Log — a reverse-chronological timeline of the same Destinations the map already draws.**
13 tasks, 3 phases, frontend-only, no database schema change. Full detail in
[`docs/retro-05.md`](docs/retro-05.md), including a process finding this retro states plainly: the
whole iteration landed in a single merge request (spec and implementation together), no hand-walk of
`quickstart.md` was recorded, and no `reviewer` pass is on file — a departure from every prior
iteration's Final Phase, named as such rather than left implicit.

### Added

- **Travel Log** (UI label: **Collection**) — a slide-over timeline listing every Destination in
  reverse-chronological order (`start_date DESC`, then `created_at DESC`), each entry showing its
  status cue, name, formatted date range and attached Trip name.
- **Status filter** inside the Travel Log (`All` / `Visited` / `Planned` / `Wishlist`), narrowing the
  already-loaded list client-side — the same pattern the map's own `StatusFilter` already uses.
- **Tapping a log entry** opens that place's `DestinationSheet` and eases the map camera to its pin,
  reusing the selection seam `004` built.

### Known gap

- **No hand-walk of `quickstart.md` V1–V4 exists for this iteration** — every prior iteration's Final
  Phase includes one; this one's did not. The automated Playwright suite is green, but per this
  project's own standing rule (`.claude/memory.md`), a green suite that stubs the proxy is evidence
  about the frontend in isolation, never about the browser → proxy → API seam. Owed, recorded rather
  than quietly dropped.

## [0.4.0] — 2026-08-19

**Opening a place stopped being a disappointment for two of the map's three pin statuses.** Selecting
a pin now brings the map to it and marks it selected; a one-tap confirmation names the place before
the full detail opens, so a mis-tap on a crowded map costs a glance rather than a screen. What the
detail shows is chosen by status — Visited opens to photographs and impressions, Planned opens to its
Trip context (with a plain statement when its dates fall outside that Trip's range, or when today
falls inside them), Wishlist opens to an honest invitation to plan rather than blank fields. The
status control now asks progressively for what each destination status makes meaningful. 34 tasks, 8
phases, roughly 20 merge requests. Full detail in [`docs/retro-04.md`](docs/retro-04.md).

**T031 hand-walked `quickstart.md` V1–V6 twice against a real production build, 19/19 scenarios
passing.** Re-runnable as `frontend/scripts/t031-walk.mjs`. All seven success criteria hold, with the
same R2 caveat `v0.3.0` already carries: the Visited gallery's "at least one photograph" scenario is
walked with a note only, since no photograph has ever reached real object storage.

### Added

- **Selection** — tapping a pin eases the map camera to centre it and marks it visibly selected
  (shape, not colour alone); at most one place selected at a time; dismissing a selection leaves the
  map where it is; overlapping pins at the current zoom separate on tap.
- **A confirmation step** between selecting a pin and opening its detail, naming the place and its
  status, dismissible with nothing changed.
- **`VisitedPanel`, `PlannedPanel`, `WishlistPanel`** — three distinct detail presentations chosen by
  the place's status, replacing the single near-empty sheet every non-Visited place opened to before.
- **Status-progressive editing** — moving a place to Planned asks for its dates and Trip; moving it to
  Visited asks for impressions and photographs; a status change always saves even when a newly-asked
  field is left empty, preserving `003`'s FR-028 guarantee unnarrowed.

### Fixed

- **Two edge cases `spec.md` already described but the shipped code did not honour**, found by a
  pre-merge `/speckit-analyze` pass: a place deleted elsewhere while its sheet was open now closes the
  sheet instead of showing a stuck in-sheet error; the selected place's pin and detail now clear when
  the active status filter no longer includes it, instead of leaving a selection the owner can no
  longer see on the map.
- **The first fix for the deletion case was itself incomplete** — closing the sheet never reloaded the
  destination list or cleared the map's own selection state, leaving a deleted pin visibly selected
  indefinitely. Caught by a `reviewer` pass before merge and fixed in the same MR.

### Deliberately not built

Total cost, who the owner travelled with, a scheduled hour-by-hour itinerary, and merging Trip into a
place are all named out of scope in `spec.md`'s own "Why this iteration" section, each with a stated
reason, and none of them appeared in the 34 tasks.

## [0.3.0] — 2026-08-17

**The Travel Map — the constitution's named core capability, and the reason the 2.0.0 amendment
happened.** A world map of places visited, planned and wanted, where tapping a visited pin opens the
photographs and notes kept against it. 62 tasks, 8 phases, 32 merge requests. Full detail in
[`docs/retro-03.md`](docs/retro-03.md).

**T056 hand-walked `quickstart.md` V1–V9 against a real production build** — `pnpm build && pnpm
start`, the compose backend, real Postgres, **real CARTO tiles and real Nominatim**, nothing stubbed.
**16 of 17 checks pass; all six success criteria hold.** Re-runnable as
`frontend/scripts/t056-walk.mjs`.

### Added

- **`/map`** — a MapLibre world map on CARTO's dark-matter basemap, pannable and zoomable at the
  375px floor, with the inset `MapShell` + `DestinationStrip` layout.
- **Status-distinguishable pins** — a shield silhouette with an outline→half→solid progression, so
  Visited, Planned and Wishlist are tellable apart by **shape, not colour alone**, and survive
  greyscale. A **Currently Traveling** overlay is computed from today's date falling inside a Planned
  Destination's range — never stored, so it cannot go stale.
- **The Destination sheet** — note, photo gallery and a free-direction status control, offered only
  on a Visited place; a Planned or Wishlist pin gets neither.
- **Trips** — create, list, edit and delete, with a Destination's dates **flagged** when they fall
  outside its Trip's rather than the write being refused, and a three-tap confirmation naming
  everything a Trip delete cascades to.
- **Location search** — `GET /locations/search`, proxied server-side to Nominatim so the usage policy
  is satisfied by one identified caller. A typed name always resolves to real coordinates; a search
  matching nothing is a plain empty result, kept **distinguishable** from a search that failed.
- **Quick Add** — mark a new place from the map in at most three interactions, with or without
  attaching it to a Trip, and no page transition.
- **Status filter** — narrow the map to one status and clear back to all, by narrowing the
  already-loaded list client-side rather than re-reading the server on every tap.
- Three tables (`trip`, `destination`, `photograph`), one Alembic revision, 14 API operations.

### Known gap

- **Photograph upload has never run against real object storage.** The Cloudflare R2 bucket named as
  a prerequisite was never provisioned, so all four `r2_*` settings are empty in every environment
  and FR-023–FR-025 are stubbed in both suites; quickstart **V6 could not be walked at all**.
  Recorded unsoftened, the way v0.1 recorded SC-001 failing cold. Provisioning R2 and re-running V6
  is owed. An unconfigured R2 now fails with a message naming all four variables instead of an
  opaque botocore `ValueError`.
- **FR-028's status control has no automated frontend test.** The free-direction status change is
  covered at the API layer and by T056's hand-walk, and by nothing in the Playwright suite.

### Fixed

- **MapLibre's worker died silently under Turbopack**, producing a fully-wired map drawing a
  completely black canvas — style, sprites and attribution all load on the main thread, and vector
  tiles are the only thing the worker fetches, so every existing test passed against it for two
  phases. Fixed by serving the worker and its shared chunk under their original names, with
  `predev`/`prebuild`/**`prestart`** hooks; the regression test asserts a real `.mvt` request,
  the one thing no main-thread fetch can satisfy.
- **A `trip_id` naming no Trip returned `500 text/plain "Internal Server Error"`**, breaking the
  uniform `{"detail": "…"}` body every other error carries. Now a `422` on both create and update.
  Reachable in practice: a Trip deleted on one device with a stale add-flow open on another.
- **A Nominatim response that arrived but could not be parsed escaped as a 500** instead of the
  contract's 502. Returning an empty list would have been the worse repair — "no matches" and "the
  search broke" are exactly what the owner must be able to tell apart.

### Deliberately not built

Route display, trip budgeting and every cost field — **despite both being constitutionally permitted
since the 2.1.0 amendment.** Also Destination category and priority, Transportation and Accommodation
records, and Activity with its own itinerary Calendar. Each is recorded in `.claude/memory.md` with a
trigger condition rather than as a bare list. Automatic location capture, any public or shared view
of the map, and social-platform integration remain **forbidden outright**.

## [0.2.0] — 2026-08-11

**The pixel-arcade presentation layer, hand-walked against a real production build before tagging —
the same standard v0.1 held itself to, and for the same reason.** T044 walked `quickstart.md` V1–V11
against `pnpm build && pnpm start`, real Docker `backend`, real Postgres, the single seeded creator
signing in for real. Fifteen of fifteen success criteria hold. Full detail in
[`docs/retro-02.md`](docs/retro-02.md); results are in the T044 note in
`specs/002-pixel-arcade-skin/tasks.md`.

**Nothing about what the calendar does changed.** FR-003/SC-010 required every task completable
before this iteration to remain completable afterwards, in no more interactions — verified by
re-walking v0.1's own quickstart in full (V11) against this iteration's build, including capture
still costing exactly three interactions.

**One real, production-only defect was found by the walk and fixed before this tag**: the navigation
drawer's Escape key used to close the capture sheet underneath it too, discarding an in-progress
draft (FR-018). It reproduced consistently against a production build and not at all under `next
dev`, so a Playwright test alone would not have found it — matching v0.1's own retro finding that a
green suite is evidence about the frontend in isolation, not about the deployed seam. Fixed with a
capture-phase event listener, verified by breaking it again and confirming the new regression test
goes red.

**Also carried in this release, from the point the product pivoted:**

- **The product pivoted to a personal travel memory map**, and the constitution was amended to
  **2.0.0** to say so — a MAJOR bump, because principle III's module set is replaced and the Scope
  Constraints section is rewritten. Principle II is renamed and **strengthened**: a location history
  with photographs is a pattern of life, so no public object-store bucket is permitted and no
  third-party request — map tiles included — may carry a place name, pin label or record id.
  Growth Tracker, Media Kit Generator and Deal/Collab Tracker are **cancelled**, not deferred.
- `tech-defaults.md` gained a **Map** row (MapLibre GL JS, dark basemap) and an **Object storage** row
  (Cloudflare R2, presigned PUT and expiring presigned GET), ahead of the map iteration (renumbered
  `003`) that will use them.
- **Content Calendar is retained unchanged** as a secondary scheduling surface behind the navigation
  drawer built in this release. Retargeting `content_item` to trip itineraries is a later iteration
  with its own `spec.md`.

### Added

**One machine, not two products**
- Every existing screen and overlay re-presented in one visual language — typefaces, colour tokens,
  frame, control treatment — replacing the previous dark editorial presentation everywhere at once
  (FR-001, SC-001).
- A further "comic-tech" visual refinement pass, finished inside this same iteration per the rule
  that only the iteration whose entire subject is the redesign may touch the shared token layer:
  branded chrome (`VICTOR TRACKER · ISSUE #NN`), comic-panel cards, comic-tab platform filter,
  press-feedback micro-animations, a halftone/web-line texture pass.
- The presentation language encodes nothing calendar-specific, so the travel map (iteration 003)
  inherits the same chrome (FR-002).

**Navigation and settings**
- A single navigation drawer, reachable from every screen in one tap, listing every screen the
  product has and holding the presentation choice, the sound choice, and sign-out (FR-015, FR-016,
  SC-007).
- Sign-out moved out of the header into the drawer, deliberately further from the thumb's resting
  position than the frequently-used controls (FR-017).
- Dismissing the drawer — by its close button or by Escape — returns the person to exactly where they
  were, including a capture sheet open underneath it with typed text intact (FR-018).

**A remembered dark or light presentation**
- A dark/light switch, applied in under a second with no navigation and no scroll-position loss
  (FR-010, SC-005).
- Remembered **against the account**, not the device — correct on a second browser profile, correct
  under a throttled connection, and never showing the wrong presentation even for one frame at first
  paint (FR-011, FR-013, FR-013a, SC-006).
- Dark before any choice has ever been made (FR-012).

**Optional sound**
- Five short cues synthesised with the Web Audio API — no audio assets, no library — attached to
  exactly the actions that change stored information (capture, save, delete, move) plus a
  distinguishable refusal cue (FR-023a).
- Silent until explicitly turned on, and immediately silent again when turned off (FR-020, SC-009).
- Navigation, filtering, view changes and panel toggles never produce sound, verified with sound on
  as well as off (SC-015).

**A status ticker**
- A moving strip reporting the overdue count and the next thing due, agreeing at all times with the
  same counts shown elsewhere on screen, and fully readable from one still frame — including while
  motion is reduced (FR-027–FR-031, SC-008, SC-012, SC-013).

**Accessibility and legibility**
- Every appearance-based distinction — status, overdue, the new comic-tab active state — verified
  distinguishable with colour removed entirely, in both presentations (FR-024, SC-004).
- A single focus indicator across every control in both presentations, never clipped by a control's
  own shape (FR-026, SC-011).
- Text floors: nothing anywhere below 12px, nothing below 16px in content text (FR-032–FR-034,
  SC-014).

### Infrastructure

- Two new columns on the existing single `creator` row (`theme`, `sound_enabled`) and
  `GET`/`PATCH /preferences`, gated by the same CI pipeline as everything else. No new records beyond
  these two account-level preferences.
- **This branch's entire history (33 commits, T001 through T053) went through one merge request
  rather than one per task** — a recorded constitution VI exception, discovered only when a review
  pass at T045 found the branch had never been merged to `main` at all. Full account in
  [`docs/retro-02.md`](docs/retro-02.md) §2.1.

## [0.1.0] — 2026-08-05

**Content Calendar, walked against the deployed environment before being tagged.**

The tag was deliberately held until T072 had walked quickstart V1–V9 against production, because
tagging a release that no deployment has been walked against would make the tag a claim without
evidence. Decided with the project owner on 2026-08-03, recorded under T074 in
`specs/001-content-calendar/tasks.md`, and discharged here.

**The walk (2026-08-05): V1–V9 and US4 all pass** against `creator-hub-hazel.vercel.app` at 375px —
browser → Vercel → Render → Neon, nothing stubbed. Eleven of twelve success criteria hold.
Re-runnable with `frontend/scripts/t072-walk.mjs`; the full table is in the T072 note in `tasks.md`
and the criterion-by-criterion comparison is in [`docs/retro-01.md`](docs/retro-01.md).

**SC-001 fails cold and holds warm, and both numbers are recorded rather than the flattering one.**
Capture costs 3 interactions and **1.89s warm** against a 15-second budget. The first interaction of
the day costs **47.27s** — the `/calendar` document alone is **44.18s** — because the first request
crosses two suspended free tiers, Render's spin-down and Neon's auto-suspend, stacked. Warm, the same
walk is **3.92s**. The interaction count, which is the half of SC-001 the product controls, is 3
either way, so this is the hosting tier failing a product criterion rather than the capture path.
The remedy is a paid tier or a keep-warm ping; both are operational, neither is a design change, and
both are deferred out of v0.1. **A keep-warm ping must wake both services** — pinging Render's
`/health` does not touch Neon, because `/health` deliberately does not query the database.

**SC-010 is recorded as correct by construction but unobserved.** It asks that a session survive 30
days, which nothing shipped can observe in a day. The sliding-reissue mechanism is tested end to end
and a real sign-out and sign-in was walked at T072, but marking it passed on a mechanism rather than
an observation is the citation-shaped evidence this project has twice been caught by.

## What a creator can do

A signed-in creator can capture an idea, find it in the backlog, move between months and weeks, read
every dated item's status, platform and overdue state without opening it, open it and change every
field, drag it onto a day or back to the backlog, filter by platform, paste a published link and open
the live post, delete it behind an explicit confirmation, and sign out.

### Added

**Capture and backlog**
- Title-only idea capture from a bottom-anchored sheet, reachable in at most 3 interactions
  (FR-005, SC-001). Platform and date are optional at creation, because any required field beyond a
  title is enough friction to send the creator back to a notes app.
- A backlog of undated items, newest first, as a **drawer on the calendar surface** with a collapsed
  peek strip and an expanded state — not a separate route. One DOM tree is what makes
  drag-from-backlog-to-day possible at all (research.md R-003a).

**The calendar**
- Month grid and week list, with navigation to adjacent periods (FR-013). Week view is a vertical
  list of day sections rather than seven columns; at 375px a seven-column week with readable chips
  does not exist, and FR-021 forbids solving that with horizontal page scroll.
- Hand-built from `date-fns` primitives. No calendar library — every library's value is time-of-day
  layout, which FR-012a removed.
- Status shown by **shape and fill** (outline → half → solid-with-check) and platform by a letter
  monogram, so both survive greyscale and glare (FR-017, FR-018, SC-004). Overdue is a border, not a
  fourth status.
- An overdue count in the header, over every loaded item rather than just the visible period.
- Empty states for three distinct cases: first run with no items, a period with nothing scheduled,
  and every item hidden by an active filter (spec Edge Cases).

**Moving items through the pipeline**
- `idea → draft → posted`, reversible, with every field preserved on a backward move — including the
  published link, which cannot be reconstructed (FR-008a, FR-019a).
- Moving past `idea` without a platform is refused with `platform_required`; clearing the platform of
  an item past `idea` is refused with `platform_locked` (FR-009, FR-009a). The invariant "past `idea`
  implies a platform is set" therefore holds for every stored item at all times.
- Scheduling by **drag** (`@dnd-kit`, pointer sensor with an activation constraint so a scroll gesture
  never silently reschedules) and by **tap**, both issuing the same `PATCH` (FR-014a).
- Status changes are **tap-only** by design. A status drag needs lanes, lanes do not fit at 375px, and
  a lane-based board is a second core capability the constitution does not permit this module.
- The whole `idea → posted` journey is completable with no drag gesture at all (FR-015b, SC-011).

**Platform filter and published links**
- Filter to one platform or show all, applied in local state with no server round trip (FR-016,
  SC-005).
- A published link on any item, pasted by hand, opening the live post in a new tab with
  `rel="noopener noreferrer"` (FR-019).

**Auth and privacy**
- One seeded creator account. No registration, no password reset, no multi-tenant columns.
- JWT in an `httpOnly; Secure; SameSite=Lax` cookie on the frontend origin, with a Next.js
  allowlisted proxy attaching it as a bearer token on the hop to FastAPI. The browser never contacts
  the API origin directly, so an XSS bug cannot exfiltrate a 30-day credential (research.md R-001,
  R-008).
- **~30-day session with sliding reissue**: one access token, reissued past its half-life via an
  `X-Access-Token` response header that the proxy rewrites into the cookie with a `Max-Age`. There is
  no refresh token and no refresh endpoint (FR-002a, SC-010).
- Sign-out from the calendar header.
- Every calendar, backlog, and item address redirects a signed-out visitor before any content markup
  is generated (FR-001, FR-002, SC-006).

**Deletion**
- Behind an explicit confirmation, never reachable by a single tap or by a common navigation gesture
  (FR-020, SC-007).

### Infrastructure

- **Deployed for the first time on 2026-08-04**: backend on Render, frontend on Vercel, database on
  **Neon**.
- GitLab CI gates every merge — `build → test → review → deploy`, with `ruff`, `mypy`, `eslint` and
  `tsc` plus both suites blocking the merge. `main` refuses direct pushes and
  `only_allow_merge_if_pipeline_succeeds` is `true`.
- Both `deploy` jobs are manual per the v0.1 tech defaults, and **fail loudly rather than reporting
  success when a deploy hook variable is missing** — a green deploy job that deployed nothing is worse
  than a red one.
- **271 backend tests and 432 Playwright tests across four projects** (`contract`, `proxy`, `client`,
  `mobile-375`), none skipped.

### Changed

- **The database host moved from Render's managed Postgres to Neon** (T071). Render's Postgres could
  not be created on the workspace at all, and its free tier is *deleted* after 30 days rather than
  suspended — so the option that existed would have re-presented the same problem in a month with live
  data in it. Deployment targets are unchanged and the technology is still PostgreSQL. Stated in
  `plan.md` as the constitution's Scope Constraints require, with `.claude/rules/tech-defaults.md`
  amended in the same merge request.

  *The cost, stated rather than left to be discovered:* Neon is reached over the public internet
  rather than an internal network, and its free tier auto-suspends. Stacked on Render's own free-tier
  spin-down, **the first request of the day now crosses two cold starts.** This lands on SC-001, and
  measuring it is what T072 does — the number will be reported as measured, including if it fails.

  **Measured at T072: it does fail, cold.** 47.27s for the first interaction of the day against a
  15-second budget, and 1.89s warm. The prediction above was correct and the promise to report it
  either way is kept in this release's own section, at the top of this file.

- **The Auth row of `.claude/rules/tech-defaults.md` now permits sliding reissue explicitly** (T075),
  amended at the Reflect stage, which is the only stage that row may change in. It previously forbade
  "refresh" outright, which collided with FR-002a's silently-renewing session. The rule that replaced
  it protects the same thing: one token type, no refresh endpoint.

- **`pwdlib` replaced `passlib`** before any code depended on it (T002). passlib 1.7.4 is unmaintained
  and dead on Python 3.13 — its own backend-capability probe raises against bcrypt 5.0.

### Known limitations

Accepted for a single-user tool at v0.1, each with the trigger that would make it worth revisiting.

- **A leaked token cannot be revoked.** Reissue-on-use plus no denylist means a token that escapes
  grants indefinite access rather than at most 30 days. Sign-out clears the cookie and ends the
  session from the browser's point of view, but the token stays valid until expiry. This is the first
  thing to revisit if VictorHub ever serves a second person.
- **Last write wins, silently.** No version marker and no conflict branch (FR-023a). The only person
  who can be overwritten is the creator, from their own second window.
- **Nothing pushes updates to an open view.** A second device's change appears on the next load.
- **One platform per item.** Content for two destinations is two items. Widening this later is
  additive, which is why the direction was chosen.
- **Calendar days only, no time of day**, which keeps timezones and DST out of the stack entirely.
- **No import of any kind**, no media upload, no social platform integration, no notifications, and no
  collaboration.

### Process notes

- **The merge gate did not exist for the first 25 merges into `main`** — one fast-forward carrying the
  stage-1 specs, plus every `--no-ff` merge from T001 through T024. A knowing exception, pinned at
  `caca814~4`, recorded rather than omitted because the point of the gate is that its absence gets
  written down. **There is no second exception**: when the free-tier CI quota ran out mid-pipeline on
  2026-08-02, the answer was a project-owned runner, not a relaxed gate.
- **Every checkpoint from Phase 4 onward found drift in `contracts/openapi.yaml`** — five in a row,
  including T074's. It is the artifact least often opened while building a surface and the one that
  outranks code when someone does open it, so a wrong sentence there survives longest and is obeyed
  hardest.
- `/speckit-analyze` and the `reviewer` agent are not substitutes. At T074 they produced 9 and 3
  findings respectively **with no overlap at all**.
- **The deployed seam is not covered by any automated test, and it hid a credential leak for 77
  tasks.** Every frontend test stubs the proxy, because CI has no FastAPI behind it — so a suite green
  at 432 tests said nothing about the browser → proxy → API → database path. The first automated
  sign-in against production found the login form serialising the creator's password into the URL: a
  `<form>` with no `method` defaults to GET, and `preventDefault()` is only attached at hydration. The
  window is a property of the *deployment*, invisible locally and ~44 seconds wide on a cold free
  tier. Fixed before this tag, in two independently tested halves. Walk the deployed seam by hand;
  a green suite is evidence about the frontend in isolation.

[0.1.0]: https://gitlab.com/ahtuan1701/creator-hub/-/releases/v0.1.0
