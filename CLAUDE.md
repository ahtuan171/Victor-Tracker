# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-07-30: Phase 1 complete, Phase 2 in progress — T001–T012 of 76

On `main`, clean tree, 24 backend tests passing. Stage 1 planning is done and reviewed, the specs are
on `main`, both projects are scaffolded and green, and the backend now has config, the DB session,
the schema, a migration applied to a live Postgres, and the auth primitives.

The next task is **T013**. Phase 2 has **9 of 21 tasks left**: T013–T016 finish the backend
foundation, T017–T020 the test harness, T021–T028 the frontend foundation. Nothing in Phase 3–7 may
start until Phase 2 is complete.

**No frontend feature code exists yet** — `frontend/app/page.tsx` is still the create-next-app
placeholder.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete and on `main`**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**76 tasks, 8 phases; T001–T012 ticked**), `checklists/requirements.md` (16/16). |
| `backend/app/` | `config.py`, `db.py`, `models.py`, `auth.py`. **No `main.py`, no `api/`, no `scripts/` yet** — T014–T016. |
| `backend/alembic/` | One revision, `9483af05dd5b`, **applied to the live database**. `alembic check` clean. |
| `backend/tests/` | `test_placeholder.py` (delete at T017), `test_config.py`, `test_auth_core.py`. 24 passing. No database fixture yet — T017. |
| `frontend/` | Scaffolded only. Next **16.2.12** App Router, React 19.2.4, Tailwind **4**, shadcn/ui, `@dnd-kit/core`, `date-fns`, Playwright at 375px. Routes are still the scaffold's; `lib/` has only `utils.ts`. |
| `docker-compose.yml`, `.env.example`, `scripts/init-test-db.sql` | Written. `db` service **verified**: Postgres 17.10 healthy, `creatorhub_test` created by the init script. `backend` and `frontend` services not yet runnable — they need T016 and T026. |
| `.gitlab-ci.yml` | Written: `build → test → review → deploy`, deploy manual. **Never executed** — no GitLab project. |
| `drafts/` | `content-calendar.spec.draft.md` — superseded by `spec.md`. Kept for provenance; do not edit. |
| `design/`, `docs/` | Do not exist. Correct — stage 2 and T076 create them. |
| GitLab / remote / `glab` | **Still none of it.** No remote, no protected `main`, no pipeline run, `glab` not installed. |
| Local tooling | `uv` 0.11.32, `pnpm` 11.17.0, Python 3.13.5, Node **24.12.0**, Docker 29.3.1 (daemon stopped). |

### What the previous session did (stage 1)

1. Ran the full stage-1 chain: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
   `/speckit-tasks` → `/speckit-analyze`, from the hand-written draft.
2. Answered 8 clarification questions across two rounds (3 on entity/pipeline shape during specify,
   5 on security, interaction, and state transitions during clarify).
3. Ran the **`reviewer` agent** on the finished artifacts. It found **six blocking design gaps**;
   all six are now closed. Commit `62e67b8` has the full list.
4. Answered 3 design questions the review exposed — backlog placement, status-drag, data fetching —
   and applied the consequences across all seven artifacts.

**The lesson worth keeping**: `/speckit-analyze` reported **95% requirement coverage** on the version
of `tasks.md` that still contained all six blockers, including one that left every content item
permanently stuck in `idea`. Coverage checks whether a requirement is *cited* by a task, not whether
the tasks *compose into something that works*. Run both `/speckit-analyze` and the `reviewer` agent —
they catch different classes of defect. This is recorded as a trap in `.claude/memory.md`.

### What this session did (Phase 1)

1. **Fast-forwarded `main` to `001-content-calendar`** so the specs are the source of truth
   everything downstream can reference. See "Decisions this session" below — this was the open
   question the last session deliberately left.
2. Built T001–T007, one branch per task (`feature/001-<slug>`), each merged `--no-ff` into `main`.
   Seven merge commits, so the history already has the shape a real MR flow will produce.
3. Ticked T001–T007 in `tasks.md` and recorded the checkpoint result there, including the part that
   could not be verified.

**Verified green**: `uv sync`, `uv run pytest`, `ruff check`, `ruff format --check`, `mypy` (strict),
`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm exec playwright test` (1 passed at 375×667).

**Also verified**: `docker compose up -d db`. Postgres 17.10 comes up healthy,
`scripts/init-test-db.sql` creates `creatorhub_test`, and both databases are reachable from the host
over `psycopg` on 5432.

**Not verified**: the `backend` and `frontend` compose services. Neither is runnable yet — their
commands need `app.main:app` (T016) and a real `frontend/app/page.tsx` (T026). Re-check at the
Phase 2 checkpoint.

### What this session also did (Phase 2, T008–T012)

Backend foundation, one branch per task, same `--no-ff` flow.

- **T008** `app/config.py` — pydantic-settings, `get_settings()` cached. Tests cover the refusals.
- **T009** `app/db.py` — lazy engine, `SessionDep`, the single seam T017 overrides.
- **T010** `app/models.py` — `Creator`, `ContentItem`, `Status`, `Platform`, `STATUS_ORDER`.
- **T011** `alembic/versions/20260730_9483af05dd5b_*.py` — applied, round-tripped, `alembic check`
  clean.
- **T012** `app/auth.py` — hash/verify, issue/decode, `is_past_half_life`.

**Verified against the live database**: schema matches data-model.md column for column — named
`platform` and `status` enum types, `TIMESTAMPTZ`, `DATE`, identity PKs, the three indexes. Both
CHECK constraints were exercised by hand and refuse what they should: advancing to `draft` with no
platform (FR-009), clearing the platform of a `draft` (FR-009a), and a whitespace-only title
(FR-005).

**Three things this phase learned the hard way**, each already fixed but worth not rediscovering:

1. **`alembic check` is a required step, not a nicety.** The backlog partial index lived only in the
   migration, so metadata and database disagreed and the *next* autogenerated revision would have
   dropped it silently. Constraints and indexes are now declared on `ContentItem.__table_args__`
   too. Run `alembic check` after every revision.
2. **The enum downgrade asymmetry is real and only shows up on the second upgrade.** Verified by
   actually running `upgrade → downgrade base → upgrade`. Do that for every future migration.
3. **pydantic-settings matches constructor kwargs by field name, not by env-var name.** A test
   passing `Settings(JWT_SECRET=...)` populates nothing and passes for the wrong reason. Tests go
   through the real environment with `_env_file=None`.

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

### Decisions this session, and why

| Decision | Why |
|---|---|
| **Specs reached `main` by local fast-forward**, not an MR | The open question from last session, now closed. Creating the GitLab project first would have blocked all implementation on an account setup that blocks nothing else. With no remote there is no gate to satisfy, so this is a knowing exception to constitution VI — **`T076` must record it, not omit it.** Also in `.claude/memory.md`. |
| One branch per task, merged `--no-ff` | Keeps the working agreement in `tasks.md` real while there is no remote. The history already looks like the MR flow it will become, so nothing has to be reconstructed later. |
| **`pwdlib`, not `passlib`** | T002 required verifying passlib on 3.13. It fails — and not the way the trap note predicted. With `bcrypt` 5.0.0 the error comes from passlib's own backend probe hashing an over-72-byte password: `ValueError: password cannot be longer than 72 bytes`. passlib 1.7.4 is unmaintained. |
| No Dockerfiles; compose runs base images with bind mounts | Render and Vercel build from source and never read `docker-compose.yml`. Its only job is "Postgres + FastAPI + Next.js dev servers", which needs no image of our own. |
| `JWT_SECRET` has no default anywhere | An app that boots with a guessable secret is worse than one that refuses to boot. |
| Test database created by `scripts/init-test-db.sql` at initdb time | The pytest harness (T017) then needs no `CREATE DATABASE` privilege and **cannot point at the dev database by accident**. |
| `exactOptionalPropertyTypes` on | FR-023's partial-update semantics distinguish "field omitted → leave it" from "explicit null → clear it". Without this flag `{ platform: undefined }` is assignable to an optional field and the two collapse at the type level — the exact distinction T049 and T051 must keep apart. It caught a real bug within minutes (`workers: undefined` in the Playwright config). |
| `new Date` and `Date.parse` banned by eslint outside `lib/dates.ts` | Turns the recorded UTC-midnight trap into a build failure instead of a comment nobody reads (research.md R-006). Verified firing before it was committed. |
| Playwright's only project is 375×667, written out explicitly | 375px is a hard floor (constitution I), not one entry in a matrix. A named device preset could change the number under a Playwright upgrade; the number is the requirement. |
| CI `deploy` jobs **fail** when their hook variable is missing | A green deploy job that deployed nothing is worse than a red one. T071 sets the variables. |
| shadcn theme tokens hand-written into `globals.css` | `shadcn init` half-succeeded (see Traps). The block is explicitly provisional — stage 2 replaces it. Safe to replace wholesale: R-005 encodes status as shape and fill, so FR-017/SC-004 do not depend on any colour in that file. |
| `get_settings()` and `get_engine()` are cached functions, not module-level instances | Importing `app.config` must not be able to fail. A module-level `Settings()` turns a missing variable into an import error from whichever module happened to load first, instead of a startup error naming the variable. |
| `StrEnum`, not data-model.md's literal `(str, Enum)` | Identical values, but `f"{Status.IDEA}"` renders `idea` rather than `Status.IDEA`. Same schema, more readable logs. |
| `Identity()` PKs, not SQLAlchemy's default `SERIAL` | data-model.md says "identity", and identity columns avoid `SERIAL`'s separate sequence-ownership quirks. |
| Enum columns pass `values_callable` | SQLAlchemy otherwise stores the Python member *names* (`IDEA`) while the contract, the frontend, and every fixture use `idea`. It only surfaces on a real round trip. |
| CHECKs and the partial index declared in **both** the model and the migration | Not duplication for its own sake. Alembic compares indexes: with the index only in the migration, `alembic check` reports drift and the next autogenerated revision drops it. |
| bcrypt's 72-byte limit handled at the boundary, in bytes | `hash_password` raises; `verify_password` returns `False`, because at login an over-long password is just a wrong one and a distinct error leaks the credential's shape. Counted in UTF-8 bytes — a 24-character emoji password is 96 bytes. |
| One `InvalidTokenError` for absent, malformed, expired, and wrong-key | The API says 401 and nothing more. Distinguishing them tells an attacker which half of the problem to work on. |

### Next session starts here

1. **Start Docker Desktop, then `docker compose up -d db`.** Postgres is verified working, but the
   daemon does not survive a reboot, and T017 fails confusingly without it. Then
   `cd backend && uv run alembic upgrade head` if the volume was recreated.
2. **Continue at T013** in `specs/001-content-calendar/tasks.md`. The remaining Phase 2 order:

   | Tasks | What |
   |---|---|
   | T013–T016 | `current_creator` dependency, `/auth/login` + `/auth/logout`, seed script, `main.py` |
   | T017–T020 | pytest harness, then the auth / schema / error-shape tests |
   | T021–T028 | proxy allowlist, the proxy itself, API client, login page, root redirect, session guard, `lib/dates.ts` |

3. **T013 is the one that is easy to under-build.** It must attach `X-Access-Token` when the
   presented token is past half-life. `app.auth.is_past_half_life` already exists and is tested; the
   dependency just has to use it and set the header. Without it, sliding reissue has no transport
   and every session dies on day 30 — this was one of the six blockers the reviewer pass caught.
4. **T016 needs the `RequestValidationError` handler** that flattens FastAPI's array-shaped `detail`
   into the single string `contracts/openapi.yaml` declares. Without it the contract is a lie and
   the generated client renders `[object Object]`.
5. **T017 must point at `TEST_DATABASE_URL`, never `DATABASE_URL`.** `creatorhub_test` already
   exists. The variable is in `.env.example` and in the local `.env`; `app/config.py` does *not*
   read it yet, because nothing outside the harness should be able to reach the test database.
6. **Do not "tidy" `backend/pyproject.toml` back to passlib.** The comment there records why.
7. Read the **Post-review revisions** table at the bottom of `tasks.md` before touching Phase 3+:
   three tasks exist for non-obvious reasons and look droppable if you have not read it.
8. **Stage 3 (Load)** whenever the GitLab account is ready: create the private project, protect
   `main`, install `glab`, then import `tasks.md` as issues with `glab issue create`.
   `/speckit-taskstoissues` is GitHub-only and will abort — do not try to make it work. Blocks
   shipping, not implementation.
9. **Stage 2 (Design)** is still open and still not blocking. R-005 fixes the status-cue *semantics*
   independently of colour, and the placeholder tokens now in `globals.css` are built to be replaced.
10. **Do not skip** `T075` at the end — amending the Auth row of `tech-defaults.md` to permit sliding
    reissue. `research.md` R-002 defers it to Reflect on purpose, so the rule is inherited by later
    modules rather than re-derived from an argument buried in a research file.

### Commands that are real now

```bash
docker compose up -d db                     # Postgres + creatorhub_test

cd backend
uv sync
uv run alembic upgrade head                 # applies 9483af05dd5b
uv run alembic check                        # must say "No new upgrade operations detected"
uv run pytest                               # 24 passing
uv run ruff check . && uv run ruff format --check . && uv run mypy .

cd frontend
pnpm install
pnpm build && pnpm typecheck && pnpm lint
pnpm exec playwright test                   # 1 passing at 375x667
```

Not real yet: `uv run uvicorn app.main:app` (T016), `uv run python -m app.scripts.seed_user` (T015),
`pnpm dev` as anything but the scaffold (T026).

## What this is

CreatorHub — a personal brand operating system for a content creator. Four planned modules:
Content Calendar, Growth Tracker, Media Kit Generator, Deal/Collab Tracker.

**v0.1 ships Content Calendar only.** The other three are later iterations, each re-running the full
8-stage workflow with a new `spec.md` against the same constitution. Do not add fields, endpoints, or
screens for the other modules while working on v0.1 — that is the main failure mode this project is
structured to avoid.

## Detailed rules

@.claude/rules/workflow.md
@.claude/rules/tech-defaults.md
@.claude/rules/design.md

## Working memory

@.claude/memory.md

## Non-negotiables

Three rules that override convenience in any given moment:

1. **`specs/` outranks code.** When they disagree, one is wrong — decide which, fix it, and say so
   in the MR. Never code around the gap.
2. **`spec.md` contains no technology.** What and why only. Technology lives in `plan.md`.
3. **Nothing outside the current spec gets built.** Useful ideas become input for the next
   iteration; write them into `.claude/memory.md` under Deferred, do not implement them.
