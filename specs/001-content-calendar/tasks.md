---

description: "Task list for Content Calendar (001) implementation"
---

# Tasks: Content Calendar

**Input**: Design documents from `/specs/001-content-calendar/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml),
[quickstart.md](./quickstart.md)

**Tests**: Included. `.claude/rules/workflow.md` stage 5 requires pytest coverage of models and
endpoints plus one Playwright E2E flow, and constitution principle VI makes failing tests block merge.
Tests are not optional here.

**Organization**: grouped by user story so each is independently implementable and testable.

**Revision**: rewritten after a `reviewer` pass found three requirements with no buildable design
behind them. What changed and why is recorded at the bottom under
[Post-review revisions](#post-review-revisions) — read that before assuming a task is where you
remember it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on incomplete work
- **[Story]**: which user story the task serves (US1–US5)
- Every task names its exact file path

## Path Conventions

Web application layout per [plan.md](./plan.md): `backend/app/`, `backend/tests/`, `frontend/app/`,
`frontend/components/`, `frontend/lib/`, `frontend/tests/`.

There is **one content route**, `/calendar`. The backlog is a drawer on it, not a route
(research.md R-003a).

## Working agreement

- One merge request per task, branched from `main` as `feature/001-<task-slug>`.
- Commits reference their issue: `feat: add content item CRUD (closes #12)`.
- Each task is sized at half a day to a day. If one needs two sentences to describe, it is two tasks.
- No abstraction is introduced before a second caller exists.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: get both projects building, linting, testing, and running before any feature code exists.

- [x] T001 Create `docker-compose.yml` at repository root with Postgres, backend, and frontend services, plus `.env.example` listing every variable both apps read
- [x] T002 Initialise the backend project in `backend/pyproject.toml` with `uv`, declaring FastAPI, SQLModel, Alembic, `psycopg`, `pyjwt`, and a password-hashing library — verify `passlib` actually imports on Python 3.13 before committing to it, and fall back to `pwdlib` if it does not (research.md Open items)
- [x] T003 [P] Initialise the frontend project in `frontend/package.json` with `pnpm`, Next.js App Router, Tailwind, and shadcn/ui, then add `@dnd-kit/core`, `date-fns`, and `@playwright/test`
- [x] T004 [P] Configure `ruff` and `mypy` in `backend/pyproject.toml` with the strictness settings CI will enforce
- [x] T005 [P] Configure `eslint` and `tsc --noEmit` in `frontend/` including the `tsconfig.json` strict flags
- [x] T006 [P] Create `frontend/playwright.config.ts` with a 375px mobile viewport as the default project, plus a placeholder spec so the runner exits zero on an empty suite
- [x] T007 Create `.gitlab-ci.yml` with the four stages `build → test → review → deploy`, running `ruff`, `mypy`, `eslint`, `tsc`, `pytest`, and `playwright`, with `deploy` gated on manual approval

**Checkpoint**: both apps start, both lint clean, both test runners exit zero on an empty suite.

**Checkpoint result (2026-07-30)**: reached, with one part unverified.

| Gate | Result |
|---|---|
| `uv sync` | ✅ resolves and imports on Python 3.13 |
| `uv run pytest` | ✅ exit 0 (`tests/test_placeholder.py`) |
| `uv run ruff check .` / `ruff format --check .` | ✅ clean |
| `uv run mypy .` | ✅ clean, strict |
| `pnpm build` | ✅ Next 16.2.12 production build |
| `pnpm typecheck` | ✅ clean at the T005 strictness |
| `pnpm lint` | ✅ clean; the `new Date` ban verified firing |
| `pnpm exec playwright test` | ✅ 1 passed at 375×667 |
| `docker compose up -d db` | ✅ Postgres 17.10 healthy; `scripts/init-test-db.sql` created `creatorhub_test`; both databases reachable from the host over `psycopg` on 5432 |
| `docker compose up backend` | ✅ **closed at T016.** Boots and serves `GET /health`; first start takes ~70s while `uv sync` runs inside the container. |
| `docker compose up frontend` | ⚠️ **still not runnable.** Needs a real `frontend/app/page.tsx` (T026). Re-check at the Phase 2 checkpoint. |

At the time this checkpoint was reached, "both apps start" was only true in the sense that the
toolchains worked: `backend/app/` had no `app.main:app` to serve, and `frontend/app/page.tsx` is
still the create-next-app placeholder until T026. The backend half is now genuinely true.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the schema, the auth boundary, and the proxy. Every user story depends on all of it.

**⚠️ CRITICAL**: no user story work begins until this phase is complete.

Deliberately kept as small as it can honestly be — this phase blocks production, so anything that can
wait for the story that needs it has been moved there.

### Backend foundation

- [x] T008 [P] Implement environment-backed settings in `backend/app/config.py`, including database URL, JWT secret, and token lifetime
- [x] T009 [P] Implement the engine and request-scoped session dependency in `backend/app/db.py`
- [x] T010 Define `Creator`, `ContentItem`, and the `Status` and `Platform` enums in `backend/app/models.py`, exactly matching the column table in [data-model.md](./data-model.md) — no owner column, no version column. The `Platform` enum is the fixed three-member set the creator cannot edit, and the column is single-valued (FR-010, FR-010a); `Status` is the three-member pipeline defaulting to `idea` (FR-007)
- [x] T011 Initialise Alembic and generate the first migration under `backend/alembic/versions/`, adding the INV-1 and INV-2 `CHECK` constraints and the three indexes from data-model.md by hand, and writing the enum `CREATE TYPE`/`DROP TYPE` explicitly since autogenerate handles them asymmetrically on downgrade
- [x] T012 Implement password verification and token issue/decode in `backend/app/auth.py`, with a 30-day lifetime
- [x] T013 Implement the `current_creator` dependency in `backend/app/auth.py`, attaching an `X-Access-Token` response header when the presented token is past half-life (research.md R-002 — without this header sliding reissue has no transport)
- [x] T014 Implement `POST /auth/login` and `POST /auth/logout` in `backend/app/api/auth.py`, with logout succeeding even when the presented token is already expired so sign-out cannot deadlock
- [x] T015 [P] Write the single-account seed script in `backend/app/scripts/seed_user.py`, reading credentials from the environment — this script is the whole of "exactly one creator account, no roles, no invitations" (FR-003), since it refuses a second address
- [x] T016 Install a `RequestValidationError` handler in `backend/app/main.py` that flattens FastAPI's array-shaped `detail` into the single string the contract declares, then assemble the app — router registration, CORS restricted to the frontend origin, and a public `GET /health`

**Backend foundation result (2026-07-30)**: complete. Verified against `creatorhub_test` with a
throwaway script — 32 checks, all passing — covering the flattened error shape, login and its 401
paths, all five `current_creator` refusals, sliding reissue in both directions, and logout from
valid, expired, garbage, and absent credentials. `docker compose up backend` now boots and serves
`/health`, which closes the one Phase 1 checkpoint gate that could not be checked.

Two decisions taken here that the task text does not imply:

- **`/auth/logout` returns 401 only when no credential is presented at all.** The contract lists 401
  on that path while T014 requires logout to work from an expired session, so the two read as if they
  disagree. They are reconciled by a second, deliberately lenient dependency — `presented_token` —
  which requires a credential to *exist* without requiring it to still be *valid*. Logout is the only
  caller and must stay the only caller.
- **Seed credentials are read through their own `BaseSettings`, not `app.config.Settings`.** Required
  there, the API would refuse to boot on every deployment after the first; optional there, every API
  process would hold the account's plaintext password in memory. Re-running the script against the
  seeded address updates the password, which is v0.1's only recovery path — there is no reset
  endpoint and there will not be one.

### Backend test harness

- [x] T017 Build the pytest harness in `backend/tests/conftest.py` with a dedicated test database, a transactional-rollback fixture, an anonymous client, and an authenticated client — the harness creates the schema itself by running `alembic upgrade head`, not `metadata.create_all`, because the CI `test:backend` service container starts empty and no other pipeline step migrates it, and because `create_all` would build the enum types and CHECK constraints from model metadata instead of from the migration that actually runs in production
- [x] T018 [P] Write `backend/tests/test_auth.py` covering login success, wrong password, absent token, malformed token, expired token, logout with an expired token, and the presence of `X-Access-Token` past half-life (FR-001, FR-002, FR-002a)
- [x] T019 [P] Write `backend/tests/test_schema.py` asserting `content_item` has no column matching `%user%`, `%owner%`, `%tenant%`, or `%version%` (FR-003, INV-4, constitution VII) — the schema's *absence* of an ownership concept is the other half of FR-003, and the half a seed script cannot enforce
- [x] T020 [P] Write `backend/tests/test_errors.py` asserting every 4xx response body matches the contract's `{"detail": "<string>"}` shape, including a validation failure that would otherwise return an array

**T020 result (2026-07-31)**: done. 21 new tests, suite at **96 passing**; `ruff`, `ruff format`,
`mypy --strict`, and `alembic check` clean. **Phase 2's backend half is complete** — T021 is frontend.

**The contract's uniformity promise has two halves that fail independently**, and the task text only
describes one. The runtime body is fixed by the flattener in `main.py`; the *generated document* is
not, and a client is built from the document. Writing the second half's assertions found real drift:
`POST /auth/login` declared its 401 with a description and **no model**, and `POST /auth/logout`
declared no 401 at all — so the generated document promised no body for the response the login form
most needs to render. Fixed by declaring `ErrorResponse` on both, which required lifting it out of
`main.py` into the new `app/schemas.py` (a router importing `main` would be circular). Doing this now
rather than at T030 means the six content-item routes inherit the right pattern instead of copying
the wrong one.

**One wart is now pinned rather than fixed**: `/health` advertises a 422 it can never produce, a side
effect of declaring the 422 model on the `FastAPI()` constructor. Declaring it per route instead
would let one forgotten route reintroduce FastAPI's array-shaped `HTTPValidationError`, which is a
worse failure than an impossible response in the document. A test documents the trade so it is not
"tidied" into a real defect.

**Verified by breaking each guarantee in turn**, and the three failure sets are disjoint, which is
the evidence that both halves are genuinely being tested:

| Removed | What failed |
|---|---|
| the `RequestValidationError` flattener | only the runtime-shape tests; every document test stayed green |
| the global 422 declaration | only the document tests; every runtime test stayed green |
| the `model` on login's 401 | the two tests asserting a declared 4xx carries a schema |

**T019 result (2026-07-31)**: done. 15 new tests, suite at **75 passing**; `ruff`, `ruff format`,
`mypy --strict`, and `alembic check` clean.

**This task amended `data-model.md`.** The task text specifies four patterns — `%user%`, `%owner%`,
`%tenant%`, `%version%` — and none of them match `creator_id`. The owner entity in this schema is
called `creator`, so the single column this project would plausibly add was the one the guard could
not see. INV-4 now lists `%creator%` and requires the no-foreign-key assertion it already described
in prose. Recorded rather than silently widened, per the "when code and spec disagree" rule: the
enumeration disagreed with its own heading, and the enumeration was wrong.

Two layers, because neither alone is enough. The **pattern tests** (10, parametrized from the
`Columns deliberately absent` table) name the broken rule and its requirement in the failure message
but cannot be exhaustive. The **allowlist test** asserts the exact nine-column set and catches an
owner column under any name at all, but can only say "this should not exist". There are also
assertions that `content_item` has no foreign key, that the schema holds no third table
(constitution VII's "organization entities" arrive as tables, not columns), and that `creator` has no
`role`/`is_admin`/`organization_id`.

**Verified by making it fail**, not by observing green: `ALTER TABLE content_item ADD COLUMN
creator_id INTEGER REFERENCES creator(id)` plus `CREATE TABLE organization`, inside a transaction
that was then rolled back. All four guards fired. A test that asserts an absence passes trivially
when it is broken, so this check is the only evidence the suite means anything.

**T018 result (2026-07-31)**: done. 27 new tests, suite at **60 passing**; `ruff`, `ruff format`,
`mypy --strict`, and `alembic check` clean.

Two things the task text does not imply:

- **No shipped endpoint depends on `CurrentCreator` yet**, so there was nothing to point the FR-002
  refusals at. `/health` and `/auth/login` are public and `/auth/logout` deliberately uses
  `presented_token`; the content-item routes arrive at T030. The file therefore mounts one throwaway
  route on the **real** app — same handlers, same session override, same database — and removes it
  afterwards. When T030 lands, do **not** move these assertions onto a content-item endpoint: a
  failure there would not say whether authentication or the endpoint broke.
- **It found one real defect.** `create_access_token` returned an `expires_at` carrying microseconds
  while the paired `exp` claim is integer seconds, so the login body advertised an expiry a fraction
  of a second later than the token enforced — contradicting that function's own docstring. Fixed by
  truncating `now` to whole seconds, which is the only application change in this task.

**T017 result (2026-07-30)**: done. 33 passing; `ruff`, `ruff format`, `mypy --strict`, and
`alembic check` clean. `tests/test_placeholder.py` deleted as the task requires.

Three things the task text does not imply, each measured rather than assumed:

- **Verified against an empty database, not just a working one.** `drop schema public cascade` on
  `creatorhub_test`, then `uv run pytest` — green. That is the CI condition the task text now
  describes, and it is the only way to know the migration step is really wired in.
- **`join_transaction_mode="create_savepoint"` is load-bearing for a different reason than it looks.**
  All three modes are safe for the outer rollback. They differ on an *inner* rollback: when an
  endpoint catches an `IntegrityError` and calls `session.rollback()`, only `create_savepoint` unwinds
  to the savepoint and leaves the test's own fixture rows intact. Under SQLAlchemy's default and under
  `rollback_only` the `creator` fixture disappears mid-test. That is exactly the T030 and T046 409
  path, so the mode had to be right before those tests exist rather than after they fail for a reason
  that looks like application logic.
- **The test database is long-lived, so it had leftovers.** `creatorhub_test` still held a `creator`
  row committed by T016's throwaway verification script, and the symptom was an isolation test failing
  as though the rollback were broken. The harness now empties both tables once per session, behind a
  guard that refuses any `TEST_DATABASE_URL` not named `*_test`.

Also settled here: the recorded `starlette.testclient` deprecation is resolved by installing
**`httpx2`** rather than filtering the warning, which is what made `filterwarnings = ["error"]`
possible in `pyproject.toml`. A blanket ignore would have hidden real FastAPI deprecations too.

### Frontend foundation

- [x] T021 Define the proxy path and method allowlist in `frontend/lib/proxy-allowlist.ts`, derived from the contract, with a test asserting the two stay in sync (research.md R-008)
- [x] T022 Implement the server-side proxy at `frontend/app/api/[...path]/route.ts`: reject anything off the allowlist with 404, attach the token from the session cookie, and on seeing `X-Access-Token` rewrite the cookie with a fresh `Max-Age` and strip the header before responding (research.md R-001, R-002)
- [x] T023 Generate the typed API client in `frontend/lib/api.ts` for login, logout, list, and create only — the remaining operations arrive with the stories that call them
- [x] T024 Add a single 401 handler to `frontend/lib/api.ts` that redirects to `/login`, so an expired session cannot leave content data on screen (spec Edge Cases, FR-002). **Amended at T022** — see the note below; the cookie is cleared by the proxy, not here
- [x] T025 Build the login page in `frontend/app/login/page.tsx`, setting the session cookie through the proxy on success
- [x] T026 Build the root route in `frontend/app/page.tsx` as a server-side redirect to `/calendar` when a session cookie is present and `/login` otherwise, so the bookmarked root does not 404 (SC-001, US1 scenario 1)
- [x] T027 Add the session guard to `frontend/app/(app)/layout.tsx` as a server component, and re-assert it in the calendar page's own data load — App Router layouts are not re-executed on soft navigations, so the layout alone is not sufficient (FR-002, SC-006). **The re-assert half lands at T033**, which is where the calendar page first exists — see the note below
- [x] T028 [P] Implement date-only helpers in `frontend/lib/dates.ts`, parsing and formatting `YYYY-MM-DD` without ever constructing a `Date` from a bare date string, and exposing `today()` for client use only (research.md R-006 and its addendum)

Two amendments made while building T022, recorded here rather than absorbed silently — code and spec
disagreeing is a thing this project fixes on one side and states, never codes around.

- **T024 no longer clears the cookie; T022 does.** The original wording put "clears the session
  cookie" in `frontend/lib/api.ts`, which runs in the browser — and an `httpOnly` cookie is
  unreachable from there by design (research.md R-001). The proxy is the only component that can
  delete it, so it clears the cookie on *every* 401, not just on sign-out. The alternative was
  inventing an endpoint whose sole job is deleting a cookie, which is a worse answer to the same
  question. T024 keeps its purpose — one place that notices a 401 — and loses a mechanism it never
  had access to.
- **T027's second half is deferred to T033.** "Re-assert it in the calendar page's own data load"
  names `frontend/app/(app)/calendar/page.tsx`, which does not exist until T033. T027 therefore
  delivers the layout guard only, and T033 carries the re-assert. Between T026 and T033 a signed-in
  creator landing on `/` is redirected to a `/calendar` that 404s; that is an honest intermediate
  state for a phase whose own checkpoint says no content feature works yet, and **not** a reason to
  build the calendar page early — nothing outside the current phase gets built.

T022 also did two things its own line does not describe, both because no other component could:
it captures `access_token` out of the login response body into the cookie (forwarding it would hand
a 30-day credential to browser JavaScript, undoing R-001), and it derives the cookie's `Max-Age`
from the token's own `exp` claim rather than from a frontend copy of `TOKEN_TTL_DAYS`.

**T023 result (2026-07-31)**: done. 20 new tests, frontend suite at **58 passing**; `pnpm typecheck`
and `pnpm lint` silent. Three notes worth carrying:

- **"Generate" means "write by hand."** The project installs no OpenAPI codegen and should not: eight
  operations and four schemas is smaller than the toolchain that would generate them, and R-007 asks
  for "a typed fetch wrapper", not a generated SDK. The debt that buys is drift, so
  `tests/contract/api-types.spec.ts` reads `openapi.yaml` and fails when a closed enum gains a value
  the client lacks. Object shapes are left to `tsc` — an interface has no runtime form to compare.
- **The contract does not require the four nullable fields on `ContentItem`**, so a response may omit
  them rather than send null. The client normalises absent to `null` at the boundary instead of
  typing them `hook?: string | null`, which would put a `?? null` on every read site in the calendar
  and the drawer. The contract was left alone: "may be omitted" is a legitimate reading, and the
  client making it untrue for its callers is cheaper than a spec amendment.
- **`logout()` swallows a 401 and only a 401.** The proxy clears the cookie on any 401, so the
  session really is over by the time the client sees it; throwing would strand the creator in a
  signed-out state the UI still believes is signed in. This is what makes the checkpoint's "sign-out
  works even from an expired session" true from the client side.

**T024 result (2026-07-31)**: done. 7 new tests, frontend suite at **65 passing**; `pnpm typecheck`
and `pnpm lint` silent. The amendment above held — no cookie is written here, and the handler is one
branch inside the single `request()` helper.

**Two exemptions the task line does not mention, both required for it to be correct.** A 401 from
`POST /auth/login` is a wrong password, not a dead session: redirecting would reload `/login` and
discard the message the form exists to show. A 401 from `POST /auth/logout` means the session was
already over, which is where logout was heading anyway — its caller owns that navigation. Everything
else redirects. A third guard skips the redirect when the page is already `/login`.

**It is a full `window.location.replace`, not a router push.** The T027 guard is a server component
and App Router layouts are not re-executed on soft navigations, so a client-side push could reach
`/login` without the server ever re-reading the cookie. `replace` rather than `assign` keeps the
page that just 401'd out of history, where going back to it would 401 again.

**T025–T028 result (2026-07-31)**: done, and **these four were the first tasks in this project to go
through a real merge gate**. Before starting them, `only_allow_merge_if_pipeline_succeeds` was set to
`true` and `main`'s allowed-to-push dropped from Maintainers to **no one** — both verified against the
GitLab API rather than taken on trust. T025 is therefore **the task number where the constitution VI
exception ends**: MRs !1–!4, each with a green pipeline before merge. Everything from the stage-1
fast-forward through T024 remains a knowing exception, and T076 records the range.

Frontend suite **65 → 90 passing, 4 skipped**. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

Four things worth carrying forward:

- **T025 stores nothing on success, and its form renders its own error.** Both follow from T022–T024
  and look like omissions otherwise: `login()` resolves to `{expires_at}` and no token because the
  cookie was already set on that response, and `lib/api.ts` exempts `/auth/login` from the 401
  redirect so a wrong password reaches the form instead of reloading the page. There is now a test
  asserting the second end to end, so removing the exemption turns the suite red.
- **Navigation after login is `window.location.replace`, not `router.push`.** Next's Router Cache can
  replay a previously fetched `/calendar` payload, and on the "deep link → bounced to /login → sign
  in" path that payload *is* the redirect back to login.
- **T027's seam was closed three ways rather than noted.** `hasSessionCookie` was extracted into
  `lib/session.ts` and unit-tested, so the part that can be silently wrong is covered continuously;
  the e2e tests are written in full and **skipped**, needing only `.skip` deleted at T033; and the
  wiring was proven once with a throwaway page inside `(app)` that was then removed. See the build
  log — that probe caught a false-positive test that would otherwise have shipped into T033.
- **T028's tests run under two timezones on purpose.** In UTC, which is what the runner uses, a
  regression to `new Date(string)` or `toISOString().slice(0, 10)` is invisible.

**Checkpoint**: a creator can sign in, an unauthenticated visitor sees nothing at any address, sign-out
works even from an expired session, and the schema exists. No content feature works yet.

**Checkpoint status (2026-08-01): fully met, by test and by hand.** Automated coverage was green for
all four clauses on 2026-07-31, but the by-hand walk of quickstart V1 was blocked — `SEED_CREATOR_EMAIL`
in `.env` used the reserved `.local` TLD, `email-validator` rejected it, and the `creator` table was
empty. That is now closed: the address was changed to a real domain, `app.scripts.seed_user` ran, and
**V1 was walked in a browser** — sign-in through the proxy to FastAPI to Postgres. T033 can now build
on a session that has been proven once outside the test suite rather than only inside it.

---

## Phase 3: User Story 1 — Capture an idea before it evaporates (Priority: P1) 🎯 MVP

**Goal**: capture an idea with only a title, in under 15 seconds, and find it in the backlog later.

**Independent Test**: sign in at 375px, capture three ideas with titles only, reload, and confirm all
three appear in the backlog drawer. Delivers a usable capture inbox with no calendar grid in existence.

### Tests for User Story 1

- [x] T029 [P] [US1] Write create-and-list tests in `backend/tests/test_content_items.py` covering title-only creation, empty and whitespace-only title rejection, default status `idea`, the `scheduled=none` backlog filter, and a 409 when create is submitted with a non-`idea` status and no platform (FR-005, FR-011, INV-1, INV-2)

### Implementation for User Story 1

- [x] T030 [US1] Implement `POST /content-items` in `backend/app/api/content_items.py` with title as the only required field, validating INV-1 at the API boundary so a bad create returns 409 rather than letting the `CHECK` constraint surface as a 500 (FR-005)
- [x] T031 [US1] Implement `GET /content-items` in `backend/app/api/content_items.py` supporting the `scheduled` parameter and ordering by `created_at DESC` (FR-011, backlog ordering assumption)
- [x] T032 [US1] Implement client-side item state and optimistic updates in `frontend/lib/items.ts` — the shared hook every surface reads from, per research.md R-007
- [x] T033 [US1] Build the calendar page shell in `frontend/app/(app)/calendar/page.tsx` as a client component that loads the visible period once and holds it in state, with a bottom action bar in thumb reach (FR-022, research.md R-007). **Also carries T027's deferred half**: re-assert the session guard in this page's own data load, because App Router layouts are not re-executed on soft navigations
- [x] T034 [US1] Build the bottom-anchored capture sheet in `frontend/components/capture/CaptureSheet.tsx` with a single title field, reachable in at most 3 interactions from the landing screen (FR-005, FR-022, SC-001)
- [x] T035 [US1] Build the backlog drawer in `frontend/components/backlog/BacklogDrawer.tsx` with a collapsed peek strip and an expanded state, listing undated items newest-first, with an empty state pointing at the capture action (FR-011, research.md R-003a)

**Checkpoint**: US1 fully functional. Run quickstart V1 and V2 — this is a deployable MVP.

**Checkpoint result (2026-08-01): met.** Three gates, run in the order `.claude/memory.md` prescribes,
because each catches a class the others do not.

**1. Quickstart V1 and V2, walked at 375px against the real stack** — `docker compose up -d db backend`
plus `next dev`, a real Chromium at 375×667 with `timezoneId` pinned, and **nothing stubbed**: browser
→ Next proxy → FastAPI → Postgres, on the seeded account. 24 checks, 24 passing.

| Scenario | Result |
|---|---|
| V1 — `/`, `/calendar`, `/calendar?item=1` unauthenticated | 307 → `/login` on all three; **zero content data in any body**, re-verified with three items in the database. The `__next_error__` envelope is the framework's, and V1's "Expected" is amended in [quickstart.md](./quickstart.md) to say so |
| V1 — expired session mid-navigation | forged-`exp` cookie → the guard passes it as a routing hint, the list read 401s, `lib/api.ts` redirects to `/login`, no stale content on screen. The cookie is `httpOnly` |
| V1 — sign-out holding an expired token | `204`, cookie gone. No deadlock — T014's lenient `presented_token` doing its job over HTTP |
| V2 — capture ×3, title only | **3 interactions each; 360ms, 594ms, 570ms** against SC-001's 15s and 3-interaction budget |
| V2 — empty title | save disabled, nothing created; server-side count stays at 3 |
| V2 — what was stored | all three `idea`, no platform, no date — US1 scenario 1 exactly |
| US1 independent test | reload → all three in the drawer, count reads 3 |
| V6 (free, so taken) | `documentElement.scrollWidth === innerWidth === 375`; no horizontal body scroll |

Screenshotted at 375px in all four states. **This is the gate the suite cannot stand in for**: every
frontend test stubs the proxy because CI has no FastAPI behind it, so 143 green tests say nothing
about this seam.

**2. `reviewer` agent over T029–T035: clean.** No correctness defects, no spec drift against spec.md /
data-model.md / the contract, no work belonging to a later task, no weak assertions. One **latent**
item recorded rather than fixed: `itemsLoaded` re-prepends only rows that are still pending, so a list
read overlapping a create that has *already* reconciled would drop the reconciled row. Unreachable
today — nothing calls `reload()` and the fetch effect runs once on mount — but **T044 is the first task
that plausibly wires `reload()` to a UI action**, and it must handle it there.

> **Superseded at the Phase 4 checkpoint — read that entry before acting on this one.** Both halves of
> the prediction were wrong: T044 wires no `reload()` at all, and the fix recorded here ("merge on id")
> is now **forbidden**, because T050's `DELETE` makes absence-from-a-response the way a deletion
> arrives. The hole was closed by `savedSince` instead. Left in place as the record of what was
> believed at Phase 3; the resolution is under Phase 4 below.

**3. `/speckit-analyze`: no constitution conflicts, 44/46 requirements cited (96%).** It found the
`date_from`/`date_to`-versus-backlog conflict recorded under Phase 4 below — the one finding that would
have cost real work, and one that coverage counting alone did not produce; it came from reading the
contract against R-007. Two low-severity gaps left open deliberately: FR-012a is cited by no task (cite
it at T052) and SC-010 by none (implemented at T013/T022, unverifiable except by forced expiry).

Suites re-run at the checkpoint: **142 backend, 143 frontend, nothing skipped**; `ruff`, `mypy
--strict`, `tsc --noEmit`, `eslint` all clean.

---

## Phase 4: User Story 2 — See the plan at a glance (Priority: P2)

**Goal**: month and week views with period navigation, where every item's status and platform are
readable without opening it — in the grid *and* in the backlog drawer.

**Independent Test**: with items across statuses, platforms, and dates, open month and week views at
375px; confirm statuses survive a greyscale screenshot and the page body never scrolls horizontally.

### Tests for User Story 2

- [x] T036 [P] [US2] Extend `backend/tests/test_content_items.py` with date-range filter tests, including boundary inclusivity and the dated/undated split (FR-012, FR-013)

### Implementation for User Story 2

- [x] T037 [US2] Add `date_from` and `date_to` filtering to `GET /content-items` in `backend/app/api/content_items.py` (FR-013)
- [x] T038 [P] [US2] Implement the status and platform cue mapping in `frontend/lib/status.ts` per research.md R-005 — outline, half-filled, and solid-with-check for the three statuses, and T/I/Y monogram badges for platforms, against placeholder tokens pending the stage-2 design export
- [x] T039 [US2] Build the cue components in `frontend/components/item/StatusCue.tsx` and `frontend/components/item/PlatformCue.tsx`, consuming `lib/status.ts` (FR-017, FR-018, SC-004)
- [x] T040 [US2] Build the item chip in `frontend/components/item/ItemChip.tsx` combining title, status cue, and platform cue at a size that fits a 375px day cell
- [x] T041 [US2] Use `ItemChip` in the backlog drawer as well as the grid, so status and platform are legible in both — FR-017 covers the backlog explicitly, and a `posted` item with no date legitimately lives there
- [x] T042 [US2] Build the month grid in `frontend/components/calendar/MonthGrid.tsx` and `DayCell.tsx` as a seven-column CSS Grid from `date-fns` primitives, **spanning** the full six weeks the grid displays including adjacent-month days, with overflow shown as a remainder count that stays reachable (FR-013, FR-021, spec Edge Cases, research.md R-004). **Amended 2026-08-01 — this task no longer "queries" that span**; see the note below
- [x] T043 [US2] Build the week view in `frontend/components/calendar/WeekList.tsx` as a vertical list of seven day sections — not seven columns, which cannot hold readable chips at 375px (FR-021, research.md R-004)
- [x] T044 [US2] Build period navigation in `frontend/components/calendar/PeriodNav.tsx` with a month/week toggle and adjacent-period controls in thumb reach (FR-013, FR-022)
- [x] T045 [US2] Add the derived overdue treatment to `ItemChip`: a left border when `scheduled_date` has passed and status is not `posted`, computed client-side from `dates.today()` and never during server rendering (spec Edge Cases, research.md R-006 addendum)

**Amendment 2026-08-01 (Phase 3 checkpoint `/speckit-analyze`) — the calendar's read stays
unparameterised, and T042 does not send `date_from`/`date_to`.**

As written, T042 said the grid "queries the full six-week span". The contract defines `date_from` and
`date_to` as inclusive bounds **on `scheduled_date`**, so a ranged read returns no undated rows — and
research.md R-007 plus `frontend/AGENTS.md` both fix that the backlog drawer *narrows the already-
loaded state* and never issues a read of its own. Building T042 literally would therefore have emptied
the backlog drawer the moment the month grid arrived: a US1 regression caused by a US2 task, and one
the frontend suite would **not** have caught, because every test there stubs the proxy and a stub
returns its fixture whatever query parameters it is given.

Two artifacts disagreed and one had to be wrong. **T042 was wrong**, and it is amended above:

- The calendar surface keeps **one unparameterised `GET /content-items`** and narrows client-side —
  the grid takes the dated items falling inside its six-week span, the drawer takes the undated ones.
  That is what R-007 means by "the period is loaded once and every surface reads it", and the spec's
  Volume assumption (hundreds of items for one creator) is what makes it affordable.
- **T036 and T037 are unchanged and still required.** `date_from`/`date_to` are declared in
  `contracts/openapi.yaml`, which is stage-1 output on `main`; an endpoint that ignores its own
  contract is the drift this project exists to avoid. They ship tested, with the calendar as a caller
  that does not yet need them.
- Rejected: two reads per load (doubles the round trips and lets the two disagree — R-007 refuses it),
  and making a `scheduled_date` range include null-dated rows (which would make `scheduled=none`
  meaningless and contradict the contract's plain wording).

**T036–T037 result (2026-08-01)**: done, in **one merge request**, and that is the same stated
deviation as T029–T031 rather than a new one. `tasks.md` asks for "tests must fail first" and for one
MR per task; T036's entire subject is T037, so an MR carrying the tests alone would be red and the
merge gate refuses a red pipeline. Fail-first was satisfied in the doing: **27 tests written, 23 of
them failing against a `list_content_items` with no date parameters**, every failure because FastAPI
ignores an undeclared query parameter and returned the unfiltered list. One of the 27 was then
revised and one added once the implementation exposed what `date` actually accepts — see the third
note. Backend suite **142 → 170 passing**, nothing skipped; `ruff`, `ruff format --check`, `mypy` and
`alembic check` all clean.

Three things the task lines do not imply:

- **Four of the new tests passed before the implementation existed, and that is the point of the
  other 23.** An inclusivity assertion written as `"First day" in titles` is green against an
  endpoint with no filter at all, because an unfiltered list contains everything. Boundary
  inclusivity is therefore pinned twice — once with `in`, and once as an **exact set** that also
  fails when the filter is too wide. A suite of `in` checks alone would have shipped a no-op.
- **Two parameter combinations always return an empty array, deliberately.** `scheduled=none` with a
  date bound, and `date_from > date_to`. Both compose to a `WHERE` clause nothing satisfies, and both
  are left that way rather than refused with a 422: the contract declares these as independent
  filters with no stated interaction, so a 422 would be a response it does not carry, and no surface
  produces either query. Asserted so the choice is visible rather than incidental.
- **A date bound excludes undated items by way of SQL, not by way of a clause.** `NULL >= date` is
  `NULL`, so nothing in the endpoint looks like the line implementing FR-012's dated/undated split —
  which is exactly why it is asserted in all three bound combinations, with a control proving the
  undated item exists. Related: `date` accepts `2026-09-01T00:00:00Z` and refuses
  `2026-09-01T12:00:00Z`, a safe pair characterised rather than tightened away, and the pair of tests
  that would notice if either bound were ever retyped as a `datetime` (FR-012a).

**T038–T042 result (2026-08-01/02)**: done, one merge request each — **!15, !16, !18, !19, !20** —
each behind a green pipeline. Frontend suite **143 → 167**, nothing skipped.

The chain is deliberately linear because each task is the previous one's only consumer: the mapping
(T038) has no shape until the cues render it, the cues have no home until the chip composes them, and
the chip has no surface until the drawer and the grid draw it. Two consequences worth recording:

- **T039 and T040 shipped with no test file of their own, and that is not an omission.** There is no
  renderer in this project — `tech-defaults.md` rules out Jest and RTL at v0.1 — so a component's
  first test is the first surface that renders it. **T041 is that surface**, and its four DOM tests
  are what exercise both. The encoding underneath them was already covered by T038's nine.
- **The export draws three chip sizes, not two.** `micro` for the 50px day cell, `peek` for the
  drawer's collapsed strip, `full` for the expanded drawer and T043's week list. `CueSize` in
  `lib/status.ts` names all three so the chip and both cues cannot disagree about how many exist.

**T042's two decisions the task text does not imply:**

- **The overflow expands the cell in place.** The spec's edge case requires the remainder to be
  *reachable*, and a day sheet would be a new surface competing with T052's item sheet for the same
  gesture. Expanding downward keeps FR-021 true (the grid grows inside its own scroll container) and
  SC-002 true (no navigation). Two chips before the count, because a third pushes six rows past a
  667px screen.
- **The span is a fixed 42 days**, not the month's own length. A grid that is five rows in one month
  and six in the next moves the drawer and the action band as the creator navigates at T044 — on a
  phone that is a thumb target that will not stay still.

**The amendment above is now enforced by a test**, not only by prose: `month-grid.spec.ts` asserts
that the calendar's request URL contains no `date_from`/`date_to`. A stub answers a ranged request
with its whole fixture, so asserting the rendered result could never have caught the regression.

Verified at 375px against the real stack on port 3400 (never 3100), in colour and in greyscale: the
three statuses stay separable with every colour removed, and the body does not scroll horizontally
with a full month of dated items.

**T043–T044 result (2026-08-02)**: done, in **one merge request**, and that is a stated deviation
rather than a slip — the third of its kind, after T029–T031 and T036–T037. The rule those set is that
one MR per task yields to a task whose subject is another task's, and it applies here in a different
way: **the week list has no reachable surface until the toggle exists**, and this project's only test
tool is a browser runner. T043 alone would have merged a component that no test in the suite can
render — worse than a red pipeline, because it is green. What did *not* move into that MR is T045,
which has its own surface and its own tests.

The split that survives the merge is the one worth recording: the **span, the step and the title moved
into `lib/period.ts`**, tested directly in `tests/client/period.spec.ts` under two timezones. That is
where the calendar-boundary cases live — a month opening on a Sunday, a week straddling New Year, a
DST weekend — and they are cheap there and nearly untestable through a browser. Frontend suite
**167 → 216**, nothing skipped; `tsc --noEmit` and `eslint` both silent.

**Four things the task lines do not imply:**

- **`today` and `period` are two values, not one.** `today` is the creator's own calendar day, read
  once after mount; `period` is whatever is on screen, and they stop being equal at the first arrow
  tap. The week list marks today's section from `today` and T045's overdue treatment derives from it —
  both would be wrong against a period the creator has navigated away from.
- **Navigating issues no request, so the `reload()` hole the Phase 3 checkpoint predicted for T044 did
  not arrive here.** The amendment above is why: the calendar keeps one unparameterised read, so
  stepping to another month is pure client-side re-narrowing, and a round trip behind every arrow tap
  is what R-007 rejects. `period-nav.spec.ts` pins the request count at one across three navigations.
  **The hole was closed anyway**, because `reload()` is exported and the fix is testable without a
  caller: `itemsLoaded` now also keeps ids *this browser saved during this read*. Deliberately not a
  merge-by-id — absence from a response is how a deletion arrives (T050), so an upsert would leave a
  deleted item on screen forever.
- **The week list has no chip cap, and that is a decision rather than an omission.** `DayCell` caps at
  two because 42 cells share one screen's height; seven sections scroll inside `<main>` and have no
  such budget, so hiding an item behind `+N more` would cost reachability and buy nothing.
- **`CalendarShell` became `h-dvh` from `min-h-dvh`, and that was a live FR-022 defect, not a
  restyle.** With a minimum, the column's height is its content's, so `flex-1` on `<main>` has nothing
  to shrink against — six grid rows plus the drawer pushed the action band **below the fold**. It
  survived T042 because `calendar.spec.ts` asserts the band sits in the bottom *half* of the screen,
  which a band hanging off the bottom edge satisfies. Found by screenshot, which is the third time in
  this project that the mandatory 375px screenshot has caught something no check could.

**T045 result (2026-08-02)**: done, its own merge request. Frontend suite **216 → 234**, nothing
skipped.

- **`today` reaches `ItemChip` as a prop, and that is the enforcement rather than a convention.**
  `isOverdue(item, null)` is false, and `null` is what every server render has — so the hydration flip
  research.md R-006's addendum describes is unrepresentable rather than merely avoided. The pair of
  tests at the bottom of `overdue.spec.ts` is what proves the value came from the *browser*: the same
  instant and the same fixture in UTC+7 and UTC-7 give two different answers, which only a
  client-side clock can produce.
- **`border-l-dashed` is not a Tailwind utility** — border style has no per-side variant — so this is
  the project's one arbitrary property, `[border-left-style:dashed]`. A misspelled class renders
  nothing and fails no other check, so the test asserts the **computed** style, and asserts the top
  border is still solid: dashing all four sides is how the export draws the *drag ghost* at T054, and
  the two treatments must not collapse into each other.
- **The header's `N overdue` arrived with the treatment**, as `CalendarShell` promised at T033.
  `countOverdue` counts every loaded item rather than the visible period's, because an overdue item
  two months back is precisely the one the creator has lost track of. Zero prints nothing.

**Checkpoint**: US1 and US2 both work independently. Run quickstart V3 and V6.

**Note for whoever runs that checkpoint**: V3 asks for three dated items, one per status — and no
surface can set a date or a status until T052 and T054, which are Phase 5. Create the fixtures with
`POST /content-items`, which accepts every field including `status`, `platform` and `scheduled_date`.
This is a property of the phase order, not a blocker.

**T043–T045 result (2026-08-02)**: done. T043 and T044 landed in **one merge request, !22** — the same
stated deviation as T029–T031 and T036–T037, and for the same reason: a week list with no way to reach
another week is half a feature, and `PeriodNav` is what makes `WeekList` reachable at all. T045 landed
alone in **!23**. Frontend suite **167 → 234**, nothing skipped. `lib/period.ts` is new, with
`tests/client/period.spec.ts` enumerating calendar boundaries under two timezones.

**Checkpoint result (2026-08-02): met.** All three gates, same order as Phase 3.

**1. Quickstart V3 and V6, walked at 375px against the real stack** — 21 checks, 21 passing, nothing
stubbed: browser → Next **production** proxy → FastAPI → Postgres, on the seeded account, with 16
fixture items created through `POST /content-items` per the note above.

| Scenario | Result |
|---|---|
| V3 — three statuses in a month cell, **greyscale** | all three distinguishable at `micro`: outline, half-filled, solid-with-check. Colour removed entirely — SC-004 holds on shape and fill alone |
| V3 — three statuses in the week list, greyscale | all three distinguishable at `full`, where the chip also carries its title |
| V3 — overdue against each status | dashed **left** border reads as a condition on the chip, not as a fourth status; an overdue `idea` and an overdue `draft` still tell apart |
| V6 — `/calendar`, month view | `documentElement.scrollWidth === innerWidth === 375` |
| V6 — week view, drawer peek, drawer expanded, capture sheet open | 375 in every state; the grid scrolls inside `<main>`, the body does not |
| V6 — action band reachable | band within the bottom half in all states — the `h-dvh` fix at T044 is what makes this true |

**The walk had to use a production build, and that is a finding rather than a preference.** Next's dev
overlay (the "N" button, bottom-left) sits over the `MONTH` toggle at 375px and swallows the click, so
the month/week toggle is untappable under `next dev` and only under `next dev`. CI runs the production
bundle, so this was never going to appear in the suite. Recorded in `frontend/AGENTS.md`; the walk
needs `API_BASE_URL` and `SESSION_COOKIE_SECURE=false` alongside `pnpm build && pnpm start`.

**2. `reviewer` agent over T036–T045: clean.** No correctness defects, no spec drift, no work
belonging to a later task, no weak assertions. The `itemsLoaded` hole the Phase 3 pass recorded is
**closed** — `savedSince` — though not by the task that was predicted to close it: T044 turned out not
to call `reload()` at all, because navigating a period issues no request. One coverage gap recorded
and fixed here (see F6 below).

**3. `/speckit-analyze`: 46 requirements, 76 tasks, one CRITICAL.** The critical finding was a **live
constitution IV violation**, and it is the reason this checkpoint carries a merge request of its own.

**Findings, all fixed in this merge request:**

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | **CRITICAL** | `contracts/openapi.yaml` still said *"Calendar reads pass a date range; the backlog read passes scheduled=none"* — the exact sentence the Phase 3 amendment overturned. The contract also **contradicted itself** four lines below, where the `scheduled` parameter already described the calendar's read correctly | Sentence replaced with what is actually true and why. **`specs/` outranks code, so a stale spec is the dangerous direction**: T061's platform filter reads that same paragraph, which is how the amendment would have been undone by a task doing as it was told |
| F2 | HIGH | `research.md` R-007 said the list *"for the visible period"* is fetched once — reads as one request per period | Reworded to "once, unparameterised", with an amendment note carrying the reason (a ranged read returns no undated rows and empties the backlog) |
| F3 | MEDIUM | `plan.md` named `CalendarSurface`; the component is `CalendarShell`. The last occurrence of the old name anywhere in the repo | Renamed. `plan.md` is what a later module's plan derives from |
| F4 | MEDIUM | `plan.md` listed 5 of the 8 `lib/` modules — `session.ts` missing since T022, plus `period.ts` and `utils.ts` | All three added; the listing now matches `frontend/lib/` exactly |
| F5 | LOW | 8 of 46 requirements cited by no task **by id** — FR-003, FR-006, FR-007, FR-008, FR-010, FR-010a, FR-014, FR-015. All eight are **built**; each was covered through a sub-requirement, an invariant, or an artifact | Cited at their real homes rather than all at T052: FR-003 at T015 and T019, FR-007/FR-010/FR-010a at T010, and FR-006/007/008/014/015 at T052 with FR-014 also at T054. **A citation added where the requirement is not actually implemented would make the next coverage count lie** |
| F6 | LOW | `tests/test_errors.py` `REACHABLE_4XX` had no entry for the `date_from`/`date_to` 422. `backend/AGENTS.md` requires every 4xx in **both** places; the route test asserted the status alone, never the `{detail}` shape | Two entries added, one per bound. They are the first 4xx reachable through a **query parameter**, which goes through the same `RequestValidationError` handler that flattens `detail` from array to string |

Suites re-run at the checkpoint: **172 backend** (170 + F6's two), **234 frontend**, nothing skipped;
`ruff`, `ruff format --check`, `mypy`, `tsc --noEmit`, `eslint` all clean.

---

## Phase 5: User Story 3 — Advance an item without leaving the calendar (Priority: P3)

**Goal**: set every field, change date and status without leaving the surface, and delete safely. Date
changes work by tap *and* by drag; status changes work by tap.

**Independent Test**: take an undated idea to `posted` using taps only, then reschedule a dated item by
dragging, and confirm zero route changes throughout.

### Tests for User Story 3

- [x] T046 [P] [US3] Write `backend/tests/test_transitions.py` covering INV-1 in both directions — advancing past `idea` without a platform returns 409 `platform_required`, clearing the platform of a non-`idea` item returns 409 `platform_locked` (FR-009, FR-009a)
- [x] T047 [P] [US3] Extend `backend/tests/test_transitions.py` with a lossless-reversal test: set every field, walk `posted → draft → idea`, and assert platform and published link both survive (FR-008a, FR-019a, INV-3)
- [x] T048 [P] [US3] Extend `backend/tests/test_content_items.py` with partial-update semantics — omitted fields untouched, explicit null clears, last-write-wins with no version check, and an over-length or non-http published link rejected with 422 (FR-023, FR-023a)

### Implementation for User Story 3

- [x] T049 [US3] Implement `GET /content-items/{id}` and `PATCH /content-items/{id}` in `backend/app/api/content_items.py` with partial-update semantics and the 409 invariant responses from the contract
- [x] T050 [US3] Implement `DELETE /content-items/{id}` in `backend/app/api/content_items.py` as a hard delete (FR-004)

**T046–T049 result (2026-08-02)**: done, in **one merge request**, and this is the fourth instance of
the same stated deviation (after T029–T031, T036–T037, T043–T044) rather than a new one. All three
test tasks name `PATCH` as their subject, so an MR carrying any of them alone would be red and the
merge gate refuses a red pipeline. **Fail-first was satisfied in the doing: 19 tests written, 19
failures** against a codebase with no by-id route at all. Backend suite **172 → 228**, nothing
skipped; `ruff`, `ruff format --check` and `mypy` clean.

Four things the task lines do not imply:

- **INV-1 stayed one condition with two messages.** `check_invariant_1` gained a keyword argument
  that chooses between `platform_required` and `platform_locked`; it did **not** gain a second `if`.
  The stored predicate cannot tell the two approaches apart and should not — both leave the row in
  the same forbidden state, and what differs is only the creator's next step. Written as two checks,
  the pair would be free to disagree about what "past `idea`" means. `backend/AGENTS.md` called this
  out before the task started, and `test_the_two_invariant_codes_are_not_interchangeable` is what
  keeps the distinction real: every other 409 test in the suite passes if both codes collapse to one.
- **The invariant is evaluated against the item as it *would be*, before anything is assigned.** Two
  consequences the contract implies but never states: advancing and setting a platform in one request
  is legal, and so is moving back to `idea` while clearing the platform. Evaluated against the
  *stored* item instead, a title-only idea would have no single request that could advance it and the
  creator would alternate between two 409s — with the `platform_locked` message describing a
  two-request dance the API forced rather than a choice. Checking before assignment is also what makes
  a refusal leave the row untouched, asserted by re-reading over HTTP rather than by trusting the
  response body.
- **`exclude_unset=True` is the whole of the partial-update contract, and INV-3 needs no code.**
  Pydantic reports an omitted field and an explicit `null` both as `None`; only `model_fields_set`
  separates them. Because nothing in `PATCH` touches a field the caller did not name, "a backward
  status change clears nothing" (FR-008a, FR-019a) falls out rather than being implemented — which is
  exactly why `test_transitions.py` asserts it exhaustively, comparing the whole item at each step.
  An implementation reading `model_dump()` would turn every update into a full replacement and would
  pass any test whose request happened to name every field.
- **The contract's `minProperties: 1` is enforced, so an empty body is 422 rather than a no-op 200.**
  A `PATCH` that changed nothing and answered 200 is indistinguishable from one that worked, so a
  frontend bug that dropped its payload would look like a successful save — and under optimistic
  updates (R-007) the creator would watch the change stick on screen and vanish on the next load.
  Registered in `REACHABLE_4XX` alongside the two new 404s, per `backend/AGENTS.md`'s both-places rule.

**T050 result (2026-08-02)**: done, its own merge request — the phase's test tasks all named `PATCH`
as their subject, so `DELETE` carried its own tests and an MR containing them alone would have been
red. **10 tests written, 8 red before the route existed**; the other two are pins that cannot fail
first (an id is not reused, a second delete 404s) and both were tightened to assert the 204 rather
than pass vacuously against a 405. Backend suite **228 → 238**, nothing skipped; `ruff`,
`ruff format --check` and `mypy` clean. Three decisions the one-line task does not imply:

- **The hard-delete claim is asserted below the API, not through it.** `test_delete_removes_the_row_
  from_the_database` reads the row back through the session. Every other assertion in the section is
  green against a soft delete implemented as a filter on the list read — which would then hand the
  item straight back through `GET /content-items/{id}`, a route with no filter to add. The schema
  makes a soft delete impossible anyway (no `deleted_at`, no flag, and `data-model.md` lists neither),
  so writing one would be a spec amendment wearing an implementation costume.
- **A missing id is 404, not an idempotent 204.** 204 both times is defensible HTTP and was rejected:
  it would tell T056 its delete succeeded when the row had already been destroyed elsewhere. The
  contract declares 404 for a missing id with no exception for this verb, and the frontend is the
  right place to decide the 404 is benign — it is recovering a screen, not a transaction.
- **The unauthenticated case is aimed at an id that does not exist**, so it pins that 401 wins over
  404. The other order lets an unauthenticated caller enumerate which ids are real by reading the
  status code. Both the 401 and the 404 are registered in `REACHABLE_4XX`, per the both-places rule.

FR-020's confirmation is **not** here and is not missing: it is a placement and gesture problem
(`design.md` — never one tap from a common gesture), so it belongs to T056's dialog. An API-side
second step would not make an accidental tap less accidental.
- [X] T051 [US3] Extend `frontend/lib/api.ts` with the fetch-one, update, and delete operations, wiring update through the optimistic path in `lib/items.ts` with rollback on failure (research.md R-007)
- [X] T052 [US3] Build the item sheet in `frontend/components/item/ItemSheet.tsx` as the single editing surface, carrying controls for **title, hook, platform, date, and status** — this is what FR-006a requires and what the first draft of this plan omitted entirely, leaving every item stuck in `idea` forever. This sheet is also where the parent requirements land: it is the only surface carrying all six fields (FR-006), the only one offering the three statuses in both directions (FR-007, FR-008), the only single-select platform control (FR-010, FR-010a), and the **tap** half of changing a date and a status without a separate detail page (FR-014, FR-015). Skip rows with `isPending` — the id does not exist yet
- [X] T053 [US3] Surface the 409 invariant errors in `ItemSheet` as the contract's `detail` message, with the platform control adjacent so a refusal is resolvable without leaving the sheet (FR-009, FR-009a, SC-012)
- [ ] T054 [US3] Build the drag path for scheduling with `@dnd-kit/core` in `frontend/components/calendar/`, registering `PointerSensor` and `KeyboardSensor`, with day cells and the backlog drawer as the only drop targets, all calling the same `updateItem` (FR-014, FR-014a, research.md R-003) — the **drag** half of FR-014, whose tap half is T052; "both produce an identical result" is only assertable because both call `updateItem`. Skip rows with `isPending`. Restore the full drawer copy — "Undated ideas, newest first. Drag one onto a day to schedule it." — which T035 trimmed because the drag did not exist yet. The drag ghost is a dashed border on **all four sides**; overdue is dashed on the **left only**, and `overdue.spec.ts` asserts `borderTopStyle === "solid"` to keep the two treatments apart
- [ ] T055 [US3] Configure the `PointerSensor` activation constraint and `touch-action` on chips so a vertical scroll of the month grid cannot be captured as a drag and silently reschedule an item (research.md R-003)
- [ ] T056 [US3] Build the delete confirmation in `frontend/components/item/DeleteConfirm.tsx`, placed so no single tap and no common navigation gesture can trigger deletion, and recovering cleanly when the item is already gone (FR-020, SC-007, spec Edge Cases)
- [ ] T057 [US3] Write the one Playwright E2E flow in `frontend/tests/e2e/pipeline.spec.ts`: capture an idea, assign a platform, set a date, advance to `posted`, and verify it on the calendar — driven through the tap path for determinism (research.md R-003)
- [ ] T058 [US3] Add two assertions to `frontend/tests/e2e/pipeline.spec.ts`: the journey completes with no drag gesture, and the URL never changes throughout (FR-015b, SC-002, SC-011)

**Checkpoint**: the pipeline works end to end. Run quickstart V4, V5, V7, V8, and V9.

**V8 added 2026-07-31** by the Phase 2 `/speckit-analyze` pass. SC-009 and FR-023 — "every change
made in the previous session is still present after a reload" — were validated by **no checkpoint at
all**, only by T072 at the very end of Polish. This is the phase that introduces editing every field,
so a persistence regression born here would otherwise have surfaced after every user story was
already called done.

---

## Phase 6: User Story 4 — Focus on one platform (Priority: P4)

**Goal**: narrow the grid and the backlog drawer to a single platform.

**Independent Test**: with items across all three platforms, filter to each in turn, confirm only
matching items are visible in both the grid and the drawer and that unplatformed items are hidden,
then clear and confirm all return.

### Tests for User Story 4

- [ ] T059 [P] [US4] Extend `backend/tests/test_content_items.py` with platform-filter tests, including that items with a null platform are excluded when the filter is set (FR-016, US4 scenario 4)

### Implementation for User Story 4

- [ ] T060 [US4] Add the `platform` query parameter to `GET /content-items` in `backend/app/api/content_items.py` (FR-016)
- [ ] T061 [US4] Build the platform filter in `frontend/components/item/PlatformFilter.tsx` as local state narrowing the already-loaded period, applied to the grid and the backlog drawer alike, within thumb reach (FR-016, FR-022, SC-005, research.md R-007)
- [ ] T062 [US4] Add the filtered empty state to both the grid and the drawer, naming the active filter rather than showing a blank screen (spec Edge Cases)

**Checkpoint**: all of US1–US4 work independently.

---

## Phase 7: User Story 5 — Close the loop after posting (Priority: P5)

**Goal**: record a link to the published post and have it survive everything.

**Independent Test**: move an item to `posted`, paste a link, reload, and confirm the link persists and
opens the live post.

### Tests for User Story 5

- [ ] T063 [P] [US5] Extend `backend/tests/test_content_items.py` with published-link tests: a `posted` item is valid without a link, a `javascript:` or `data:` URL is rejected, an over-length URL is rejected, and a valid http link round-trips (FR-019)

### Implementation for User Story 5

- [ ] T064 [US5] Add the published-link field to `frontend/components/item/ItemSheet.tsx`, prompted on the move to `posted` but never required (FR-019)
- [ ] T065 [US5] Surface the link from the grid and drawer on `posted` items as an external control carrying `rel="noopener noreferrer"`, so the calendar URL does not leak as a `Referer` to the platform (US5 scenario 3, constitution II)
- [ ] T066 [US5] Ensure a rejected malformed link does not discard the accompanying status change, keeping the two edits independent (spec Edge Cases)

**Checkpoint**: every user story is complete and independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: what constitution principle V says may *not* be deferred, plus shipping.

- [ ] T067 [P] Add visible focus states to every interactive element in `frontend/components/` — structural under constitution principle V, not decoration
- [ ] T068 [P] Add the first-run empty state for an account with zero items to `frontend/app/(app)/calendar/page.tsx` and the backlog drawer (spec Edge Cases)
- [ ] T069 Audit the three routes and three overlay surfaces under `frontend/app/` at 375px for horizontal body scroll and fix any that scroll (FR-021, SC-003)
- [ ] T070 Handle a stale item acted on from another device in `frontend/lib/items.ts` — a 404 on update or delete removes it from local state and reports it, without leaving a phantom chip on the grid (FR-023a, spec Edge Cases)
- [ ] T071 [P] Configure Render deployment for `backend/` and Vercel deployment for `frontend/`, with the proxy target and cookie domain set per research.md R-001
- [ ] T072 Run every quickstart scenario V1–V9 against the deployed environment and record the results, measuring the first load of the day against SC-001 to see whether Render's spin-down is a real problem (quickstart.md, research.md Open items)
- [ ] T073 [P] Write `frontend/README.md` and `backend/README.md` covering the commands in quickstart.md
- [ ] T074 Re-run `/speckit-analyze` and a `reviewer` pass to catch spec drift introduced during implementation, then tag v0.1 and write `CHANGELOG.md` (workflow.md stages 6 and 7)
- [ ] T075 Amend the Auth row of `.claude/rules/tech-defaults.md` to permit sliding reissue explicitly, via `/speckit-constitution` if the constitution is touched — this is the Reflect-stage amendment research.md R-002 defers (constitution IV)
- [ ] T076 Write `docs/retro-01.md` comparing shipped behaviour against every acceptance criterion in spec.md, item by item, and recording two process facts: that a reviewer pass caught six blocking design gaps a coverage-based `/speckit-analyze` did not, and the **full extent of the constitution VI exception** — how many merges reached `main` ungated, over which task range, and at which task the protected-`main` gate became real. The exception was originally recorded as a single spec fast-forward and had grown to 17 merges by T016; reporting only the fast-forward would understate it (workflow.md stage 8)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.**
- **User Stories (Phases 3–7)**: all depend on Foundational, then run in priority order.
- **Polish (Phase 8)**: depends on the stories being shipped, except T071 which can be prepared early.

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on any other story. Note that T032 and T033 establish the
  client-state pattern every later surface reads from, so they are load-bearing beyond US1.
- **US2 (P2)**: after US1 — the grid renders into the page shell T033 creates.
- **US3 (P3)**: after US2. Its drag targets are US2's day cells and US1's drawer. The tap path (T052)
  is testable against the drawer alone if US2 slips.
- **US4 (P4)**: after US2, since it filters what the grid and drawer display.
- **US5 (P5)**: after T052 for the UI — the link field lives in the same sheet.

### Within Each User Story

- Tests are written before the implementation they cover, and must fail first.
- Models before endpoints; endpoints before the UI that calls them.
- Story complete and checkpoint-validated before starting the next priority.

### Parallel Opportunities

- T003–T006 in Phase 1.
- T008 and T009; then T015, T018, T019, T020 once the schema and app exist; then T021 and T028.
- Every `[P]`-marked test task within a story phase.
- T038 is independent of the backend work in Phase 4 and can be done alongside T037.

---

## Parallel Example: Phase 2 Foundational

```bash
# After T010, T011, and T016 land, these four touch disjoint files:
Task: "Write the single-account seed script in backend/app/scripts/seed_user.py"
Task: "Write backend/tests/test_auth.py covering login and token failure modes"
Task: "Write backend/tests/test_schema.py asserting no owner or version column"
Task: "Write backend/tests/test_errors.py asserting the uniform error shape"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup.
2. Phase 2 Foundational — the long pole, and it blocks everything.
3. Phase 3 US1.
4. **Stop and validate**: quickstart V1 and V2.
5. Deploy. A capture inbox in production beats a calendar on localhost — constitution principle V.

### Incremental delivery

Phase 2 → US1 (deploy) → US2 (deploy) → US3 (deploy) → US4 → US5 → Polish. Each story adds value
without breaking the previous one.

The natural stopping point if time runs short is after US3: capture, see, and advance is the whole
pipeline. US4 and US5 are convenience and record-keeping.

### Solo strategy

This project is one developer. The parallel markers indicate tasks that will not conflict in the same
file — useful for batching within a session — not a staffing plan. One merge request per task still
applies, and the merge gate still applies to your own merge requests (constitution VI).

---

## Post-review revisions

A `reviewer` pass over the stage-1 artifacts found six blocking issues. All are closed above. Recorded
here because the *reason* a task exists is easy to lose, and three of these are load-bearing.

| Was wrong | Now |
|---|---|
| **No task built a platform-assignment control.** FR-009 makes a platform a precondition for leaving `idea`, so every item would have been permanently stuck and the E2E flow itself unrunnable. No task edited `title` or `hook` either. | T052 makes the item sheet the single editing surface for every field. Spec gained FR-006a and SC-012 so this is citable rather than implied. |
| **Drag from backlog to a calendar day was impossible** — the two were separate routes and a DOM node cannot cross routes. SC-008 was unreachable, not merely untested. | The backlog is a drawer on the calendar surface (T035, research.md R-003a). One content route. `/backlog` deleted. |
| **"Status lanes" existed only in prose.** No component, no screen, no task — and no 375px layout could hold them beside a month grid without violating FR-021. | FR-015a narrowed to tap-only for status; drag keeps scheduling (T054). Adding lanes would have been a second core capability, which constitution III forbids. |
| **Sliding reissue had no transport.** The contract returned a token only from login, and R-001 forbids FastAPI touching cookies, so nothing could ever renew a session. SC-010 would have failed on day 30. | T013 attaches `X-Access-Token`; T022 rewrites the cookie with a fresh `Max-Age` and strips the header. |
| **Invariant violations returned 500.** `POST /content-items` accepted `status` and `platform` but declared no 409, so a bad create hit the `CHECK` constraint and surfaced a Postgres error. Same for over-length URLs. `ValidationError` was also typed as a string where FastAPI returns an array. | T030 validates at the boundary; T016 installs the error handler; T020 asserts the uniform shape; the contract now declares 409 on create and bounds `published_url`. |
| **No data-fetching or cache strategy existed anywhere.** T038 and T061 would each have invented one in separate merge requests, and a server round trip per filter toggle endangered SC-005 and SC-001 on Render's free tier. | research.md R-007: client components, local state, optimistic updates, client-side filtering. T032 establishes it once. |

Also closed from the same pass: no root route (T026), Playwright never installed (T003, T006), 401
never handled (T024), logout deadlocking on an expired token (T014), the proxy being an unbounded
credential relay (T021, T022), the `today` hydration flip (T028, T045), the touch-scroll drag conflict
(T055), `javascript:` URLs and `Referer` leakage (T063, T065), and the missing six-week grid query span
(T042).

**Process note for the retro**: `/speckit-analyze` reported 95% requirement coverage on the version of
this file that contained all six blockers. Coverage counts whether a requirement is *cited* by a task,
not whether the tasks *close*. Both checks are needed, which is why T074 runs the reviewer pass as well.

---

## Notes

- `[P]` means different files with no dependency on incomplete work.
- `[Story]` labels map tasks to spec.md user stories for traceability.
- Verify tests fail before implementing.
- Stop at any checkpoint to validate a story independently.
- **The merge gate is real as of T025** (2026-07-31). `main` is protected with push access set to
  **no one** and `only_allow_merge_if_pipeline_succeeds` is `true`, so constitution principle VI is
  satisfied from T025 onward — every task from here arrives by merge request behind a green
  pipeline. T001–T024 remain a knowing exception, and `T076` records its range. The note that
  previously stood here said no remote and no `glab` existed; both do.
- **Closed 2026-08-01**: the single creator account is seeded and **quickstart V1 has been walked by
  a human** — the project's oldest open item, open since T022. The `.local` TLD in
  `SEED_CREATOR_EMAIL` was the cause. See [quickstart.md](./quickstart.md) Outstanding setup, where
  the remaining item is the GitLab issue import.
