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

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on incomplete work
- **[Story]**: which user story the task serves (US1–US5)
- Every task names its exact file path

## Path Conventions

Web application layout per [plan.md](./plan.md): `backend/app/`, `backend/tests/`, `frontend/app/`,
`frontend/components/`, `frontend/lib/`, `frontend/tests/`.

## Working agreement

- One merge request per task, branched from `main` as `feature/001-<task-slug>`.
- Commits reference their issue: `feat: add content item CRUD (closes #12)`.
- Each task is sized at half a day to a day. If one turns out to need two sentences to describe, it
  is two tasks — split it rather than letting it sprawl.
- No abstraction is introduced before a second caller exists.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: get both projects building, linting, and running before any feature code exists.

- [ ] T001 Create `docker-compose.yml` at repository root with Postgres, backend, and frontend services, plus `.env.example` listing every variable both apps read
- [ ] T002 Initialise the backend project in `backend/pyproject.toml` with `uv`, declaring FastAPI, SQLModel, Alembic, `psycopg`, `pyjwt`, and `passlib[bcrypt]`
- [ ] T003 [P] Initialise the frontend project in `frontend/package.json` with `pnpm`, Next.js App Router, Tailwind, and shadcn/ui, then add `@dnd-kit/core` and `date-fns`
- [ ] T004 [P] Configure `ruff` and `mypy` in `backend/pyproject.toml` with the strictness settings CI will enforce
- [ ] T005 [P] Configure `eslint` and `tsc --noEmit` in `frontend/` including the `tsconfig.json` strict flags
- [ ] T006 Create `.gitlab-ci.yml` with the four stages `build → test → review → deploy`, running `ruff`, `mypy`, `eslint`, `tsc`, `pytest`, and `playwright`, with `deploy` gated on manual approval

**Checkpoint**: both apps start, both lint clean, CI runs green on an empty suite.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the schema, the auth boundary, and the shared frontend primitives. Every user story
depends on all of it.

**⚠️ CRITICAL**: no user story work begins until this phase is complete.

### Backend foundation

- [ ] T007 [P] Implement environment-backed settings in `backend/app/config.py`, including database URL, JWT secret, and token lifetime
- [ ] T008 [P] Implement the engine and request-scoped session dependency in `backend/app/db.py`
- [ ] T009 Define `Creator`, `ContentItem`, and the `Status` and `Platform` enums in `backend/app/models.py`, exactly matching the column table in [data-model.md](./data-model.md) — no owner column, no version column
- [ ] T010 Initialise Alembic and generate the first migration under `backend/alembic/versions/`, adding the INV-1 and INV-2 `CHECK` constraints and the three indexes from data-model.md by hand — autogenerate will not produce them
- [ ] T011 Implement password verification and token issue/decode in `backend/app/auth.py`, with a 30-day lifetime and sliding reissue past half-life per [research.md](./research.md) R-002
- [ ] T012 Implement the `current_creator` dependency in `backend/app/auth.py` so that any route omitting it is visibly public
- [ ] T013 Implement `POST /auth/login` and `POST /auth/logout` in `backend/app/api/auth.py` per the contract
- [ ] T014 [P] Write the single-account seed script in `backend/app/scripts/seed_user.py`, reading credentials from the environment
- [ ] T015 Assemble the app in `backend/app/main.py` — router registration, CORS restricted to the frontend origin, and a public `GET /health`

### Backend test harness

- [ ] T016 Build the pytest harness in `backend/tests/conftest.py` with a dedicated test database, a transactional-rollback fixture, an anonymous client, and an authenticated client
- [ ] T017 [P] Write `backend/tests/test_auth.py` covering login success, wrong password, absent token, malformed token, and expired token (FR-001, FR-002, FR-002a)
- [ ] T018 [P] Write the schema-guard test in `backend/tests/test_schema.py` asserting `content_item` has no column matching `%user%`, `%owner%`, `%tenant%`, or `%version%` (INV-4, constitution VII)

### Frontend foundation

- [ ] T019 Implement the server-side proxy at `frontend/app/api/[...path]/route.ts`, forwarding to FastAPI and attaching the token from an `httpOnly; Secure; SameSite=Lax` cookie per research.md R-001
- [ ] T020 Generate the typed API client in `frontend/lib/api.ts` from [contracts/openapi.yaml](./contracts/openapi.yaml), covering all eight operations
- [ ] T021 Build the login page in `frontend/app/login/page.tsx`, setting the session cookie through the proxy on success
- [ ] T022 Add the server-side session guard to `frontend/app/(app)/layout.tsx` so an unauthenticated request redirects before any content markup is generated (FR-002, SC-006)
- [ ] T023 [P] Implement date-only helpers in `frontend/lib/dates.ts`, parsing and formatting `YYYY-MM-DD` without ever constructing a `Date` from a bare date string — research.md R-006 names this as the trap
- [ ] T024 [P] Implement the status and platform cue mapping in `frontend/lib/status.ts` per research.md R-005: outline, half-filled, and solid-with-check for the three statuses, and T/I/Y monogram badges for platforms
- [ ] T025 Build the authenticated app shell in `frontend/app/(app)/layout.tsx` with a bottom-anchored action bar, so primary actions sit in thumb reach (FR-022)

**Checkpoint**: a creator can sign in, an unauthenticated visitor sees nothing, and the schema exists.
No content feature works yet.

---

## Phase 3: User Story 1 — Capture an idea before it evaporates (Priority: P1) 🎯 MVP

**Goal**: capture an idea with only a title, in under 15 seconds, and find it in the backlog later.

**Independent Test**: sign in at 375px, capture three ideas with titles only, reload, and confirm all
three appear in the backlog. Delivers a usable capture inbox with no calendar in existence.

### Tests for User Story 1

- [ ] T026 [P] [US1] Write create-and-list tests in `backend/tests/test_content_items.py` covering title-only creation, empty and whitespace-only title rejection, default status `idea`, and the `scheduled=none` backlog filter (FR-005, FR-011, INV-2)

### Implementation for User Story 1

- [ ] T027 [US1] Implement `POST /content-items` in `backend/app/api/content_items.py` with title as the only required field (FR-005)
- [ ] T028 [US1] Implement `GET /content-items` in `backend/app/api/content_items.py` supporting the `scheduled` parameter and ordering by `created_at DESC` (FR-011, backlog ordering assumption)
- [ ] T029 [US1] Build the bottom-anchored capture sheet in `frontend/components/capture/CaptureSheet.tsx` with a single title field, reachable in at most 3 interactions from the landing screen (FR-005, FR-022, SC-001)
- [ ] T030 [US1] Build the backlog page in `frontend/app/(app)/backlog/page.tsx` listing undated items newest-first, with an empty state pointing at the capture action

**Checkpoint**: US1 fully functional. Run quickstart scenario V2 — this is a deployable MVP.

---

## Phase 4: User Story 2 — See the plan at a glance (Priority: P2)

**Goal**: month and week views with period navigation, where every item's status and platform are
readable without opening it.

**Independent Test**: with items across statuses, platforms, and dates, open month and week views at
375px; confirm statuses survive a greyscale screenshot and the page body never scrolls horizontally.

### Tests for User Story 2

- [ ] T031 [P] [US2] Extend `backend/tests/test_content_items.py` with date-range filter tests, including boundary inclusivity and the dated/undated split (FR-012, FR-013)

### Implementation for User Story 2

- [ ] T032 [US2] Add `date_from` and `date_to` filtering to `GET /content-items` in `backend/app/api/content_items.py` (FR-013)
- [ ] T033 [P] [US2] Build the status and platform cue components in `frontend/components/item/StatusCue.tsx` and `frontend/components/item/PlatformCue.tsx`, consuming `lib/status.ts` (FR-017, FR-018, SC-004)
- [ ] T034 [US2] Build the item chip in `frontend/components/item/ItemChip.tsx` combining title, status cue, and platform cue at a size that fits a 375px day cell
- [ ] T035 [US2] Build the month grid in `frontend/components/calendar/MonthGrid.tsx` and `DayCell.tsx` as a seven-column CSS Grid from `date-fns` primitives, with overflow shown as a remainder count (FR-013, FR-021, research.md R-004)
- [ ] T036 [US2] Build the week view in `frontend/components/calendar/WeekList.tsx` as a vertical list of seven day sections — not seven columns, which cannot hold readable chips at 375px (FR-021, research.md R-004)
- [ ] T037 [US2] Build period navigation in `frontend/components/calendar/PeriodNav.tsx` with a month/week toggle and adjacent-period controls in thumb reach (FR-013, FR-022)
- [ ] T038 [US2] Assemble the calendar page in `frontend/app/(app)/calendar/page.tsx`, wiring period state to the date-range query
- [ ] T039 [US2] Add the derived overdue treatment to `ItemChip`: a left border when `scheduled_date` has passed and status is not `posted`, computed at render time and never stored (spec Edge Cases, data-model.md state transitions)

**Checkpoint**: US1 and US2 both work independently. Run quickstart scenarios V3 and V6.

---

## Phase 5: User Story 3 — Advance an item without leaving the calendar (Priority: P3)

**Goal**: change date and status from the calendar and backlog, by tap *and* by drag, with the
invariants holding and deletion requiring confirmation.

**Independent Test**: take an undated idea to `posted` using taps only, then repeat with drags only,
and confirm identical end states with zero navigations to a separate page.

### Tests for User Story 3

- [ ] T040 [P] [US3] Write `backend/tests/test_transitions.py` covering INV-1 in both directions — advancing past `idea` without a platform returns 409 `platform_required`, clearing the platform of a non-`idea` item returns 409 `platform_locked` (FR-009, FR-009a)
- [ ] T041 [P] [US3] Extend `backend/tests/test_transitions.py` with a lossless-reversal test: set every field, walk `posted → draft → idea`, and assert platform and published link both survive (FR-008a, FR-019a, INV-3)
- [ ] T042 [P] [US3] Extend `backend/tests/test_content_items.py` with partial-update semantics — omitted fields untouched, explicit null clears, and last-write-wins with no version check (FR-023, FR-023a)

### Implementation for User Story 3

- [ ] T043 [US3] Implement `GET /content-items/{id}` and `PATCH /content-items/{id}` in `backend/app/api/content_items.py` with partial-update semantics and the 409 invariant responses from the contract
- [ ] T044 [US3] Implement `DELETE /content-items/{id}` in `backend/app/api/content_items.py` as a hard delete (FR-004)
- [ ] T045 [US3] Build the tap path in `frontend/components/item/ItemSheet.tsx` — a bottom sheet with a date control and a status control, both issuing one `PATCH` (FR-014a, FR-015a, FR-022)
- [ ] T046 [US3] Surface the 409 invariant errors in `ItemSheet` as the contract's `detail` message, so a refused platform change explains itself rather than failing silently (FR-009, FR-009a)
- [ ] T047 [US3] Build the drag path with `@dnd-kit/core` in `frontend/components/calendar/`, registering both `PointerSensor` and `KeyboardSensor`, with day cells and status lanes as drop targets calling the same `updateItem` (FR-014a, FR-015a, FR-015b, research.md R-003)
- [ ] T048 [US3] Build the delete confirmation in `frontend/components/item/DeleteConfirm.tsx`, placed so no single tap and no common navigation gesture can trigger deletion (FR-020, SC-007)
- [ ] T049 [US3] Write the one Playwright E2E flow in `frontend/tests/e2e/pipeline.spec.ts`: capture an idea, set a date and platform, advance to `posted`, and verify it on the calendar — driven through the tap path for determinism (research.md R-003)
- [ ] T050 [US3] Add a keyboard-only assertion to `frontend/tests/e2e/pipeline.spec.ts` proving the full journey completes with no drag gesture (FR-015b, SC-011)

**Checkpoint**: the pipeline works end to end. Run quickstart scenarios V4, V5, and V7.

---

## Phase 6: User Story 4 — Focus on one platform (Priority: P4)

**Goal**: narrow the calendar and backlog to a single platform.

**Independent Test**: with items across all three platforms, filter to each in turn, confirm only
matching items are visible and that unplatformed items are hidden, then clear and confirm all return.

### Tests for User Story 4

- [ ] T051 [P] [US4] Extend `backend/tests/test_content_items.py` with platform-filter tests, including that items with a null platform are excluded when the filter is set (FR-016, US4 scenario 4)

### Implementation for User Story 4

- [ ] T052 [US4] Add the `platform` query parameter to `GET /content-items` in `backend/app/api/content_items.py` (FR-016)
- [ ] T053 [US4] Build the platform filter control in `frontend/components/calendar/PlatformFilter.tsx`, within thumb reach and applying without a full page reload (FR-016, FR-022, SC-005)
- [ ] T054 [US4] Add the filtered empty state to the calendar and backlog, naming the active filter rather than showing a blank screen (spec Edge Cases)

**Checkpoint**: all of US1–US4 work independently.

---

## Phase 7: User Story 5 — Close the loop after posting (Priority: P5)

**Goal**: record a link to the published post and have it survive everything.

**Independent Test**: move an item to `posted`, paste a link, reload, and confirm the link persists
and opens the live post.

### Tests for User Story 5

- [ ] T055 [P] [US5] Extend `backend/tests/test_content_items.py` with published-link tests: a `posted` item is valid without a link, a malformed link is rejected with 422, and a valid link round-trips (FR-019, spec Edge Cases)

### Implementation for User Story 5

- [ ] T056 [US5] Add the published-link field to `frontend/components/item/ItemSheet.tsx`, prompted on the move to `posted` but never required (FR-019)
- [ ] T057 [US5] Surface the link from the calendar and backlog as an external-opening control on `posted` items (US5 scenario 3)
- [ ] T058 [US5] Ensure a rejected malformed link does not discard the accompanying status change, keeping the two edits independent (spec Edge Cases)

**Checkpoint**: every user story is complete and independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: what constitution principle V says may *not* be deferred, plus shipping.

- [ ] T059 [P] Add visible focus states to every interactive element in `frontend/components/` — structural under constitution principle V, not decoration
- [ ] T060 [P] Add the first-run empty state for an account with zero items to `frontend/app/(app)/calendar/page.tsx` and `frontend/app/(app)/backlog/page.tsx` (spec Edge Cases)
- [ ] T061 Audit all six screens under `frontend/app/` at 375px for horizontal body scroll and fix any that scroll (FR-021, SC-003)
- [ ] T062 [P] Configure Render deployment for `backend/` and Vercel deployment for `frontend/`, with the proxy target and cookie domain set per research.md R-001
- [ ] T063 Run every quickstart scenario V1–V8 against the deployed environment and record the results (quickstart.md)
- [ ] T064 [P] Write `frontend/README.md` and `backend/README.md` covering the commands in quickstart.md
- [ ] T065 Re-run `/speckit-analyze` to catch spec drift introduced during implementation, then tag v0.1 and write `CHANGELOG.md` (workflow.md stages 6 and 7)
- [ ] T066 Write `docs/retro-01.md` comparing shipped behaviour against every acceptance criterion in spec.md, item by item (workflow.md stage 8)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.**
- **User Stories (Phases 3–7)**: all depend on Foundational. Then run in priority order, or in
  parallel given more than one developer.
- **Polish (Phase 8)**: depends on the stories being shipped, except T062 which can be prepared early.

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on any other story.
- **US2 (P2)**: after Phase 2. Consumes `lib/status.ts` from T024 but no US1 code.
- **US3 (P3)**: after Phase 2. Its drag targets are US2's day cells, so US2 first is the practical
  order — but the tap path (T045) works against the backlog alone and is independently testable.
- **US4 (P4)**: after Phase 2. Filters whatever views exist.
- **US5 (P5)**: after Phase 2 for the backend, after T045 for the UI, since the link field lives in
  the same sheet.

### Within Each User Story

- Tests are written before the implementation they cover, and must fail first.
- Models before endpoints; endpoints before the UI that calls them.
- Story complete and checkpoint-validated before starting the next priority.

### Parallel Opportunities

- T003, T004, T005 in Phase 1.
- T007 and T008; then T014, T017, T018 once the schema lands; then T023 and T024, which touch no
  shared file.
- Every `[P]`-marked test task within a story phase.
- With more than one developer, US2 and US4 can proceed alongside US3 after Phase 2 completes.

---

## Parallel Example: Phase 2 Foundational

```bash
# After T009 and T010 land, these three touch disjoint files:
Task: "Write the single-account seed script in backend/app/scripts/seed_user.py"
Task: "Write backend/tests/test_auth.py covering login and token failure modes"
Task: "Write the schema-guard test in backend/tests/test_schema.py"

# Frontend primitives, no shared file:
Task: "Implement date-only helpers in frontend/lib/dates.ts"
Task: "Implement the status and platform cue mapping in frontend/lib/status.ts"
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
without breaking the previous one, and each is a demo.

The natural stopping point if time runs short is after US3: capture, see, and advance is the whole
pipeline. US4 and US5 are convenience and record-keeping.

### Solo strategy

This project is one developer. The parallel markers above indicate tasks that will not conflict in the
same file — useful for batching within a session — not a staffing plan. One merge request per task
still applies, and the merge gate still applies to your own merge requests (constitution VI).

---

## Notes

- `[P]` means different files with no dependency on incomplete work.
- `[Story]` labels map tasks to spec.md user stories for traceability, which is what
  `/speckit-analyze` checks.
- Verify tests fail before implementing.
- Stop at any checkpoint to validate a story independently.
- **Blocked before Phase 8**: no git remote and no `glab` installation exist yet, so the protected
  `main` and the merge gate required by constitution principle VI are not yet real. See
  [quickstart.md](./quickstart.md) Outstanding setup. This blocks stage 3 (Load) and shipping, not
  implementation.
