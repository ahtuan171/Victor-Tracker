# Build log

What happened at each stage and task, in order. **Not loaded into context** — `CLAUDE.md` links here
instead of importing it, because this is a record, not a rule.

**Read it when** you need to know *why* something was done at a specific task, whether a thing was
verified or only assumed, or what a checkpoint actually proved. **Do not read it** to find out the
current state (that is `CLAUDE.md`), the rules (`.claude/rules/`), or a trap you must avoid
(`.claude/memory.md` — every trap below is duplicated there on purpose, because traps must be in
context and narrative need not be).

---

## Stage 1 — plan

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
they catch different classes of defect.

---

## Phase 1 — T001–T007, setup

1. **Fast-forwarded `main` to `001-content-calendar`** so the specs are the source of truth
   everything downstream can reference. This was the open question the previous session deliberately
   left; the reasoning is in `CLAUDE.md`'s decisions table and in `.claude/memory.md`.
2. Built T001–T007, one branch per task (`feature/001-<slug>`), each merged `--no-ff` into `main`.
   Seven merge commits, so the history already has the shape a real MR flow will produce.
3. Ticked T001–T007 in `tasks.md` and recorded the checkpoint result there, including the part that
   could not be verified.

**Verified green**: `uv sync`, `uv run pytest`, `ruff check`, `ruff format --check`, `mypy` (strict),
`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm exec playwright test` (1 passed at 375×667).

**Also verified**: `docker compose up -d db`. Postgres 17.10 comes up healthy,
`scripts/init-test-db.sql` creates `creatorhub_test`, and both databases are reachable from the host
over `psycopg` on 5432.

**Not verified at the time**: the `backend` and `frontend` compose services. `backend` was closed at
T016; `frontend` still needs a real `frontend/app/page.tsx` (T026).

---

## Phase 2 backend — T008–T016

Backend foundation, one branch per task, same `--no-ff` flow.

- **T008** `app/config.py` — pydantic-settings, `get_settings()` cached. Tests cover the refusals.
- **T009** `app/db.py` — lazy engine, `SessionDep`, the single seam T017 overrides.
- **T010** `app/models.py` — `Creator`, `ContentItem`, `Status`, `Platform`, `STATUS_ORDER`.
- **T011** `alembic/versions/20260730_9483af05dd5b_*.py` — applied, round-tripped, `alembic check`
  clean.
- **T012** `app/auth.py` — hash/verify, issue/decode, `is_past_half_life`.
- **T013** `app/auth.py` — `current_creator` + `CurrentCreator`, attaching `X-Access-Token` past
  half-life. Also `presented_token`, the lenient dependency **only logout may use**.
- **T014** `app/api/auth.py` — login and logout, `normalise_email`, a timing equaliser so an unknown
  email costs the same as a wrong password.
- **T015** `app/scripts/seed_user.py` — creates the one account, updates its password on re-run,
  refuses a second address.
- **T016** `app/main.py` — the `RequestValidationError` flattener, CORS, `GET /health`.

**Verified against `creatorhub_test`** with a throwaway script: 32 checks, all passing — the flattened
error shape (including through the real uvicorn server, not just `TestClient`), login and its 401
paths, all five `current_creator` refusals, sliding reissue in both directions including that a
reissued token works and does not immediately re-reissue, and logout from valid, expired, garbage,
and absent credentials. The generated `openapi.json` was checked for 422 shape and `format: email`
rather than assumed to match the contract.

**That script has since been deleted.** Its assertion list is the specification for T018, and the
four easiest to forget are restated in `CLAUDE.md`'s next-steps section.

**Verified against the live database**: schema matches data-model.md column for column — named
`platform` and `status` enum types, `TIMESTAMPTZ`, `DATE`, identity PKs, the three indexes. Both
CHECK constraints were exercised by hand and refuse what they should: advancing to `draft` with no
platform (FR-009), clearing the platform of a `draft` (FR-009a), and a whitespace-only title
(FR-005).

**Learned the hard way in this batch**, all now traps in `.claude/memory.md`:

1. `HTTPBearer` with the default `auto_error=True` returns **403**, not the contract's 401.
2. `TestClient` warns that `httpx` is deprecated in favour of `httpx2` — resolved at T017.
3. The Windows console is cp1252, so an em dash in a script's printed output becomes `?`.
4. **`alembic check` is a required step, not a nicety.** The backlog partial index lived only in the
   migration, so metadata and database disagreed and the *next* autogenerated revision would have
   dropped it silently.
5. **The enum downgrade asymmetry only shows up on the second upgrade.** Verified by actually running
   `upgrade → downgrade base → upgrade`.
6. **pydantic-settings matches constructor kwargs by field name, not by env-var name.** A test passing
   `Settings(JWT_SECRET=...)` populates nothing and passes for the wrong reason.

---

## T017 — the pytest harness

`backend/tests/conftest.py`: dedicated test database via `TEST_DATABASE_URL`, transactional rollback,
anonymous client, authenticated client. 33 passing; `ruff`, `ruff format`, `mypy --strict`, and
`alembic check` all clean. `test_placeholder.py` deleted. The full result note is in `tasks.md` under
T017. Three things worth not rediscovering, all also in `.claude/memory.md`:

- **The schema is created by `alembic upgrade head`, not `metadata.create_all`**, and it was verified
  against a genuinely empty database (`drop schema public cascade`, then `pytest`). CI's `test:backend`
  job runs `uv run pytest` with **no migration step of its own**, so a harness that assumed a
  pre-existing schema would pass locally — where `creatorhub_test` was migrated by hand at T011 — and
  fail on the first pipeline with what looks like a fixture bug.
- **`join_transaction_mode="create_savepoint"` is load-bearing**, and not for the reason it appears to
  be. All three modes survive the outer rollback; they differ when an endpoint catches an
  `IntegrityError` and calls `session.rollback()`. Only `create_savepoint` leaves fixture rows intact.
  That is exactly the T030 and T046 409 path.
- **The long-lived test database had leftovers** — a `creator` row committed by T016's throwaway
  script, surfacing as an isolation test that failed as if rollback were broken. The harness now empties
  both tables once per session, behind a guard refusing any `TEST_DATABASE_URL` not named `*_test`.

Also settled: the `starlette.testclient` deprecation is fixed by installing **`httpx2`**, not by
filtering the warning — which is what made `filterwarnings = ["error"]` possible in `pyproject.toml`.

---

## Stage 2 and stage 3 groundwork — 2026-07-30

A check of the standing claim that *"stage 2 (Design) and stage 3 (Load) run in parallel with Phase 2"*.
**The claim is correct** — verified against `research.md` Open items, `quickstart.md` Outstanding setup,
and the note at the bottom of `tasks.md`; no task from T018 to T070 needs a git remote or a design
export. But "does not block implementation" was hiding a cost that grows, so:

- **`glab` 1.110.0 installed.** Not in `Program Files` — path is in `CLAUDE.local.md`. Not authenticated.
- **Claude Design project created** — `CreatorHub Design System`, through `DesignSync create_project`
  rather than by hand, because project type is immutable at creation. It is empty.
- **`design/content-calendar/BRIEF.md` written** — the constraints the export must respect, the exact
  surface list, and the data-shape audit checklist, derived from `data-model.md`'s "Not present" table.
- **The constitution VI exception was restated** in `.claude/memory.md`, because it had drifted from
  covering one spec fast-forward to covering every merge since, and T076 now records the range rather
  than only the fast-forward.
- **A CI gap was found and written into T017's task text**: `test:backend` never migrates its database.

**Both stages are blocked on account/human work, not on code**: a GitLab account, and the design work
itself. Neither blocks T018.

### The split that produced this file

`CLAUDE.md` plus its five imports were ~55K characters — about 13.7K tokens on **every** session start,
and growing with each task. The narrative above was the bulk of it and the least load-bearing part: a
future session needs to *avoid* the traps, not read the story of finding them, and every trap here is
also in `.claude/memory.md`, which stays imported.

So the rule going forward: **traps and decisions stay in context; chronology comes here.** When you
finish a task, add its narrative to this file and put only the durable rule in `.claude/memory.md`.
