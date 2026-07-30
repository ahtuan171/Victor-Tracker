# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-07-30: Phase 1 (Setup) complete — T001–T007 of 76

On `main`, clean tree. Stage 1 planning is done and reviewed, the specs are on `main`, and both
projects are scaffolded, linting, type-checking, and testing green. **No feature code exists yet** —
`backend/app/` is empty and `frontend/app/page.tsx` is still the create-next-app placeholder.

The next task is **T008**. Phase 2 (Foundational, 21 tasks) is the long pole and blocks every user
story.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete and on `main`**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**76 tasks, 8 phases; T001–T007 ticked**), `checklists/requirements.md` (16/16). |
| `backend/` | Scaffolded. `pyproject.toml` + `uv.lock`, ruff and mypy at CI strictness, one placeholder test. `app/` is **empty** — T008 onward fill it. |
| `frontend/` | Scaffolded. Next **16.2.12** App Router, React 19.2.4, Tailwind **4**, shadcn/ui, `@dnd-kit/core`, `date-fns`, Playwright at 375px. Routes are still the scaffold's. |
| `docker-compose.yml`, `.env.example`, `scripts/init-test-db.sql` | Written. **Never executed** — Docker Desktop was not running this session. |
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

**Not verified**: `docker compose up`. Docker Desktop was not running. `docker compose config`
validates the file, but no container has started, so Postgres, the init script that creates
`creatorhub_test`, and the two dev-server commands are all unproven. **Do this first next session** —
T011 (Alembic) and T017 (pytest harness) both need a live database, and a compose bug found then will
look like a migration bug.

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

### Next session starts here

1. **Start Docker Desktop and run `docker compose up`.** This is the one Phase 1 gate that was never
   exercised. Confirm Postgres comes up healthy and that `creatorhub_test` exists. Do it before T011,
   not during — a compose bug discovered mid-Alembic reads like a migration bug.
2. **Implementation continues at T008** in `specs/001-content-calendar/tasks.md`. Phase 2 order:
   T008–T016 backend foundation, T017–T020 test harness, T021–T028 frontend foundation. Nothing in
   Phase 3–7 may start until Phase 2 is complete.
3. **Two constraints already discovered that Phase 2 must honour**:
   - **bcrypt refuses passwords over 72 bytes** — it no longer truncates. T012 and T015 must bound
     length at the boundary and say so; truncating silently would let two different passwords open
     the same account.
   - **`backend/pyproject.toml` carries the reasoning for `pwdlib`** in a comment. Do not "tidy" it
     back to passlib.
4. Read the **Post-review revisions** table at the bottom of `tasks.md` before touching Phase 3+:
   three tasks exist for non-obvious reasons and look droppable if you have not read it.
5. **Stage 3 (Load)** whenever the GitLab account is ready: create the private project, protect
   `main`, install `glab`, then import `tasks.md` as issues with `glab issue create`.
   `/speckit-taskstoissues` is GitHub-only and will abort — do not try to make it work. Blocks
   shipping, not implementation.
6. **Stage 2 (Design)** is still open and still not blocking. R-005 fixes the status-cue *semantics*
   independently of colour, and the placeholder tokens now in `globals.css` are built to be replaced.
7. **Do not skip** `T075` at the end — amending the Auth row of `tech-defaults.md` to permit sliding
   reissue. `research.md` R-002 defers it to Reflect on purpose, so the rule is inherited by later
   modules rather than re-derived from an argument buried in a research file.

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
