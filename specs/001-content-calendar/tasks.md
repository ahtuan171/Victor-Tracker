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
- [x] T010 Define `Creator`, `ContentItem`, and the `Status` and `Platform` enums in `backend/app/models.py`, exactly matching the column table in [data-model.md](./data-model.md) — no owner column, no version column
- [x] T011 Initialise Alembic and generate the first migration under `backend/alembic/versions/`, adding the INV-1 and INV-2 `CHECK` constraints and the three indexes from data-model.md by hand, and writing the enum `CREATE TYPE`/`DROP TYPE` explicitly since autogenerate handles them asymmetrically on downgrade
- [x] T012 Implement password verification and token issue/decode in `backend/app/auth.py`, with a 30-day lifetime
- [x] T013 Implement the `current_creator` dependency in `backend/app/auth.py`, attaching an `X-Access-Token` response header when the presented token is past half-life (research.md R-002 — without this header sliding reissue has no transport)
- [x] T014 Implement `POST /auth/login` and `POST /auth/logout` in `backend/app/api/auth.py`, with logout succeeding even when the presented token is already expired so sign-out cannot deadlock
- [x] T015 [P] Write the single-account seed script in `backend/app/scripts/seed_user.py`, reading credentials from the environment
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

- [ ] T017 Build the pytest harness in `backend/tests/conftest.py` with a dedicated test database, a transactional-rollback fixture, an anonymous client, and an authenticated client
- [ ] T018 [P] Write `backend/tests/test_auth.py` covering login success, wrong password, absent token, malformed token, expired token, logout with an expired token, and the presence of `X-Access-Token` past half-life (FR-001, FR-002, FR-002a)
- [ ] T019 [P] Write `backend/tests/test_schema.py` asserting `content_item` has no column matching `%user%`, `%owner%`, `%tenant%`, or `%version%` (INV-4, constitution VII)
- [ ] T020 [P] Write `backend/tests/test_errors.py` asserting every 4xx response body matches the contract's `{"detail": "<string>"}` shape, including a validation failure that would otherwise return an array

### Frontend foundation

- [ ] T021 Define the proxy path and method allowlist in `frontend/lib/proxy-allowlist.ts`, derived from the contract, with a test asserting the two stay in sync (research.md R-008)
- [ ] T022 Implement the server-side proxy at `frontend/app/api/[...path]/route.ts`: reject anything off the allowlist with 404, attach the token from the session cookie, and on seeing `X-Access-Token` rewrite the cookie with a fresh `Max-Age` and strip the header before responding (research.md R-001, R-002)
- [ ] T023 Generate the typed API client in `frontend/lib/api.ts` for login, logout, list, and create only — the remaining operations arrive with the stories that call them
- [ ] T024 Add a single 401 handler to `frontend/lib/api.ts` that clears the session cookie and redirects to `/login`, so an expired session cannot leave content data on screen (spec Edge Cases, FR-002)
- [ ] T025 Build the login page in `frontend/app/login/page.tsx`, setting the session cookie through the proxy on success
- [ ] T026 Build the root route in `frontend/app/page.tsx` as a server-side redirect to `/calendar` when a session cookie is present and `/login` otherwise, so the bookmarked root does not 404 (SC-001, US1 scenario 1)
- [ ] T027 Add the session guard to `frontend/app/(app)/layout.tsx` as a server component, and re-assert it in the calendar page's own data load — App Router layouts are not re-executed on soft navigations, so the layout alone is not sufficient (FR-002, SC-006)
- [ ] T028 [P] Implement date-only helpers in `frontend/lib/dates.ts`, parsing and formatting `YYYY-MM-DD` without ever constructing a `Date` from a bare date string, and exposing `today()` for client use only (research.md R-006 and its addendum)

**Checkpoint**: a creator can sign in, an unauthenticated visitor sees nothing at any address, sign-out
works even from an expired session, and the schema exists. No content feature works yet.

---

## Phase 3: User Story 1 — Capture an idea before it evaporates (Priority: P1) 🎯 MVP

**Goal**: capture an idea with only a title, in under 15 seconds, and find it in the backlog later.

**Independent Test**: sign in at 375px, capture three ideas with titles only, reload, and confirm all
three appear in the backlog drawer. Delivers a usable capture inbox with no calendar grid in existence.

### Tests for User Story 1

- [ ] T029 [P] [US1] Write create-and-list tests in `backend/tests/test_content_items.py` covering title-only creation, empty and whitespace-only title rejection, default status `idea`, the `scheduled=none` backlog filter, and a 409 when create is submitted with a non-`idea` status and no platform (FR-005, FR-011, INV-1, INV-2)

### Implementation for User Story 1

- [ ] T030 [US1] Implement `POST /content-items` in `backend/app/api/content_items.py` with title as the only required field, validating INV-1 at the API boundary so a bad create returns 409 rather than letting the `CHECK` constraint surface as a 500 (FR-005)
- [ ] T031 [US1] Implement `GET /content-items` in `backend/app/api/content_items.py` supporting the `scheduled` parameter and ordering by `created_at DESC` (FR-011, backlog ordering assumption)
- [ ] T032 [US1] Implement client-side item state and optimistic updates in `frontend/lib/items.ts` — the shared hook every surface reads from, per research.md R-007
- [ ] T033 [US1] Build the calendar page shell in `frontend/app/(app)/calendar/page.tsx` as a client component that loads the visible period once and holds it in state, with a bottom action bar in thumb reach (FR-022, research.md R-007)
- [ ] T034 [US1] Build the bottom-anchored capture sheet in `frontend/components/capture/CaptureSheet.tsx` with a single title field, reachable in at most 3 interactions from the landing screen (FR-005, FR-022, SC-001)
- [ ] T035 [US1] Build the backlog drawer in `frontend/components/backlog/BacklogDrawer.tsx` with a collapsed peek strip and an expanded state, listing undated items newest-first, with an empty state pointing at the capture action (FR-011, research.md R-003a)

**Checkpoint**: US1 fully functional. Run quickstart V1 and V2 — this is a deployable MVP.

---

## Phase 4: User Story 2 — See the plan at a glance (Priority: P2)

**Goal**: month and week views with period navigation, where every item's status and platform are
readable without opening it — in the grid *and* in the backlog drawer.

**Independent Test**: with items across statuses, platforms, and dates, open month and week views at
375px; confirm statuses survive a greyscale screenshot and the page body never scrolls horizontally.

### Tests for User Story 2

- [ ] T036 [P] [US2] Extend `backend/tests/test_content_items.py` with date-range filter tests, including boundary inclusivity and the dated/undated split (FR-012, FR-013)

### Implementation for User Story 2

- [ ] T037 [US2] Add `date_from` and `date_to` filtering to `GET /content-items` in `backend/app/api/content_items.py` (FR-013)
- [ ] T038 [P] [US2] Implement the status and platform cue mapping in `frontend/lib/status.ts` per research.md R-005 — outline, half-filled, and solid-with-check for the three statuses, and T/I/Y monogram badges for platforms, against placeholder tokens pending the stage-2 design export
- [ ] T039 [US2] Build the cue components in `frontend/components/item/StatusCue.tsx` and `frontend/components/item/PlatformCue.tsx`, consuming `lib/status.ts` (FR-017, FR-018, SC-004)
- [ ] T040 [US2] Build the item chip in `frontend/components/item/ItemChip.tsx` combining title, status cue, and platform cue at a size that fits a 375px day cell
- [ ] T041 [US2] Use `ItemChip` in the backlog drawer as well as the grid, so status and platform are legible in both — FR-017 covers the backlog explicitly, and a `posted` item with no date legitimately lives there
- [ ] T042 [US2] Build the month grid in `frontend/components/calendar/MonthGrid.tsx` and `DayCell.tsx` as a seven-column CSS Grid from `date-fns` primitives, querying the full six-week span the grid displays including adjacent-month days, with overflow shown as a remainder count that stays reachable (FR-013, FR-021, spec Edge Cases, research.md R-004)
- [ ] T043 [US2] Build the week view in `frontend/components/calendar/WeekList.tsx` as a vertical list of seven day sections — not seven columns, which cannot hold readable chips at 375px (FR-021, research.md R-004)
- [ ] T044 [US2] Build period navigation in `frontend/components/calendar/PeriodNav.tsx` with a month/week toggle and adjacent-period controls in thumb reach (FR-013, FR-022)
- [ ] T045 [US2] Add the derived overdue treatment to `ItemChip`: a left border when `scheduled_date` has passed and status is not `posted`, computed client-side from `dates.today()` and never during server rendering (spec Edge Cases, research.md R-006 addendum)

**Checkpoint**: US1 and US2 both work independently. Run quickstart V3 and V6.

---

## Phase 5: User Story 3 — Advance an item without leaving the calendar (Priority: P3)

**Goal**: set every field, change date and status without leaving the surface, and delete safely. Date
changes work by tap *and* by drag; status changes work by tap.

**Independent Test**: take an undated idea to `posted` using taps only, then reschedule a dated item by
dragging, and confirm zero route changes throughout.

### Tests for User Story 3

- [ ] T046 [P] [US3] Write `backend/tests/test_transitions.py` covering INV-1 in both directions — advancing past `idea` without a platform returns 409 `platform_required`, clearing the platform of a non-`idea` item returns 409 `platform_locked` (FR-009, FR-009a)
- [ ] T047 [P] [US3] Extend `backend/tests/test_transitions.py` with a lossless-reversal test: set every field, walk `posted → draft → idea`, and assert platform and published link both survive (FR-008a, FR-019a, INV-3)
- [ ] T048 [P] [US3] Extend `backend/tests/test_content_items.py` with partial-update semantics — omitted fields untouched, explicit null clears, last-write-wins with no version check, and an over-length or non-http published link rejected with 422 (FR-023, FR-023a)

### Implementation for User Story 3

- [ ] T049 [US3] Implement `GET /content-items/{id}` and `PATCH /content-items/{id}` in `backend/app/api/content_items.py` with partial-update semantics and the 409 invariant responses from the contract
- [ ] T050 [US3] Implement `DELETE /content-items/{id}` in `backend/app/api/content_items.py` as a hard delete (FR-004)
- [ ] T051 [US3] Extend `frontend/lib/api.ts` with the fetch-one, update, and delete operations, wiring update through the optimistic path in `lib/items.ts` with rollback on failure (research.md R-007)
- [ ] T052 [US3] Build the item sheet in `frontend/components/item/ItemSheet.tsx` as the single editing surface, carrying controls for **title, hook, platform, date, and status** — this is what FR-006a requires and what the first draft of this plan omitted entirely, leaving every item stuck in `idea` forever
- [ ] T053 [US3] Surface the 409 invariant errors in `ItemSheet` as the contract's `detail` message, with the platform control adjacent so a refusal is resolvable without leaving the sheet (FR-009, FR-009a, SC-012)
- [ ] T054 [US3] Build the drag path for scheduling with `@dnd-kit/core` in `frontend/components/calendar/`, registering `PointerSensor` and `KeyboardSensor`, with day cells and the backlog drawer as the only drop targets, all calling the same `updateItem` (FR-014a, research.md R-003)
- [ ] T055 [US3] Configure the `PointerSensor` activation constraint and `touch-action` on chips so a vertical scroll of the month grid cannot be captured as a drag and silently reschedule an item (research.md R-003)
- [ ] T056 [US3] Build the delete confirmation in `frontend/components/item/DeleteConfirm.tsx`, placed so no single tap and no common navigation gesture can trigger deletion, and recovering cleanly when the item is already gone (FR-020, SC-007, spec Edge Cases)
- [ ] T057 [US3] Write the one Playwright E2E flow in `frontend/tests/e2e/pipeline.spec.ts`: capture an idea, assign a platform, set a date, advance to `posted`, and verify it on the calendar — driven through the tap path for determinism (research.md R-003)
- [ ] T058 [US3] Add two assertions to `frontend/tests/e2e/pipeline.spec.ts`: the journey completes with no drag gesture, and the URL never changes throughout (FR-015b, SC-002, SC-011)

**Checkpoint**: the pipeline works end to end. Run quickstart V4, V5, V7, and V9.

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
- [ ] T076 Write `docs/retro-01.md` comparing shipped behaviour against every acceptance criterion in spec.md, item by item, and recording that a reviewer pass caught six blocking design gaps that a coverage-based `/speckit-analyze` did not (workflow.md stage 8)

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
- **Blocked before Phase 8**: no git remote and no `glab` installation exist yet, so the protected
  `main` and the merge gate required by constitution principle VI are not yet real. See
  [quickstart.md](./quickstart.md) Outstanding setup. This blocks stage 3 (Load) and shipping, not
  implementation.
