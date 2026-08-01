# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-08-01: **Phase 3 implementation complete** — T001–T035 of 76

On `main`, **142 backend tests and 143 frontend tests passing, and nothing skipped.** Stage 1 planning
is done and reviewed, the specs are on `main`, **the backend is a running application** — config, DB
session, schema, a migration applied to a live Postgres, the auth primitives, the auth boundary, both
auth endpoints, the seed script, `main.py`, and now **`POST` and `GET /content-items`**. The **backend
is fully covered**: auth over HTTP, the schema's deliberate absences, the uniform error shape, and
create-and-list.

**User Story 1 is complete: a creator can sign in, capture an idea, and find it in the backlog.**
The proxy at
`app/api/[...path]/route.ts` was verified against a live FastAPI, not only a stub. `lib/api.ts`
carries hand-written types from the contract (no codegen is installed — "generate" means "write by
hand"), four operations, one `fetch`, and one 401 handler exempting the two `/auth/*` endpoints. On
top of that sit a **login page**, a **root route that redirects**, a **session guard** on the `(app)`
group checked twice, **`lib/dates.ts`**, **`lib/items.ts`** (the shared item state R-007 asks for),
the **`/calendar` shell**, the **capture sheet**, and the **backlog drawer**.

**Stage 2 (Design) closed on 2026-08-01.** The Claude Design export is in `design/content-calendar/`,
the data-shape audit ran **clean**, and its tokens are installed in `frontend/app/globals.css`.
`/login`, the calendar shell and the capture sheet are built from it. The remaining surfaces were
**not** built — each is built from that export at its own task.

**The Phase 3 checkpoint is done (2026-08-01) and the next task is T036.** All three gates ran: V1 and
V2 were walked at 375px against a live stack with **nothing stubbed** — 24 checks, capture at 3
interactions and under 600ms — the **`reviewer` agent** over T029–T035 came back **clean**, and
`/speckit-analyze` found **no constitution conflicts and one real gap**. Results are in `tasks.md`
under Phase 3; the narrative is in the build log.

**Two things that gap changed, and a third to carry:**

- **T042 is amended: the calendar's read stays unparameterised.** `date_from`/`date_to` bound
  `scheduled_date`, so a ranged read returns no undated rows — and the drawer narrows that same state.
  Built as originally written, the first month grid would have **emptied the backlog**, and no
  frontend test could have caught it (they all stub the proxy). T036/T037 still ship the parameters;
  the calendar just does not send them. See `frontend/AGENTS.md`.
- **quickstart V1 asserted the wrong thing** and now asserts the right one. A Next 16 `redirect()`
  answers with an `__next_error__` document in dev *and* production — metadata only, zero content
  data. FR-002 and SC-006 hold; the reasoning under them did not.
- **`itemsLoaded` has a latent hole the reviewer found**: it re-prepends pending rows only, so a list
  read overlapping an already-reconciled create drops that row. Unreachable until something calls
  `reload()` — and **T044 is the first task likely to.**

**The merge gate is real, and T025 is where it became real.** `only_allow_merge_if_pipeline_succeeds`
is `true` and `main`'s allowed-to-push is **no one** — both read back from the GitLab API rather than
taken on trust. Every task from T025 on has gone through an MR behind a green pipeline — **!1–!4** for
T025–T028, then **!7–!13** for the docs sweep and T029–T035. **The local `--no-ff` flow is over; do
not use it again.** Everything from the stage-1 fast-forward through T024 — 25 merges — stays a
knowing constitution VI exception, and `T076` records that range. See `.claude/memory.md`.

**Two frontend intermediate states that look like bugs and are not.** `/calendar` renders a header, a
placeholder where the month grid goes (**T042**), the backlog drawer, and the bottom action band —
that is the intended shape until US2. And backlog rows show a **title only**: the status cue and
platform monogram are T038–T040, and **T041** is the task that puts `ItemChip` in the drawer.

**T029–T031 landed in one merge request, and that is a stated deviation rather than a slip.**
`tasks.md` asks for both "tests must fail first" and "one MR per task", and T029's subject is *both*
T030 and T031 — so an MR carrying it alone would be red, which the gate refuses. Fail-first was
satisfied in the doing: **41 tests, 41 failures** against a codebase with no `content_items.py`. See
the build log.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete and on `main`**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**76 tasks, 8 phases; T001–T035 ticked — Phase 3 built, its checkpoint not yet run**), `checklists/requirements.md` (16/16). Two amendments recorded under Phase 2, both now discharged — T024 lost its cookie-clearing half to T022, T027 lost its re-assert half to T033. |
| `backend/app/` | `config.py`, `db.py`, `models.py`, `auth.py`, `schemas.py`, `main.py`, `api/auth.py`, `api/content_items.py` (T030–T031: create and list), `scripts/seed_user.py`. `GET`/`PATCH`/`DELETE` by id arrive at T049–T050. **The single creator is seeded** — one row, one real email; do not seed a second. |
| `backend/alembic/` | One revision, `9483af05dd5b`, **applied to both `creatorhub` and `creatorhub_test`**. `alembic check` clean. |
| `backend/tests/` | `conftest.py` (the T017 harness), `test_harness.py`, `test_config.py`, `test_auth_core.py`, `test_auth.py` (T018), `test_schema.py` (T019), `test_errors.py` (T020), `test_content_items.py` (T029 — extended at T036, T048, T059, T063). **142 passing.** |
| `frontend/` | Next **16.2.12** App Router, React 19.2.4, Tailwind **4**, shadcn/ui, `@dnd-kit/core`, `date-fns`, `yaml`. `lib/`: `proxy-allowlist.ts` (T021), `session.ts` (T022, T027), `api.ts` (T023–T024), `dates.ts` (T028), `items.ts` (T032), `utils.ts`. **`app/globals.css` carries the stage-2 design tokens** — surfaces, ink, brand, status ramp, overdue, elevation, focus, plus `.notch-card` / `.notch-sheet` / `.web-grain`; `app/layout.tsx` loads Oswald + Barlow and sets `dark` on `<html>`. `app/api/[...path]/route.ts` is the proxy. **Routes**: `app/login/` (T025), `app/page.tsx` redirecting rather than scaffolding (T026), `app/(app)/layout.tsx` guarding the group (T027), `app/(app)/calendar/page.tsx` guarding it again and rendering `components/calendar/CalendarShell.tsx` (T033). `components/capture/CaptureSheet.tsx` (T034) on shadcn's `Sheet`, `components/backlog/BacklogDrawer.tsx` (T035). **143 Playwright tests passing across four projects, none skipped** — `contract`, `proxy`, `client` (the browser-side `lib/` modules), `mobile-375`. |
| `docker-compose.yml`, `.env.example`, `scripts/init-test-db.sql` | Written. `db` and `backend` services **both verified** — Postgres 17.10 healthy, `creatorhub_test` created by the init script, and the backend serving `/health`. `pnpm dev` plus the proxy were verified end to end against those two at T022. The compose `frontend` service now has real pages to serve as of T025–T027, but has not been run. |
| `.gitlab-ci.yml` | **Green end to end** on pipeline #5: `build → test → review` all pass, both `deploy` jobs `manual` as designed. Three earlier pipelines were red on config that had only ever been syntax-checked. The `test:backend` gap is now **closed by evidence**: the job still runs `uv run pytest` with no `alembic upgrade head`, and the T017 harness demonstrably migrates an empty service container itself — so **do not add a migration step**; two racing is worse than neither. |
| `drafts/` | `content-calendar.spec.draft.md` — superseded by `spec.md`. Kept for provenance; do not edit. |
| `design/` | **Stage 2 is done.** `content-calendar/` holds `BRIEF.md` (brief + **audit findings, result CLEAN**), `DESIGN-PROMPT.md`, the export `CreatorHub-Content-Calendar.dc.html` + `support.js`, and screenshots — including the greyscale acceptance test and the implemented `/login`. All eleven surfaces designed at 375px, dark (`1a`–`1l`) and light (`2a`–`2l`). |
| Claude Design | The export lives in project **`32445b82-32e5-4ac4-86d3-4fcc885a5484`** ("Thiết kế v0.1 hoàn thành") — a **regular** project, not the design-system one. `DesignSync` reads it fine; only pushing a component library back would need the design-system type. The `CreatorHub Design System` project (`756a66ad-4f2e-42ff-9513-48b969855d40`) was never used and is **still empty** — ignore it unless a library push is ever wanted. |
| `docs/` | Does not exist. Correct — T076 creates it. |
| GitLab / remote | **Exists, builds, and gates.** `origin` = `gitlab.com/ahtuan1701/creator-hub`, private. `main` protected with push access **no one** and `only_allow_merge_if_pipeline_succeeds` **`true`** — both verified against the API, not assumed. **MRs !1–!4 merged T025–T028; !7–!13 merged the docs sweep and T029–T035**, each behind a green pipeline. Still open: no issues imported. |
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
| CI `deploy` jobs **fail** when their hook variable is missing | A green deploy job that deployed nothing is worse than a red one. T071 sets the variables. |
| The Claude Design project was created **through `DesignSync create_project`**, not by hand in the browser | A project's type is **immutable at creation**, and a regular project can never become a design system — `DesignSync` cannot read it and there is no conversion. Creating it through the tool removes the one irreversible mistake available in stage 2. Id is recorded in the table above. |
| `design/content-calendar/BRIEF.md` was written **before** the export exists | The data-shape audit is the whole point of the stage-2 gate, and criteria invented after seeing a design are not criteria. The checklist is derived mechanically from `data-model.md`'s "Not present" table, so the audit has a fixed answer key. It also carries the `DO NOT INVENT` list that goes into the Claude Design prompt, which is far cheaper than catching a stray field during the audit. |
| The stage-2 deadline is **T034, not T038** | `research.md` says the stage-2 gate does not block Phase 4, and that is true — about *tokens*, which R-005 made non-load-bearing. It is not true about *fields*. Constitution IV requires a `spec.md` amendment before building a design-implied field, and the fields get their controls at T034 and T052. After that, a re-skin (cheap) becomes rework (not). |
| `glab` installed before any remote exists | It is inert without an account, but installing it is the one part of stage 3 that needed no account, and discovering the non-standard install path cost a few minutes that would otherwise have been spent mid-setup. |

### Next session starts here

0. **Read the AGENTS.md for the tree you are about to touch, before the first edit.**
   `backend/AGENTS.md` or `frontend/AGENTS.md` — they hold that side's decisions, traps, and commands,
   and none of it is repeated here. They load automatically once you read a file in that directory,
   but "automatically" can mean *after* your first edit, which is too late for a trap.
   `frontend/AGENTS.md` grew substantially across T032–T035 — the silent-Tailwind trap, the port-3100
   collision, the pinned-timezone rule, the stub-and-guard rule, the shape of `lib/items.ts`, and the
   four drawer decisions.
1. **Start Docker Desktop, then `docker compose up -d db`.** Postgres is verified working, but the
   daemon does not survive a reboot, and the whole suite fails confusingly without it. Then
   `cd backend && uv run alembic upgrade head` if the volume was recreated — note the migration has
   been applied to **both** `creatorhub` and `creatorhub_test`, and a recreated volume loses both.
   The T017 harness migrates `creatorhub_test` itself, so that command is only for `creatorhub`.
2. ~~**Run the Phase 3 checkpoint**~~ — **done 2026-08-01, all three gates.** Continue at **T036**
   (Phase 4, US2). Read the T042 amendment in `tasks.md` before starting the frontend half; it is the
   one finding that would otherwise cost real work. Keep running all three gates at each later
   checkpoint: the walk found what the suite structurally cannot, and analyze found what a clean
   review did not.
3. **Every task from here goes through a merge request.** `main` refuses direct pushes and the
   pipeline gates the merge. The flow used for every task since T025:

   ```bash
   git checkout main && git pull --ff-only
   git checkout -b feature/001-<task-slug>
   # ... work, then:
   git push -u origin feature/001-<task-slug>
   glab mr create --title "..." --target-branch main --yes --description "..."
   glab ci status --branch feature/001-<task-slug> --live=false   # wait for success
   glab mr merge <N> --yes --remove-source-branch
   ```

   Do **not** merge locally with `--no-ff` — that flow ended at T025.
4. ~~**The backend 409 seam**~~ — **closed at T030.** The contract won: `InvariantErrorResponse`
   carries `{code, detail}` and `test_errors.py`'s one-key rule was narrowed per status code rather
   than relaxed. `backend/AGENTS.md` records what exists so a later 409 follows the same path — and
   **T049's `PATCH` is `check_invariant_1`'s second caller**, raising `platform_locked` from the same
   rule. Do not write a parallel check there. Two other backend hazards live in that file:
   `app.auth.presented_token` must stay **logout-only**, and three entries in `backend/pyproject.toml`
   look removable but are load-bearing.
5. ~~**T033's two inherited obligations**~~ — **both discharged.** T027's re-assert lives in
   `app/(app)/calendar/page.tsx`, and the four guard tests are switched on. **The suite now has
   nothing skipped**, so a skipped test appearing again is a signal rather than the status quo.
   Note the limit recorded in `frontend/AGENTS.md`: a full page load exercises the layout guard and
   the page guard at once, so **no e2e test can tell them apart** — deleting the page-level check
   leaves the suite green.
6. Read the **Post-review revisions** table at the bottom of `tasks.md` before touching Phase 3+:
   three tasks exist for non-obvious reasons and look droppable if you have not read it.
7. **Do not skip** `T075` at the end — amending the Auth row of `tech-defaults.md` to permit sliding
   reissue. `research.md` R-002 defers it to Reflect on purpose, so the rule is inherited by later
   modules rather than re-derived from an argument buried in a research file.

**One thing is still waiting on the human, and it blocks nothing.** The other two closed on
2026-08-01:

8. ~~**Seed the single creator account**~~ — **done 2026-08-01, and it was the oldest open item in the
   project.** The cause was `SEED_CREATOR_EMAIL` on the reserved `.local` TLD, which `email-validator`
   refuses; a real domain fixed it and `app.scripts.seed_user` ran. **Quickstart V1 has now been walked
   by a human** — browser to proxy to FastAPI to Postgres — so T033 builds on a session proven outside
   the suite as well as inside it. One row exists: **do not seed a second address**, it is refused
   outright and `content_item` has no owner column. Note what this does *not* change: every automated
   frontend test still stubs the proxy, because CI has no FastAPI behind it, so the green suite still
   proves less than that one sign-in did. Prefer a hand-walk at each checkpoint over trusting it.
9. ~~**Stage 2 (Design)**~~ — **done 2026-08-01.** The export is in `design/content-calendar/`, the
   data-shape audit ran **clean** (no `spec.md` amendment needed), and the token layer is in
   `frontend/app/globals.css`. **Every surface from T033 on is built from that export** — read
   `BRIEF.md`'s audit findings and open the `.dc.html` before building one, rather than inventing a
   layout. `/login`, the calendar shell (`1c`), the capture sheet (`1f`) and the backlog drawer
   (`1h` + `1c`'s peek strip) are done; the rest were deliberately **not** built ahead of their tasks.
   Note T035 changed one line of export copy on purpose — the drawer does not promise a drag that
   does not exist until T054. **Screenshot at 375px after any restyle** — a
   misspelled Tailwind class fails no check, and use a port other than 3100.
10. **Import `tasks.md` as GitLab issues** — T001–T035 created and closed immediately, so later
    `closes #N` references do not skew. `/speckit-taskstoissues` is GitHub-only and will abort; use
    `glab issue create` or the web UI. Do not try to make that command work.

### Commands that are real now

```bash
docker compose up -d db                     # Postgres + creatorhub_test
docker compose up -d backend                # serves /health; first start ~70s while uv sync runs
```

Per-tree commands live with their rules, so they cannot drift from them: **`backend/AGENTS.md`** and
**`frontend/AGENTS.md`**. Current green state is **142 backend tests and 143 frontend tests, none
skipped**, with `pnpm typecheck` and `pnpm lint` both silent.

`pnpm dev` serves the proxy for real — `/api/auth/login` and `/api/auth/logout` work against a running
`docker compose up -d backend`, and it needs no `frontend/.env.local`: `lib/session.ts` defaults
`API_BASE_URL` to the compose backend outside production.

Real now: `/login`, `/` (which redirects), and **`/calendar`** — header, backlog drawer, capture
sheet, bottom action band. **A signed-in creator can capture an idea and find it in the backlog**,
which is US1 end to end. The content region is still a placeholder: the month grid is **T042**.
`docker compose up frontend` has still never been run.

`glab` is installed and authenticated, and `origin` exists — the whole MR flow in step 3 above works.
The binary's path is non-standard and not on the PATH of a shell that predates the install; see
`CLAUDE.local.md`.

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
