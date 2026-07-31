# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-07-31: **Phase 2 complete** — T001–T028 of 76

On `main`, **96 backend tests and 90 frontend tests passing** (plus 4 deliberately skipped, see T027
below). Stage 1 planning is done and reviewed, the specs are on `main`, **the backend is a running
application** — config, DB session, schema, a migration applied to a live Postgres, the auth
primitives, the auth boundary, both auth endpoints, the seed script, `main.py` — the **pytest harness
exists**, and **the backend is fully covered**: auth over HTTP, the schema's deliberate absences, and
the uniform error shape. `docker compose up backend` serves `GET /health`.

**The frontend now has a credential boundary, a client layer, and its first screens.** The proxy at
`app/api/[...path]/route.ts` was verified against a live FastAPI, not only a stub. `lib/api.ts`
carries hand-written types from the contract (no codegen is installed — "generate" means "write by
hand"), four operations, one `fetch`, and one 401 handler exempting the two `/auth/*` endpoints. On
top of that sit a **login page**, a **root route that redirects instead of 404ing**, a **session
guard** on the `(app)` group, and **`lib/dates.ts`**.

**The next task is T029**, the first of Phase 3 (User Story 1). Phase 2 blocked every user story and
is now closed, so US1 may begin. T029 is a **backend** task — read `backend/AGENTS.md` first; the
last five tasks were all frontend.

**The merge gate is real, and T025 is where it became real.** `only_allow_merge_if_pipeline_succeeds`
is `true` and `main`'s allowed-to-push is **no one** — both read back from the GitLab API rather than
taken on trust. T025–T028 went through **MRs !1–!4**, one per task, each merged only behind a green
pipeline. **The local `--no-ff` flow is over; do not use it again.** Everything from the stage-1
fast-forward through T024 — 25 merges — stays a knowing constitution VI exception, and `T076` records
that range. See `.claude/memory.md`.

**Two things about the frontend that look like bugs and are not.** There is no `/calendar` until
**T033**, so a signed-in creator hitting `/` is redirected to a 404 — intentional, see the amendment
note under Phase 2 in `tasks.md`. And `tests/e2e/session-guard.spec.ts` is **written in full and
skipped**: a route group's layout does not execute with no page inside it, so T027's guard has no
route to exercise until T033 switches those tests on by deleting `.skip`. Its wiring was proven once
by hand with a throwaway route — that probe caught a false-positive test, which is in the build log.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete and on `main`**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**76 tasks, 8 phases; T001–T028 ticked — Phase 2 closed**), `checklists/requirements.md` (16/16). Two amendments recorded under Phase 2 — T024 lost its cookie-clearing half to T022, T027 lost its re-assert half to T033. |
| `backend/app/` | `config.py`, `db.py`, `models.py`, `auth.py`, `schemas.py`, `main.py`, `api/auth.py`, `scripts/seed_user.py`. Complete for Phase 2; `api/content_items.py` arrives at T030. **The `creator` table is still empty** — see the seed blocker below. |
| `backend/alembic/` | One revision, `9483af05dd5b`, **applied to both `creatorhub` and `creatorhub_test`**. `alembic check` clean. |
| `backend/tests/` | `conftest.py` (the T017 harness), `test_harness.py`, `test_config.py`, `test_auth_core.py`, `test_auth.py` (T018), `test_schema.py` (T019), `test_errors.py` (T020). **96 passing.** Backend coverage for Phase 2 is complete. |
| `frontend/` | Next **16.2.12** App Router, React 19.2.4, Tailwind **4**, shadcn/ui, `@dnd-kit/core`, `date-fns`, `yaml`. `lib/`: `proxy-allowlist.ts` (T021), `session.ts` (T022, T027), `api.ts` (T023–T024), `dates.ts` (T028), `utils.ts`. `app/api/[...path]/route.ts` is the proxy. **Routes exist now**: `app/login/` (T025), `app/page.tsx` redirecting rather than scaffolding (T026), `app/(app)/layout.tsx` guarding the group (T027) — the group is otherwise empty until T033. **90 Playwright tests passing across four projects, 4 skipped** — `contract`, `proxy`, `client` (now the browser-side `lib/` modules, not just `api.ts`), `mobile-375`. |
| `docker-compose.yml`, `.env.example`, `scripts/init-test-db.sql` | Written. `db` and `backend` services **both verified** — Postgres 17.10 healthy, `creatorhub_test` created by the init script, and the backend serving `/health`. `pnpm dev` plus the proxy were verified end to end against those two at T022. The compose `frontend` service now has real pages to serve as of T025–T027, but has not been run. |
| `.gitlab-ci.yml` | **Green end to end** on pipeline #5: `build → test → review` all pass, both `deploy` jobs `manual` as designed. Three earlier pipelines were red on config that had only ever been syntax-checked. The `test:backend` gap is now **closed by evidence**: the job still runs `uv run pytest` with no `alembic upgrade head`, and the T017 harness demonstrably migrates an empty service container itself — so **do not add a migration step**; two racing is worse than neither. |
| `drafts/` | `content-calendar.spec.draft.md` — superseded by `spec.md`. Kept for provenance; do not edit. |
| `design/` | `content-calendar/BRIEF.md` only — the stage-2 brief and the data-shape audit checklist the export must pass. No export yet: the claude.ai design-system project exists but is empty. |
| Claude Design | Project **`CreatorHub Design System`** created 2026-07-30, id `756a66ad-4f2e-42ff-9513-48b969855d40`. Created through `DesignSync create_project` specifically so the project type is right — see Decisions. **Empty**: the design work itself has not been done. |
| `docs/` | Does not exist. Correct — T076 creates it. |
| GitLab / remote | **Exists, builds, and gates.** `origin` = `gitlab.com/ahtuan1701/creator-hub`, private. `main` protected with push access **no one** and `only_allow_merge_if_pipeline_succeeds` **`true`** — both verified against the API, not assumed. **MRs !1–!4 merged T025–T028**, each behind a green pipeline. Still open: no issues imported. |
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
   but "automatically" can mean *after* your first edit, which is too late for a trap. **T029–T031 are
   backend** and the last five tasks were all frontend, so this is a real switch.
1. **Start Docker Desktop, then `docker compose up -d db`.** Postgres is verified working, but the
   daemon does not survive a reboot, and the whole suite fails confusingly without it. Then
   `cd backend && uv run alembic upgrade head` if the volume was recreated — note the migration has
   been applied to **both** `creatorhub` and `creatorhub_test`, and a recreated volume loses both.
   The T017 harness migrates `creatorhub_test` itself, so that command is only for `creatorhub`.
2. **Continue at T029** in `specs/001-content-calendar/tasks.md` — Phase 3, User Story 1. Phase 2
   blocked every story and is now closed.
3. **Every task from here goes through a merge request.** `main` refuses direct pushes and the
   pipeline gates the merge. The flow that worked for T025–T028:

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
4. **A backend seam is already decided and waiting at T030**, written up in `backend/AGENTS.md`: the
   409 body carries `{code, detail}` while `test_errors.py` currently asserts exactly `{detail}`.
   Both are green today only because no endpoint returns 409 yet. Do not resolve it early. Two other
   backend hazards live there too: `app.auth.presented_token` must stay **logout-only**, and three
   entries in `backend/pyproject.toml` look removable but are load-bearing.
5. **T033 has two inherited obligations**, both easy to miss because they were created elsewhere:
   it carries **T027's deferred re-assert** (App Router layouts are not re-executed on soft
   navigations, so the layout guard alone is not enough), and it switches on
   `frontend/tests/e2e/session-guard.spec.ts` by deleting `.skip` — those four tests already exist
   and already point at `/calendar`.
6. Read the **Post-review revisions** table at the bottom of `tasks.md` before touching Phase 3+:
   three tasks exist for non-obvious reasons and look droppable if you have not read it.
7. **Do not skip** `T075` at the end — amending the Auth row of `tech-defaults.md` to permit sliding
   reissue. `research.md` R-002 defers it to Reflect on purpose, so the rule is inherited by later
   modules rather than re-derived from an argument buried in a research file.

**Three things are waiting on the human, not on code.** None of them blocked Phase 2, but the first
now blocks a *by-hand* check that Phase 2 otherwise passed:

8. **The single creator account has never been seeded, and this is now the oldest open item.**
   `SEED_CREATOR_EMAIL` is rejected by `email-validator` — `.local` is a reserved TLD — so
   `app.scripts.seed_user` has never succeeded and the `creator` table is empty. Found at T022.
   Consequence: **quickstart V1 has never been walked by a human**, because there is no account to
   sign in with. Every Phase 2 test stubs the proxy (CI has no FastAPI behind it), so the automated
   suite is green and genuinely proves less than a single real sign-in would. **Do this before T033**,
   which builds the first surface assuming a real session. Fix is in `CLAUDE.local.md`; seed **once**
   with the address you intend to keep, because a different email is refused outright afterwards.
9. **Stage 2 (Design)** needs the **design work itself** in the `CreatorHub Design System` project
   (already created, id in the table above, currently empty). Read
   `design/content-calendar/BRIEF.md` first — it carries the surface list, the locked status-cue
   encoding, and the `DO NOT INVENT` list to paste into the Claude Design prompt. Pull the export with
   `DesignSync list_files` / `get_file` into `design/content-calendar/`, then **run the data-shape
   audit before adapting anything**, and write the result into BRIEF.md even if it is clean. The
   deadline is **T034**, not T038 — see Decisions.
10. **Import `tasks.md` as GitLab issues** — T001–T028 created and closed immediately, so later
    `closes #N` references do not skew. `/speckit-taskstoissues` is GitHub-only and will abort; use
    `glab issue create` or the web UI. Do not try to make that command work.

### Commands that are real now

```bash
docker compose up -d db                     # Postgres + creatorhub_test
docker compose up -d backend                # serves /health; first start ~70s while uv sync runs
```

Per-tree commands live with their rules, so they cannot drift from them: **`backend/AGENTS.md`** and
**`frontend/AGENTS.md`**. Current green state is **96 backend tests and 90 frontend tests** (4
skipped by design — the T027 guard tests, which T033 switches on), with `pnpm typecheck` and
`pnpm lint` both silent.

`pnpm dev` serves the proxy for real — `/api/auth/login` and `/api/auth/logout` work against a running
`docker compose up -d backend`, and it needs no `frontend/.env.local`: `lib/session.ts` defaults
`API_BASE_URL` to the compose backend outside production.

Real now: `/login` and `/` (which redirects rather than 404s). Not real yet: `/calendar`, which
arrives at **T033** — so a signed-in creator landing on `/` currently reaches a 404. That is the
intended intermediate state, not a bug. `docker compose up frontend` has still never been run.

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
