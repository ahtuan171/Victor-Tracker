# Changelog

All notable changes to CreatorHub are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

CreatorHub ships one module per iteration. **v0.1 is Content Calendar only** — Growth Tracker, Media
Kit Generator, and Deal/Collab Tracker each restart the full eight-stage workflow with their own
`spec.md` against the same constitution.

## [Unreleased]

### v0.1.0 — Content Calendar, awaiting its tag

**The code is complete and deployed; the tag is deliberately held.** T072 walks quickstart V1–V9
against the deployed environment and measures the cold-start cost against SC-001. Tagging a release
that no deployment has been walked against would make the tag a claim without evidence, so the tag
follows T072 rather than preceding it. Decided with the project owner on 2026-08-03 and recorded
under T074 in `specs/001-content-calendar/tasks.md`.

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
  thing to revisit if CreatorHub ever serves a second person.
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
  stage-1 specs, plus every `--no-ff` merge from T008 through T024. A knowing exception, pinned at
  `caca814~4`, recorded rather than omitted because the point of the gate is that its absence gets
  written down. **There is no second exception**: when the free-tier CI quota ran out mid-pipeline on
  2026-08-02, the answer was a project-owned runner, not a relaxed gate.
- **Every checkpoint from Phase 4 onward found drift in `contracts/openapi.yaml`** — five in a row,
  including T074's. It is the artifact least often opened while building a surface and the one that
  outranks code when someone does open it, so a wrong sentence there survives longest and is obeyed
  hardest.
- `/speckit-analyze` and the `reviewer` agent are not substitutes. At T074 they produced 9 and 3
  findings respectively **with no overlap at all**.
