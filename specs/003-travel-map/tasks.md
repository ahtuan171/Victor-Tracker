# Tasks: Travel Map

**Input**: Design documents from `/specs/003-travel-map/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md — all present.

**Tests**: Included. This project's constitution names `reviewer` and `/speckit-analyze` as recurring
checkpoints and every prior iteration wrote backend + frontend tests alongside implementation; this
one does the same.

**Organization**: Tasks are grouped by user story (spec.md's five, all P1/P2) so each is independently
implementable and testable, per `.claude/rules/workflow.md`'s one-task-one-merge-request norm.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5, matching spec.md's numbering
- File paths are exact, per plan.md's Project Structure section

---

## Phase 1: Setup

**Purpose**: The one piece of environment configuration nothing else in this feature can proceed
without. `maplibre-gl` is **already installed** (added during the pre-planning spike,
`chore/003-maplibre-headless-spike`, merged to `main` before this branch existed) — no setup task for
it.

- [ ] T001 Add R2 credential settings (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
      `R2_BUCKET_NAME`) to `backend/app/config.py`'s `Settings` class, following the existing pattern,
      plus `.env.example` — no code reads them yet, this only makes the names exist once and prevents
      the "empty variable overrides a default" trap `CLAUDE.md`'s Decisions table already names.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, services, and client wiring every user story needs. No user story task
starts before this phase is green.

- [ ] T002 Add `DestinationStatus` and `TripStatus` enums to `backend/app/models.py` (data-model.md's Enumerations)
- [ ] T003 Add `Trip`, `Destination`, `Photograph` SQLModel classes to `backend/app/models.py`, per data-model.md's column tables (depends on T002)
- [ ] T004 Generate and apply the Alembic migration for `trip`, `destination`, `photograph` in `backend/alembic/versions/` — both enum types, both foreign keys `ON DELETE CASCADE`, both indexes (`ix_destination_trip_id`, `ix_destination_status`, `ix_photograph_destination_id`) (depends on T003)
- [ ] T005 [P] Add `TripCreate`/`TripUpdate`/`Trip`, `DestinationCreate`/`DestinationUpdate`/`Destination`/`DestinationDetail`, `PhotographCreate`/`Photograph`/`PhotoUploadUrl`, `LocationCandidate` schemas to `backend/app/schemas.py`, matching contracts/openapi.yaml exactly
- [ ] T006 [P] Add `backend/app/services/geocoding.py` — a Nominatim client wrapper (`search(query: str) -> list[LocationCandidate]`), sending the required identifying `User-Agent` (research.md R-001)
- [ ] T007 [P] Add `backend/app/services/object_storage.py` — R2 presigned-PUT and presigned-GET helpers (`tech-defaults.md`'s Object Storage section), reading the settings from T001
- [ ] T008 Register stub routers for `trips`, `destinations`, `locations`, `photographs` in `backend/app/main.py` (depends on T004, T005)
- [ ] T009 [P] Add `frontend/lib/api.ts` client functions for every operation in contracts/openapi.yaml (Trip/Destination CRUD, location search, photo upload flow) — bodies calling stub endpoints until Phase 3+ fills them in
- [ ] T010 [P] Extend `frontend/tests/contract/api-types.spec.ts` to compare `DestinationStatus` and `TripStatus` against contracts/openapi.yaml on disk, matching the existing `Status`/`Platform` check
- [ ] T011 Extend `frontend/tests/contract/proxy-allowlist.spec.ts` so every operation in contracts/openapi.yaml is either allowed or excluded-with-a-reason — per that contract's own note that this file must be taught about it

**Checkpoint**: Schema exists, migration applied, services callable, client and contract tests know
about the new surface. No user-facing behaviour yet.

---

## Phase 3: User Story 1 - See where I've been and where I want to go (Priority: P1) 🎯 MVP

**Goal**: Open the map, see every marked place as a status-distinguishable pin, pan/zoom it at 375px.

**Independent Test**: with places in every status, open the map and confirm each is visually
distinguishable without tapping it.

- [ ] T012 [US1] Implement `GET /destinations` (list, optional `trip_id`/`status` query params) in `backend/app/api/destinations.py`
- [ ] T013 [US1] Implement `POST /destinations` (create; requires `latitude`/`longitude` already resolved — INV-1) in `backend/app/api/destinations.py`
- [ ] T014 [P] [US1] Add `frontend/components/map/MapView.tsx` — a MapLibre instance against CARTO's dark-matter style, sized to the 375×667 floor (FR-003, FR-004)
- [ ] T015 [P] [US1] Add `frontend/lib/map.ts` — pure functions mapping `DestinationStatus` to a pin's visual treatment, plus the Currently-Traveling overlay computed from `today()` (research.md R-004), matching `lib/items.ts`'s pure-functions-plus-thin-hook split (`frontend/AGENTS.md`)
- [ ] T016 [US1] Add `frontend/components/map/DestinationPin.tsx` — renders one pin using `lib/map.ts`'s treatment (FR-002, shape not colour alone) (depends on T015)
- [ ] T017 [US1] Wire `MapView` to load every Destination via `GET /destinations` and render one `DestinationPin` per row (depends on T012, T014, T016)
- [ ] T018 [US1] Add `frontend/app/(app)/map/page.tsx`, guarded the same way `calendar/page.tsx` is (`hasSessionCookie`, `frontend/AGENTS.md`)
- [ ] T019 [US1] Handle the empty-map state in `frontend/components/map/MapView.tsx` — renders with a reasonable default view and invites the first place, no error (User Story 1 scenario 2)
- [ ] T020 [US1] Handle near-overlapping pins in `frontend/components/map/MapView.tsx` so both remain individually reachable at the current zoom (User Story 1 scenario 3)
- [ ] T021 [P] [US1] `backend/tests/test_destinations.py` — list, create, INV-1 (coordinates never null on a stored row)
- [ ] T022 [P] [US1] `frontend/tests/e2e/map.spec.ts` — V1: pins render, are status-distinguishable, empty state, 375px viewport-audit — DOM and `page.screenshot()` assertions only, **never** a canvas pixel read (research.md R-002)

**Checkpoint**: US1 is independently functional — a real map, real pins, real statuses.

---

## Phase 4: User Story 2 - Open a visited place to see its photos and notes (Priority: P1)

**Goal**: Tap a Visited pin, see its note and photographs; add both from there.

**Independent Test**: mark a place Visited, attach a note and a photograph, confirm both reachable in
one tap from its pin.

- [ ] T023 [US2] Implement `GET /destinations/{destination_id}` returning `DestinationDetail` (note + photographs, each with a freshly minted presigned GET URL — FR-024) in `backend/app/api/destinations.py`
- [ ] T024 [US2] Implement `PATCH /destinations/{destination_id}` (note, name, dates, status, `trip_id`) in `backend/app/api/destinations.py`
- [ ] T025 [US2] Implement `DELETE /destinations/{destination_id}` in `backend/app/api/destinations.py` — cascades to its photographs (`ON DELETE CASCADE`), does not touch its Trip (FR-016)
- [ ] T026 [US2] Implement `POST /destinations/{destination_id}/photos/upload-url` in `backend/app/api/photographs.py` (depends on T007)
- [ ] T027 [US2] Implement `POST /destinations/{destination_id}/photos` (confirm) in `backend/app/api/photographs.py`
- [ ] T028 [US2] Implement `DELETE /destinations/{destination_id}/photos/{photo_id}` in `backend/app/api/photographs.py`
- [ ] T029 [P] [US2] Add `frontend/components/map/DestinationSheet.tsx` — opens on pin tap; shows note + photo gallery when `status === "visited"`, offers neither on Planned/Wishlist (FR-009, INV-3)
- [ ] T030 [US2] Wire photo attach inside `DestinationSheet`: request the upload URL, `PUT` the file **directly to R2** from the browser, then confirm via `POST .../photos` (FR-023 — never through this backend)
- [ ] T031 [US2] Wire note editing inside `DestinationSheet` to `PATCH /destinations/{destination_id}` (depends on T024)
- [ ] T032 [US2] Add a delete control to `frontend/components/map/DestinationSheet.tsx`, wired to `DELETE /destinations/{destination_id}`, matching `DeleteConfirm`'s three-tap confirmation pattern from `001` (FR-016, `.claude/rules/design.md`)
- [ ] T033 [P] [US2] `backend/tests/test_photographs.py` — upload-url shape, confirm, delete, all against a stubbed R2 client (never real R2 in tests)
- [ ] T034 [P] [US2] `frontend/tests/e2e/photo-upload.spec.ts` — V2 (gallery gated on Visited), V6 (network inspector confirms the `PUT` never reaches this product's own backend origin)

**Checkpoint**: US1 + US2 — the map plus the photo/note gallery that makes a Visited pin worth tapping.

---

## Phase 5: User Story 3 - Organise places into a Trip (Priority: P1)

**Goal**: Create a Trip, search a real place name, add it as a Destination, see it plotted.

**Independent Test**: create a Trip, add a Destination by searching a real place name, confirm it
appears on the map at the resolved coordinates.

- [ ] T035 [US3] Implement `POST /trips`, `GET /trips`, `GET /trips/{trip_id}` in `backend/app/api/trips.py`
- [ ] T036 [US3] Implement `PATCH /trips/{trip_id}`, `DELETE /trips/{trip_id}` (cascades to its Destinations and their Photographs — FR-018) in `backend/app/api/trips.py`
- [ ] T037 [US3] Implement `GET /locations/search` in `backend/app/api/locations.py`, calling `geocoding.py` (T006); empty match is a `200` with `[]`, an unreachable Nominatim is a `502` — the two must stay distinguishable (FR-012)
- [ ] T038 [US3] Implement FR-017's containment check (a Destination's dates outside its Trip's) in `backend/app/api/destinations.py`, as a flag returned from the create/update path, not a rejected write — applies only when both ranges are present (data-model.md's note on nullable dates)
- [ ] T039 [P] [US3] Add `frontend/components/map/TripPanel.tsx` — create, list, and open a Trip
- [ ] T040 [P] [US3] Add `frontend/components/map/LocationSearch.tsx` — a search input calling `GET /locations/search`, presenting `LocationCandidate` results for the owner to pick one (FR-011, FR-012, User Story 3 scenario 2)
- [ ] T041 [US3] Wire "add a Destination to this Trip": `LocationSearch` → pick a candidate → `POST /destinations` with the resolved coordinates and this Trip's `trip_id` (depends on T013, T040)
- [ ] T042 [US3] Add the delete-Trip confirmation naming what cascades (FR-018), matching `DeleteConfirm`'s three-tap pattern from `001` (`.claude/rules/design.md`)
- [ ] T043 [P] [US3] `backend/tests/test_trips.py` — CRUD, cascade delete, FR-017's containment flag
- [ ] T044 [P] [US3] `backend/tests/test_locations.py` — search against a stubbed Nominatim; asserts the empty-result/unreachable distinction (FR-012)
- [ ] T045 [P] [US3] `frontend/tests/e2e/trip-organise.spec.ts` — V3 (search → real coordinates), V4 (Trip CRUD, containment flag, cascade delete)
- [ ] T046 [P] [US3] `frontend/tests/e2e/network-disclosure.spec.ts` — V9: intercept the outgoing tile requests and the Nominatim search request, assert each carries only viewport/zoom or the owner-typed search text, never a place name, note, or record id (SC-006, constitution principle II)

**Checkpoint**: US1 + US2 + US3 — the full P1 slice. A real map, real photos/notes, and real trip
organisation backed by real geocoding. This is the smallest shippable version of this iteration.

---

## Phase 6: User Story 4 - Add a place to the map directly (Priority: P2)

**Goal**: Mark a new place Visited/Planned/Wishlist from the map itself, in at most three
interactions, with or without attaching it to a Trip.

**Independent Test**: from the map, mark a new place Wishlist in at most three interactions (SC-003);
confirm it appears immediately with no separate save step.

- [ ] T047 [US4] Add `frontend/components/map/QuickAdd.tsx` — search or tap a location, then choose a status; offers "attach to an existing Trip" as one choice among leaving it unattached (FR-020, FR-021)
- [ ] T048 [US4] Wire `QuickAdd` to `POST /destinations` with `trip_id` omitted or set per the owner's choice; the new pin renders without a page transition (FR-022)
- [ ] T049 [US4] `frontend/tests/e2e/quick-add.spec.ts` — V5, counts interactions and asserts the three-interaction ceiling (SC-003)

**Checkpoint**: US1–US4 — the map is now fast to add to, not just something that displays what a Trip
flow already created.

---

## Phase 7: User Story 5 - Filter the map by status (Priority: P2)

**Goal**: Narrow the map to one status at a time; clear back to everything.

**Independent Test**: with places in more than one status, select one status filter and confirm only
that status's pins remain, with a control to return to "all."

- [ ] T050 [US5] Add `frontend/components/map/StatusFilter.tsx` — a single-status selector plus a clear control
- [ ] T051 [US5] Wire `StatusFilter` to narrow the **already-loaded** Destination list client-side, never re-issuing `GET /destinations` per filter change — the same "load once, narrow client-side" rule `001`'s `research.md` R-007 established for the calendar's own list, applied here for the same reason: a filter toggle should not cost a round trip on a stack whose cold path is measured in tens of seconds (`.claude/memory.md`'s Deferred section)
- [ ] T052 [P] [US5] `frontend/tests/client/map.spec.ts` — pure-function test of the status-narrowing logic in `lib/map.ts`
- [ ] T053 [US5] Extend `frontend/tests/e2e/map.spec.ts` — V8 (filter narrows visible pins, clearing restores them)

**Checkpoint**: All five user stories independently functional. Every acceptance scenario in spec.md
has a task that realises it.

---

## Final Phase: Checkpoint & Review

**Purpose**: The same three-gate checkpoint `.claude/memory.md` records as load-bearing for every
prior iteration — a hand-walk, `/speckit-analyze`, and the `reviewer` agent each catch a different
class of defect.

- [ ] T054 Hand-walk quickstart.md's V1–V9 against a production build (`pnpm build && pnpm start`, real backend, real seeded account) at 375px, in both presentations — the browser-driven proof a stubbed suite cannot give (`001`'s T044/T072 precedent)
- [ ] T055 Run `/speckit-analyze` against spec.md, plan.md, and tasks.md; resolve any CRITICAL/HIGH finding in the same merge request that introduced it
- [ ] T056 Run the `reviewer` agent (`.claude/agents/reviewer.md`) against the full branch diff
- [ ] T057 Documentation drift sweep: search the whole repository (not a scoped guess — `.claude/memory.md`'s "search the whole repository, then filter" rule) for stale claims about iteration 003/travel map, and correct every one in this same merge request
- [ ] T058 Add a Deferred entry to `.claude/memory.md` for what this spec deliberately did not build (Activity/Calendar, Route, Budget/cost fields, Category/Priority) — the trigger condition for each, not a bare list
- [ ] T059 Update `CLAUDE.md`'s status section and the `specs/003-travel-map/` row in "Where each part stands," matching how `001`/`002` closed their own status paragraphs
- [ ] T060 Write `docs/retro-03.md` (Reflect stage) — bad estimates, scope creep, friction between SpecKit/GitLab/Design, shipped behaviour against spec.md's acceptance criteria item by item

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks every user story.**
- **User Stories (Phase 3–7)**: All depend on Foundational. US1, US2, US3 are P1 and form the MVP;
  US2 and US3 each build on API surface US1 also touches (`destination`), so within this codebase
  they are best taken in order (US1 → US2 → US3) even though each has its own independent test.
  US4 and US5 (P2) depend on US1's `MapView`/`DestinationPin` existing but not on US2/US3's content.
- **Final Phase**: Depends on every user story the owner wants shipped being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on another story. The MVP floor.
- **US2 (P1)**: Needs `DestinationPin`/`MapView` (US1) to have somewhere to open from; its own
  endpoints and photo path are independent.
- **US3 (P1)**: Needs `POST /destinations` (US1, T013) to attach a searched location to; its Trip
  CRUD and geocoding are independent of US2.
- **US4 (P2)**: Needs `MapView` (US1) and `POST /destinations` (US1); does not need US2 or US3.
- **US5 (P2)**: Needs `MapView`/`DestinationPin` (US1) and the status vocabulary (Phase 2); does not
  need US2, US3, or US4.

### Parallel Opportunities

- T005, T006, T007, T009, T010 (Phase 2) touch disjoint files and can run in parallel once T002–T004
  land.
- T014 and T015 (Phase 3) are disjoint files.
- T021 and T022 (Phase 3), T033 and T034 (Phase 4), T043/T044/T045 (Phase 5) — each story's backend
  and frontend test tasks are disjoint files and can run in parallel with each other, though not
  before their own story's implementation tasks.
- US4 and US5 can be built in parallel by two different tracks once US1 is checkpointed, since neither
  depends on the other or on US2/US3.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Once T002-T004 (the schema) are done, these are independent files:
Task: "Add schemas to backend/app/schemas.py"
Task: "Add backend/app/services/geocoding.py"
Task: "Add backend/app/services/object_storage.py"
Task: "Add frontend/lib/api.ts client functions"
Task: "Extend frontend/tests/contract/api-types.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1–3 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1) — **stop and validate**: a real map with real pins.
3. Complete Phase 4 (US2) — **stop and validate**: visited pins open to photos and notes.
4. Complete Phase 5 (US3) — **stop and validate**: trips organise real, geocoded places.
5. This is a legitimately shippable increment even before US4/US5 — every P1 story is done and the
   constitution's named core capability works end to end.

### Incremental Delivery

1. Setup + Foundational → nothing user-visible yet.
2. US1 → the map exists and shows real data (MVP floor).
3. US2 → a visited pin is worth tapping.
4. US3 → the map has a real way to get places onto it beyond manual coordinate entry.
5. US4 → adding a place gets fast.
6. US5 → the map stays readable as it fills up.
7. Final Phase → the same checkpoint every prior iteration ran before calling itself done.

## Notes

- [P] tasks touch different files with no dependency on an incomplete task.
- Every endpoint task cites the exact `operationId` from contracts/openapi.yaml it implements —
  cross-check against that file, not against this one, if the two ever disagree (`specs/` outranks
  code, but within `specs/` the contract is the executable-adjacent artifact for the API shape).
- Commit after each task, one merge request per task, matching `.claude/rules/workflow.md` — the
  documented exceptions in `001`/`002` (two-task MRs where a task's entire subject was setting up the
  next one) are a recorded deviation, not a default to reach for here.
- Stop at any checkpoint to validate a story independently before continuing.

## Post-`/speckit-analyze` amendments (2026-08-14)

Three findings from the Stage-1 `/speckit-analyze` pass, fixed here rather than left for
implementation to trip over:

- **E1 (HIGH)**: `DELETE /destinations/{destination_id}` (`deleteDestination` in
  contracts/openapi.yaml) had no task, despite FR-016 requiring delete on both a Trip and a
  Destination — only `deleteTrip` (now T036) was covered. Added **T025** (backend) and **T032**
  (frontend delete control), renumbering every task from the old T025 onward.
- **F1 (MEDIUM)**: T019, T020, and the old T036 (now **T038**) lacked explicit file paths. All three
  now name a file, matching plan.md's Project Structure section.
- **E2 (MEDIUM)**: SC-006 had only a manual quickstart step (V9) and no automated test. Added
  **T046**, a Playwright test intercepting outgoing tile and Nominatim requests.

Total task count moved from 57 to **60**. No task's *content* changed beyond these three additions
and the two file-path fixes — every renumbered task is otherwise identical to its prior version.
