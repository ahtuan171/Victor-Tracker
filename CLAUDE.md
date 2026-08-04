# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-08-04: **built, deployed, and drift-swept** — T001–T071, T073, T074, T075, T077 of 77

On `main`, **271 backend tests and 432 frontend tests passing, and nothing skipped.** Phases 3–7 are
each closed with their three-gate checkpoint. **Two tasks remain and nothing is blocked on an account
any more**: T072 (walk V1–V9 against the deployed environment) and T076 (retro). T072 needs only the
production password.

**The product is feature-complete for v0.1 and is deployed** — backend on Render, frontend on Vercel,
database on Neon, since 2026-08-04. A signed-in creator can
capture an idea, find it in the backlog, move between months and weeks, read every dated item's
status, platform and overdue state without opening it, open it and change every field, drag it onto a
day or back to the backlog, filter by platform, paste a published link and open the live post, delete
behind a three-tap confirmation, and sign out. What no surface does: anything belonging to the other
three modules.

**Deployed 2026-08-04 (T071).** Backend `creator-hub-1dgs.onrender.com`, frontend
`creator-hub-hazel.vercel.app`, database **Neon** — a stack substitution stated in `plan.md` as the
constitution requires, with `tech-defaults.md`'s DB row amended in the same MR. `RENDER_DEPLOY_HOOK_URL`
and `VERCEL_DEPLOY_HOOK_URL` are set and both hooks have fired for real. The deploy jobs stay `manual`
and still **fail loudly when a hook variable is missing** — that guard is as load-bearing now as it was
before, since a variable can be unset again.

**The one thing still blocking progress is not in this repository: the production password.** T072
walks quickstart V1–V9 against the deployed environment and needs to sign in. The email is fixed at
`ahtuan1701@gmail.com` and cannot change (`content_item` has no owner column). Ask for it in a file
outside the repo — never pasted into a transcript — and delete the file afterwards.

**T074's tag was deliberately split off, on the human's instruction (2026-08-03).** The drift pass and
`CHANGELOG.md` are **done**; **the v0.1 tag waits until after T072**, because tagging a release that no
deployment has been walked against is backwards. Now genuinely recorded in `tasks.md` under T074 —
T074 found that this sentence had been asserting a record that did not exist.

### The one pattern that has cost the most, four checkpoints running

**An amendment applied to one artifact is not applied — and `specs/` outranks code, so a stale spec
gets *obeyed* where stale code gets caught by a test.** Every checkpoint from Phase 4 to Phase 7 found
an instance, all four in `contracts/openapi.yaml`: it is the artifact least often opened while
building a surface and the one that wins when someone does open it. **Grep the claim across `specs/`
and both `AGENTS.md`, and fix every artifact in the same merge request.**

Three refinements the later instances added, each of which cost something to learn:

- **A grep that comes back split is resolved by the *executable* artifact, never by counting.** T057
  re-derived the dev-overlay obstruction from a symptom, concluded `playwright.config.ts` "runs
  `next dev`" **without opening it**, and wrote the widened claim into four files. The config reads
  `` `${process.env.CI ? "pnpm start" : "pnpm dev"}` `` — CI has never had the overlay. Four artifacts
  said one thing, one said the other, and the majority was wrong. **A false claim in `specs/` does not
  sit inert: it allocated work to T069 that did not exist.**
- **Grep finds a wrong sentence; it cannot find an absent one.** Phase 7's A3 was the contract failing
  to say which of `format: uri` and `pattern` it enforced — and R2, the client guessing a subset, was
  that same silence after it had already caused a defect.
- **The load-bearing half of a rule is the *reason*, not the conclusion.** Phase 6's finding had a
  true conclusion and a wrong reason, which read literally licensed exactly the thing it forbade.

### Other durable lessons

- **Green on the day you wrote the test is not evidence.** Break the implementation and confirm the
  *right* test goes red. Do not use `if (false && x !== null)` — a literal `false` destroys TypeScript
  narrowing; break the predicate or reorder the operands.
- **The half that works is the half every test happens to use.** No test clicked `MONTH` before T057
  because `WEEK` works. Same shape as Phase 7's R2, where both "not stricter than the contract" tests
  only ever exercised the bare-scheme looseness and never whitespace.
- **A hand-walk still finds what the suite structurally cannot.** Every automated frontend test stubs
  the proxy, because CI has no FastAPI behind it — so a green suite is evidence about the frontend in
  isolation, never about the seam. Walk the quickstart at every checkpoint.
- **Run all three checkpoint gates every time.** Each has found something the other two could not: the
  hand-walk at Phase 3, `/speckit-analyze` at Phases 4–6 (it reads artifacts against each other, which
  a code review cannot), the `reviewer` agent at Phases 5 and 7 (a missing default, and R2).
- **`reload()` still has no caller**, now for the **fifth** time — predicted at T044, T051, T070 and
  twice besides. Every prediction assumed a write implies a refetch, which is exactly what R-007
  rejects. `getContentItem()` has none either, and both are correct as they are.

**The merge gate is real, and T025 is where it became real.** `only_allow_merge_if_pipeline_succeeds`
is `true` and `main`'s allowed-to-push is **no one** — both read back from the GitLab API rather than
taken on trust. **The local `--no-ff` flow is over; do not use it again.** Everything from the stage-1
fast-forward through T024 — **25 merges** — stays a knowing constitution VI exception, and `T076`
records that range (pinned at `caca814~4`). There is **no second exception**: when the free-tier CI
quota ran out on 2026-08-02 the answer was a project-owned runner, which does not draw on the shared
quota, so the gate held. See `.claude/memory.md` and `CLAUDE.local.md`.

**Seven merge requests have carried two tasks, and each is a stated deviation rather than a slip.**
`tasks.md` asks for both "tests must fail first" and "one MR per task", and the two collide whenever a
task's entire subject is the next task — an MR carrying it alone would be red, which the gate refuses.
All are recorded in `tasks.md` and the build log. **The pattern is the exception, not a licence** —
the default is one task, one MR.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete and on `main`**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**77 tasks, 8 phases; T001–T070 plus T073, T075 and T077 ticked — Phases 3–7 all closed with their checkpoints. T077 was *added* at the Phase 7 checkpoint**), `checklists/requirements.md` (16/16). Two amendments recorded under Phase 2, both now discharged — T024 lost its cookie-clearing half to T022, T027 lost its re-assert half to T033. **The Phase 3 amendment now reaches all three artifacts** — `tasks.md`, `contracts/openapi.yaml` and `research.md` R-007 — after the Phase 4 checkpoint found the last two still asserting the opposite. |
| `backend/app/` | `config.py`, `db.py`, `models.py`, `auth.py`, `schemas.py`, `main.py`, `api/auth.py`, `api/content_items.py` (T030–T031 create and list, T037 date range), `scripts/seed_user.py`. All five routes exist as of T049–T050. **The single creator is seeded** — one row, one real email; do not seed a second. |
| `backend/alembic/` | One revision, `9483af05dd5b`, **applied to both `creatorhub` and `creatorhub_test`**. `alembic check` clean. |
| `backend/tests/` | `conftest.py` (the T017 harness), `test_harness.py`, `test_config.py`, `test_auth_core.py`, `test_auth.py` (T018), `test_schema.py` (T019), `test_errors.py` (T020), `test_content_items.py` (T029, the date range at T036, partial update and delete at T048/T050 — further extensions at T059, T063), `test_transitions.py` (T046–T047, INV-1 in both directions and the lossless reversal), plus the platform filter (T059) and the published link (T063). **271 passing.** |
| `frontend/` | Next **16.2.12** App Router, React 19.2.4, Tailwind **4**, shadcn/ui, `@dnd-kit/core`, `date-fns`, `yaml`. `lib/`: `proxy-allowlist.ts`, `session.ts`, `api.ts`, `dates.ts`, `items.ts`, `period.ts`, `status.ts`, `utils.ts`. **`app/globals.css` carries the stage-2 design tokens** plus `.notch-card` / `.notch-sheet` / `.web-grain` and **`.focus-ring` / `.focus-ring-inset`** (T067 — the one focus indicator, `outline` never a `ring-*`, because a ring on a brand-filled control is red on red); `app/layout.tsx` loads Oswald + Barlow and sets `dark` on `<html>`. `app/api/[...path]/route.ts` is the proxy. **Routes**: `app/login/`, `app/page.tsx` redirecting, `app/(app)/layout.tsx` guarding the group, `app/(app)/calendar/page.tsx` guarding it again and rendering `components/calendar/CalendarShell.tsx`. **Every surface the export draws now exists** — capture sheet, backlog drawer, `StatusCue`/`PlatformCue`/`ItemChip`, `MonthGrid`+`DayCell`, `WeekList`, `PeriodNav`, `ItemSheet`, `DeleteConfirm`, the `@dnd-kit` drag path, `PlatformFilter`, `FilteredEmpty`, `PublishedLink`, `FirstRun`, and the header sign-out. **432 Playwright tests passing across four projects, none skipped** — `contract`, `proxy`, `client`, `mobile-375`. |
| `docker-compose.yml`, `.env.example`, `scripts/init-test-db.sql` | Written. `db` and `backend` services **both verified** — Postgres 17.10 healthy, `creatorhub_test` created by the init script, and the backend serving `/health`. `pnpm dev` plus the proxy were verified end to end against those two at T022. The compose `frontend` service now has real pages to serve as of T025–T027, but has not been run. |
| `.gitlab-ci.yml` | **Green end to end**, and it gates every merge: `build → test → review` all pass; both `deploy` jobs are `manual` per tech-defaults and **live since T071** — hook variables set, both fired for real. They still fail loudly if a hook variable goes missing. `test:e2e` runs against `pnpm start` (the production bundle) because `playwright.config.ts` branches on `CI` — so **CI has never had the dev overlay**. The `test:backend` gap is **closed by evidence**: the job runs `uv run pytest` with no `alembic upgrade head`, and the T017 harness demonstrably migrates an empty service container itself — so **do not add a migration step**; two racing is worse than neither. **Runs on a project-owned runner** since 2026-08-03; see `CLAUDE.local.md`. |
| `drafts/` | `content-calendar.spec.draft.md` — superseded by `spec.md`. Kept for provenance; do not edit. |
| `design/` | **Stage 2 is done.** `content-calendar/` holds `BRIEF.md` (brief + **audit findings, result CLEAN**), `DESIGN-PROMPT.md`, the export `CreatorHub-Content-Calendar.dc.html` + `support.js`, and screenshots — including the greyscale acceptance test and the implemented `/login`. All eleven surfaces designed at 375px, dark (`1a`–`1l`) and light (`2a`–`2l`). |
| Claude Design | The export lives in project **`32445b82-32e5-4ac4-86d3-4fcc885a5484`** ("Thiết kế v0.1 hoàn thành") — a **regular** project, not the design-system one. `DesignSync` reads it fine; only pushing a component library back would need the design-system type. The `CreatorHub Design System` project (`756a66ad-4f2e-42ff-9513-48b969855d40`) was never used and is **still empty** — ignore it unless a library push is ever wanted. |
| `docs/` | Does not exist. Correct — **T076** creates it (`retro-01.md`). `CHANGELOG.md` (T074) is at the repo root, not here. |
| GitLab / remote | **Exists, builds, and gates.** `origin` = `gitlab.com/ahtuan1701/creator-hub`, private. `main` protected with push access **no one** and `only_allow_merge_if_pipeline_succeeds` **`true`** — both verified against the API, not assumed. **Every task since T025 has merged through an MR behind a green pipeline — !1 through !50**, covering T025–T070 plus T073, T075, T077, the phase checkpoints and the docs sweeps. **Pipelines run on a project-owned runner** since 2026-08-03, after the free-tier quota ran out; the gate was never relaxed. Still open: no issues imported. |
| `glab` | **Installed and authenticated** as `ahtuan1701`. 1.110.0, via `winget install --id GLab.GLab`. Not in `Program Files` — see `CLAUDE.local.md` for the path. |
| Local tooling | `uv` 0.11.32, `pnpm` 11.17.0, Python 3.13.5, Node **24.12.0**, Docker 29.3.1 — the daemon does not survive a reboot, so start Docker Desktop first every session. |

### History lives in `.claude/build-log.md`

What happened at each stage and task — stage 1, Phase 1, the T008–T016 backend, T017, the stage
2/3 groundwork, and the T021–T022 frontend boundary — is recorded in
[`.claude/build-log.md`](.claude/build-log.md). It is **deliberately not imported**: it is a record, not a rule, and it was the bulk of this file's context cost.

Read it when you need to know *why* something was done at a specific task, or whether a thing was
verified rather than assumed. You do **not** need it to work on the next task — every trap it mentions
is also recorded where that trap can bite (see [Where knowledge lives](#where-knowledge-lives)), and
the decisions that still constrain new code are in the two tables below.

When you finish a task: narrative goes to the build log, the durable rule goes to whichever file
covers the tree it applies to.

### Decisions that shape the code, and why

Full reasoning lives in `spec.md`'s Clarifications section and `research.md`. The short version, so a
future session does not re-litigate:

| Decision | Why |
|---|---|
| One platform per item, max | Two destinations = two items, each with its own date and published link. Widening later is additive; narrowing would need a migration. |
| Three statuses; `draft` = made, awaiting publication | Three is how many stay legible in a 375px cell with a non-colour cue each (FR-017). |
| Calendar day only, no time of day | Keeps timezones and DST out entirely. Advisory-only until something auto-publishes. |
| ~30-day session, sliding reissue via `X-Access-Token` header | No refresh token (locked by tech-defaults). FastAPI attaches the header; the proxy rewrites the cookie. **Both halves are required** — without either, sessions die on day 30. |
| Drag for **dates only**; status is tap-only | A status drag needs lanes; lanes do not fit at 375px and are a second core capability (constitution III). FR-015a was narrowed rather than inventing surface. |
| Backlog is a **drawer on `/calendar`**, not a route | A DOM node cannot be dragged between routes, so two routes made US3 scenario 1 impossible and SC-008 unreachable. |
| Client components + local state + optimistic updates | SC-005 (<1s filter) and "cue updates immediately" both want local state. A server round trip per toggle risks Render's free-tier spin-down blowing SC-001. |
| Hand-built calendar grid, no library | Every library's value is time-of-day layout, which FR-012a removed. |
| Status cue = shape + fill, not colour | SC-004 must hold in greyscale. Overdue is a border, not a fourth state. |
| `DATE` end to end; `today` read client-side only | Makes the midnight-UTC off-by-one unrepresentable in data, and the hydration flip impossible in render. |
| Last write wins, no version column | One creator; the only person who can be overwritten is themselves (constitution VII). |

### Decisions taken during implementation, and why

Only the cross-cutting ones. **Backend-specific decisions and traps live in
[`backend/AGENTS.md`](backend/AGENTS.md); frontend-specific ones in
[`frontend/AGENTS.md`](frontend/AGENTS.md)** — both load automatically when you work in those trees,
and neither is duplicated here.

| Decision | Why |
|---|---|
| **Specs reached `main` by local fast-forward**, not an MR | Creating the GitLab project first would have blocked all implementation on an account setup that blocks nothing else. With no remote there was no gate to satisfy, so this is a knowing exception to constitution VI — **`T076` must record it, not omit it.** Also in `.claude/memory.md`. |
| One branch per task, merged `--no-ff` — **ended at T025** | It kept the working agreement in `tasks.md` real while there was no gate, and left a history shaped like the MR flow it became. The gate exists now: **T025 onward are real MRs**, and the exception covers the 25 merges before it. Do not revert to the local flow. |
| No Dockerfiles; compose runs base images with bind mounts | Render and Vercel build from source and never read `docker-compose.yml`. Its only job is "Postgres + FastAPI + Next.js dev servers", which needs no image of our own. |
| CI `deploy` jobs **fail** when their hook variable is missing | A green deploy job that deployed nothing is worse than a red one. T071 set the variables; the guard stays, because a variable can be unset again. **An empty variable is not an absent one** — `FRONTEND_ORIGIN=""` overrode a default, hit `min_length=1`, and stopped the app booting. Every field in `app/config.py` with both a default and a constraint has this waiting. |
| The Claude Design project was created **through `DesignSync create_project`**, not by hand in the browser | A project's type is **immutable at creation**, and a regular project can never become a design system — `DesignSync` cannot read it and there is no conversion. Creating it through the tool removes the one irreversible mistake available in stage 2. Id is recorded in the table above. |
| `design/content-calendar/BRIEF.md` was written **before** the export exists | The data-shape audit is the whole point of the stage-2 gate, and criteria invented after seeing a design are not criteria. The checklist is derived mechanically from `data-model.md`'s "Not present" table, so the audit has a fixed answer key. It also carries the `DO NOT INVENT` list that goes into the Claude Design prompt, which is far cheaper than catching a stray field during the audit. |
| The stage-2 deadline is **T034, not T038** | `research.md` says the stage-2 gate does not block Phase 4, and that is true — about *tokens*, which R-005 made non-load-bearing. It is not true about *fields*. Constitution IV requires a `spec.md` amendment before building a design-implied field, and the fields get their controls at T034 and T052. After that, a re-skin (cheap) becomes rework (not). |
| `glab` installed before any remote exists | It is inert without an account, but installing it is the one part of stage 3 that needed no account, and discovering the non-standard install path cost a few minutes that would otherwise have been spent mid-setup. |

### Next session starts here

0. **Read the AGENTS.md for the tree you are about to touch, before the first edit.**
   `backend/AGENTS.md` or `frontend/AGENTS.md` — they hold that side's decisions, traps, and commands,
   and none of it is repeated here. They load automatically once you read a file in that directory,
   but "automatically" can mean *after* your first edit, which is too late for a trap.
   `frontend/AGENTS.md` is now long and every row cost something: the silent-Tailwind trap, the
   port-3100 collision, the pinned-timezone rule, the unparameterised-read rule, the `h-dvh` rule, the
   `savedSince` rule and why "just merge on id" is **forbidden**, the three empty states, the focus
   indicator and the two shapes that clip it, the viewport-audit rule (**a `scrollWidth` check does not
   catch a control pushed off the side** — the band clips), and the two 404 branches that are
   deliberate opposites.
1. **Start Docker Desktop, then `docker compose up -d db`.** Postgres is verified working, but the
   daemon does not survive a reboot, and the whole suite fails confusingly without it. Then
   `cd backend && uv run alembic upgrade head` if the volume was recreated — the migration has been
   applied to **both** `creatorhub` and `creatorhub_test`, and a recreated volume loses both. The T017
   harness migrates `creatorhub_test` itself, so that command is only for `creatorhub`.
2. **Start the local GitLab runner, or every pipeline hangs.** The free-tier compute quota ran out on
   2026-08-02 and resets on 2026-09-01; a project-owned runner does not draw on it, which is why the
   merge gate still holds. It is **not** a Windows service and dies with the shell that started it.
   Command, path and the `ci_quota_exceeded` diagnosis are in **`CLAUDE.local.md`** — including that
   `stuck_pending_no_matching_runners` is a *misleading* symptom of the quota, not a runner problem.
   Note also that a healthy runner's `contacted_at` is routinely ~30–55 minutes stale, because GitLab
   throttles that write; the live process is the evidence, not the timestamp.
3. **Two tasks remain, and T072 is the next one — it is no longer blocked on an account.**

   - **T072** — walk quickstart V1–V9 against `creator-hub-hazel.vercel.app` at 375px in a real
     browser, and measure the cold start. **It needs the production password and nothing else.**
     V1.4 and V8.1 are walkable now that T077 added a sign-out control.
     **The cold start is two, not one**: Render's free tier spins down *and* Neon's auto-suspends, so
     leave it idle ≥20 minutes before timing the first request, then time a warm second one for
     comparison — one number alone says nothing about which half is the cold start.
     **SC-001 is the 15-second, 3-interaction *capture* budget, not a page-load budget** (SC-005's
     one second is the platform filter). Report the number as measured, including if it fails.
   - **T074 is done** — both gates run, twelve findings, all documentation drift and none in
     application code. The two passes **overlapped on nothing**, which is the point of running both.
     **The v0.1 tag is still held until after T072.**
   - **T076** — the retro. It compares *shipped* behaviour against every acceptance criterion, so it
     wants T072's results. It must record the **full extent of the constitution VI exception**: one
     stage-1 fast-forward plus every `--no-ff` merge from T008 through T024 — **25 merge commits**,
     pinned at `caca814~4`, because `git log --merges` now includes the real MR merges too. **There is
     no second exception**; the runner is what kept the gate intact through the quota outage.

4. **Every task goes through a merge request.** `main` refuses direct pushes and the pipeline gates
   the merge:

   ```bash
   git checkout main && git pull --ff-only
   git checkout -b feature/001-<task-slug>
   # ... work, then:
   git push -u origin feature/001-<task-slug>
   glab mr create --title "..." --target-branch main --yes --description "..."
   glab ci status --branch feature/001-<task-slug> --live=false   # wait for success
   glab mr merge <N> --yes --remove-source-branch
   ```

   Do **not** merge locally with `--no-ff` — that flow ended at T025. A full pipeline is ~12–14
   minutes; poll it in the background rather than waiting in the foreground.
5. Read the **Post-review revisions** table at the bottom of `tasks.md` before changing anything in
   Phase 3+: several tasks exist for non-obvious reasons and look droppable if you have not read it.
   Each phase also has its own notes-and-amendments section recording what its checkpoint found.
6. **Import `tasks.md` as GitLab issues** — still open, still blocking nothing. Create and close
   T001–T070 immediately so later `closes #N` references do not skew.
   `/speckit-taskstoissues` is GitHub-only and will abort; use `glab issue create` or the web UI. Do
   not try to make that command work.

### Commands that are real now

```bash
docker compose up -d db                     # Postgres + creatorhub_test
docker compose up -d backend                # serves /health; first start ~70s while uv sync runs
```

Per-tree commands live with their rules, so they cannot drift from them: **`backend/AGENTS.md`** and
**`frontend/AGENTS.md`**. Current green state is **271 backend tests and 432 frontend tests, none
skipped**, with `pnpm typecheck` and `pnpm lint` both silent. (`pnpm typecheck` reads generated route
types out of `.next/`, so it goes red straight after a branch switch — `rm -rf .next` and re-run.)

`pnpm dev` serves the proxy for real — `/api/auth/login` and `/api/auth/logout` work against a running
`docker compose up -d backend`, and it needs no `frontend/.env.local`: `lib/session.ts` defaults
`API_BASE_URL` to the compose backend outside production. **A hand-walk needs `pnpm build && pnpm
start` instead**, plus `API_BASE_URL` and `SESSION_COOKIE_SECURE=false` — the dev overlay covers the
`MONTH` toggle at 375px, and without the second variable a correct sign-in bounces straight back to
`/login`. See `frontend/AGENTS.md`.

**Real now: every surface v0.1 specifies.** `/login`, `/` (which redirects), and **`/calendar`** —
header with an `N overdue` count and a sign-out control, month grid, week list, period navigation,
backlog drawer, capture sheet, bottom action band, item sheet, delete confirmation,
drag-to-schedule, platform filter, published-link field and open control, and the first-run empty
state. **A signed-in creator can capture an idea, find it in the backlog, move between months and
weeks, read every dated item's status, platform and overdue state without opening it, open it and
change every one of those fields, drag it onto a day or back to the backlog, filter by platform,
record where it was published and open the live post, delete it behind a three-tap confirmation, and
sign out.**

What is *not* real yet: **the deployed environment has not been walked by hand** (T072), and
`docker compose up frontend` has still never been run.

**Live URLs**: frontend `https://creator-hub-hazel.vercel.app`, backend
`https://creator-hub-1dgs.onrender.com`. Render appends a **random suffix** to service hostnames —
`creator-hub.onrender.com` is a different service, and Render answers an unknown host with
`404 text/plain "Not Found"` that is byte-identical to what the proxy returns when `API_BASE_URL` is
wrong. Copy the hostname, never retype it from memory.

`glab` is installed and authenticated, and `origin` exists — the whole MR flow in step 4 above works.
The binary's path is non-standard and not on the PATH of a shell that predates the install; see
`CLAUDE.local.md`, which also carries the local runner.

## What this is

CreatorHub — a personal brand operating system for a content creator. Four planned modules:
Content Calendar, Growth Tracker, Media Kit Generator, Deal/Collab Tracker.

**v0.1 ships Content Calendar only.** The other three are later iterations, each re-running the full
8-stage workflow with a new `spec.md` against the same constitution. Do not add fields, endpoints, or
screens for the other modules while working on v0.1 — that is the main failure mode this project is
structured to avoid.

## Where knowledge lives

Four kinds of file, and the difference matters — one of them is not in your context right now.

| File | Loaded | Holds |
|---|---|---|
| This file + the imports below | **Always** | Current state, next steps, cross-cutting decisions |
| `backend/AGENTS.md` | When you touch `backend/` | Backend decisions, traps, commands |
| `frontend/AGENTS.md` | When you touch `frontend/` | Frontend decisions, traps, commands |
| `.claude/build-log.md` | **Never — read on demand** | What happened at each task, and why |

Adding knowledge: a trap or decision that applies to one tree goes in that tree's `AGENTS.md`, not
here. Only put it here if it can bite while editing a **root-level** file. Narrative goes to the build
log. This is what stops this file growing by twenty lines a task.

`frontend/AGENTS.md` opens with a block fenced by `BEGIN/END:nextjs-agent-rules` — that is generated
by Next.js tooling and is rewritten on upgrade. Never edit inside those markers.

## Detailed rules

@.claude/rules/workflow.md
@.claude/rules/tech-defaults.md
@.claude/rules/design.md

## Working memory

@.claude/memory.md

`.claude/build-log.md` also exists and is **intentionally not imported** — read it on demand for the
chronology. Anything in it that a future session must *act on* belongs in `memory.md` instead.

## Non-negotiables

Three rules that override convenience in any given moment:

1. **`specs/` outranks code.** When they disagree, one is wrong — decide which, fix it, and say so
   in the MR. Never code around the gap.
2. **`spec.md` contains no technology.** What and why only. Technology lives in `plan.md`.
3. **Nothing outside the current spec gets built.** Useful ideas become input for the next
   iteration; write them into `.claude/memory.md` under Deferred, do not implement them.
