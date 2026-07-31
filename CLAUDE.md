# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-07-31: Phase 1 complete, Phase 2 in progress — T001–T019 of 76

On `main`, 75 backend tests passing. Stage 1 planning is done and reviewed, the specs are on `main`,
both projects are scaffolded and green, **the backend is a running application** — config, DB session,
schema, a migration applied to a live Postgres, the auth primitives, the auth boundary, both auth
endpoints, the seed script, `main.py` — the **pytest harness exists**, and **auth is covered end to
end over HTTP**. `docker compose up backend` serves `GET /health`.

The next task is **T020**. Phase 2 has **9 of 21 tasks left**: T020 the last of the tests,
T021–T028 the frontend foundation. Nothing in Phase 3–7 may start until Phase 2 is complete.

**T020 is the last gap.** T018 covered login, logout, and the authentication boundary; T019 covered
the schema absences (INV-4, constitution VII). The uniform-error-body assertion is not written yet,
and the 32-check throwaway script that once covered it by hand is gone.

**No frontend feature code exists yet** — `frontend/app/page.tsx` is still the create-next-app
placeholder, and `frontend/lib/` still has only `utils.ts`.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete and on `main`**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**76 tasks, 8 phases; T001–T017 ticked**), `checklists/requirements.md` (16/16). |
| `backend/app/` | `config.py`, `db.py`, `models.py`, `auth.py`, `main.py`, `api/auth.py`, `scripts/seed_user.py`. Complete for Phase 2; `api/content_items.py` arrives at T030. |
| `backend/alembic/` | One revision, `9483af05dd5b`, **applied to both `creatorhub` and `creatorhub_test`**. `alembic check` clean. |
| `backend/tests/` | `conftest.py` (the T017 harness), `test_harness.py`, `test_config.py`, `test_auth_core.py`, `test_auth.py` (T018), `test_schema.py` (T019). **75 passing.** Auth and the schema absences are covered; `test_errors.py` (T020) is still missing. |
| `frontend/` | Scaffolded only. Next **16.2.12** App Router, React 19.2.4, Tailwind **4**, shadcn/ui, `@dnd-kit/core`, `date-fns`, Playwright at 375px. Routes are still the scaffold's; `lib/` has only `utils.ts`. |
| `docker-compose.yml`, `.env.example`, `scripts/init-test-db.sql` | Written. `db` and `backend` services **both verified** — Postgres 17.10 healthy, `creatorhub_test` created by the init script, and the backend serving `/health`. `frontend` still not runnable — it needs T026. |
| `.gitlab-ci.yml` | Written: `build → test → review → deploy`, deploy manual. **Never executed** — no GitLab project. YAML syntax verified parseable, all 10 jobs resolve; that is not the same as verified working. One known gap: `test:backend` runs `uv run pytest` with no `alembic upgrade head` — the T017 harness compensates by migrating the schema itself, so **do not add a migration step to CI without checking the harness first**; two of them racing is worse than neither. |
| `drafts/` | `content-calendar.spec.draft.md` — superseded by `spec.md`. Kept for provenance; do not edit. |
| `design/` | `content-calendar/BRIEF.md` only — the stage-2 brief and the data-shape audit checklist the export must pass. No export yet: the claude.ai design-system project exists but is empty. |
| Claude Design | Project **`CreatorHub Design System`** created 2026-07-30, id `756a66ad-4f2e-42ff-9513-48b969855d40`. Created through `DesignSync create_project` specifically so the project type is right — see Decisions. **Empty**: the design work itself has not been done. |
| `docs/` | Does not exist. Correct — T076 creates it. |
| GitLab / remote | **Still none of it.** No remote, no protected `main`, no pipeline run. Blocked on a GitLab account. |
| `glab` | **Installed**, 1.110.0, via `winget install --id GLab.GLab`. Not in `Program Files` — see `CLAUDE.local.md` for the path. Not yet authenticated. |
| Local tooling | `uv` 0.11.32, `pnpm` 11.17.0, Python 3.13.5, Node **24.12.0**, Docker 29.3.1 (daemon stopped). |

### History lives in `.claude/build-log.md`

What happened at each stage and task — stage 1, Phase 1, the T008–T016 backend, T017, and the stage
2/3 groundwork — is recorded in [`.claude/build-log.md`](.claude/build-log.md). It is **deliberately
not imported**: it is a record, not a rule, and it was the bulk of this file's context cost.

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
| **Specs reached `main` by local fast-forward**, not an MR | The open question from last session, now closed. Creating the GitLab project first would have blocked all implementation on an account setup that blocks nothing else. With no remote there is no gate to satisfy, so this is a knowing exception to constitution VI — **`T076` must record it, not omit it.** Also in `.claude/memory.md`. |
| One branch per task, merged `--no-ff` | Keeps the working agreement in `tasks.md` real while there is no remote. The history already looks like the MR flow it will become, so nothing has to be reconstructed later. |
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
   but "automatically" can mean *after* your first edit, which is too late for a trap. T018–T020 are
   backend; T021–T028 are frontend.
1. **Start Docker Desktop, then `docker compose up -d db`.** Postgres is verified working, but the
   daemon does not survive a reboot, and the whole suite fails confusingly without it. Then
   `cd backend && uv run alembic upgrade head` if the volume was recreated — note the migration has
   been applied to **both** `creatorhub` and `creatorhub_test`, and a recreated volume loses both.
   The T017 harness migrates `creatorhub_test` itself, so that command is only for `creatorhub`.
2. **Continue at T020** in `specs/001-content-calendar/tasks.md`. The remaining Phase 2 order:

   | Tasks | What |
   |---|---|
   | T020 | the error-shape test, against the T017 harness |
   | T021–T028 | proxy allowlist, the proxy itself, API client, 401 handler, login page, root redirect, session guard, `lib/dates.ts` |

3. **T020 has a specification that is no longer on disk.** The T016 throwaway script — 32 assertions —
   was deleted, and the error-shape half of it has not been rewritten. The trap it existed to catch is
   in `backend/AGENTS.md`: FastAPI's `RequestValidationError` returns `detail` as an **array**, and the
   flattener in `main.py` is what makes the contract true. Assert it against the **generated**
   `openapi.json` as well as the runtime body — the handler alone fixes one and not the other.
4. **Two backend hazards to know before the first edit**, both explained in `backend/AGENTS.md` and
   not restated here: `app.auth.presented_token` must stay **logout-only**, and three entries in
   `backend/pyproject.toml` look removable but are load-bearing.
5. Read the **Post-review revisions** table at the bottom of `tasks.md` before touching Phase 3+:
   three tasks exist for non-obvious reasons and look droppable if you have not read it.
6. **Do not skip** `T075` at the end — amending the Auth row of `tech-defaults.md` to permit sliding
   reissue. `research.md` R-002 defers it to Reflect on purpose, so the rule is inherited by later
   modules rather than re-derived from an argument buried in a research file.

**Two stages are waiting on the human, not on code.** Neither blocks T018, and both were checked and
confirmed safe to run in parallel with Phase 2:

7. **Stage 3 (Load)** needs a **GitLab account**. Then: create the private project `creator-hub`,
   `git remote add origin`, `git push -u origin main` — that push fires the **first pipeline run ever**,
   which is the point of doing it early rather than at Phase 8. Protect `main` (allowed-to-push = no
   one) and require pipelines to succeed. Then `glab auth login` and import `tasks.md` as issues,
   creating T001–T017 and closing them immediately so `closes #N` references do not skew.
   `/speckit-taskstoissues` is GitHub-only and will abort — do not try to make it work.
   **After `main` is protected the local `--no-ff` merge flow is no longer valid**: push the branch,
   open an MR, let the pipeline gate it. Update `.claude/memory.md`, `tasks.md`'s closing note, and
   `quickstart.md`'s Outstanding setup at that moment.
8. **Stage 2 (Design)** needs the **design work itself** in the `CreatorHub Design System` project
   (already created, id in the table above, currently empty). Read
   `design/content-calendar/BRIEF.md` first — it carries the surface list, the locked status-cue
   encoding, and the `DO NOT INVENT` list to paste into the Claude Design prompt. Pull the export with
   `DesignSync list_files` / `get_file` into `design/content-calendar/`, then **run the data-shape
   audit before adapting anything**, and write the result into BRIEF.md even if it is clean. The
   deadline is **T034**, not T038 — see Decisions.

### Commands that are real now

```bash
docker compose up -d db                     # Postgres + creatorhub_test
docker compose up -d backend                # serves /health; first start ~70s while uv sync runs
```

Per-tree commands live with their rules, so they cannot drift from them: **`backend/AGENTS.md`** and
**`frontend/AGENTS.md`**. Current green state is 75 backend tests and 1 Playwright test at 375×667.

Not real yet: `pnpm dev` as anything but the scaffold (T026), and `docker compose up frontend`.

`glab` is installed but not authenticated and there is no remote, so no `glab` or `git push` command
works yet. The path is non-standard — see `CLAUDE.local.md`.

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
