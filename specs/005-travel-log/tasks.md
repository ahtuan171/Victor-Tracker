# Tasks: Travel Log

**Input**: Design documents from `/specs/005-travel-log/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md — all present. No backend changes.

---

## Phase 1: Setup

**Skipped — no tasks.** No backend changes, no new packages or environment variables.

---

## Phase 2: Foundational

- [x] T001 [P] Add pure sorting and filtering helper functions in `frontend/lib/log.ts`: `sortDestinationsForLog(destinations, trips)` returning reverse-chronological `LogEntry[]` (`start_date DESC`, then `created_at DESC`).
- [x] T002 [P] `frontend/tests/client/log.spec.ts` — pure unit tests covering `sortDestinationsForLog` with missing dates, ties, and trip attachment names.

---

## Phase 3: User Story 1 - View Travel Timeline in Order (Priority: P1) 🎯 MVP

- [x] T003 [P] Add `frontend/components/map/TravelLogCard.tsx`: renders a single destination entry (status badge/cue without color alone, place name, formatted date range, attached Trip name).
- [x] T004 Add `frontend/components/map/TravelLogDrawer.tsx`: slide-over/bottom-sheet panel rendering the list of `TravelLogCard` components in reverse-chronological order.
- [x] T005 Wire toggle state `isLogOpen` in `frontend/components/map/MapShell.tsx` and add a Travel Log toggle button to the top action bar / header.
- [x] T006 [P] `frontend/tests/e2e/travel-log.spec.ts` — V1: Travel Log timeline opens, displays places in reverse-chronological order with date ranges and Trip names.

---

## Phase 4: User Story 2 - Filter Log by Status (Priority: P1)

- [x] T007 Add status filter chips (`All`, `Visited`, `Planned`, `Wishlist`) inside `TravelLogDrawer.tsx`, updating visible log entries instantly via client state.
- [x] T008 [P] `frontend/tests/e2e/travel-log.spec.ts` (extend) — V2 & V4: filtering log by status shows matching subset; empty status shows honest empty state message.

---

## Phase 5: User Story 3 - Inspect & Focus Place from Log (Priority: P1)

- [x] T009 Wire tap handler on `TravelLogCard.tsx` to invoke `MapShell`'s `openDestination(id)` / `onSelectDestination(id)`, easing map camera to the pin and opening `DestinationSheet`.
- [x] T010 [P] `frontend/tests/e2e/travel-log.spec.ts` (extend) — V3: tapping a log entry closes drawer, moves map camera to place pin, marks selected, and opens `DestinationSheet`.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T011 Extend `frontend/tests/e2e/viewport-audit.spec.ts` to include `TravelLogDrawer` and `TravelLogCard` under 375px viewport floor checks.
- [x] T012 Run `pnpm lint && pnpm exec tsc --noEmit` from `frontend/` and fix any flagged issues.
- [x] T013 Run `/speckit-analyze` against `spec.md`/`plan.md`/`tasks.md` before implementation.
- [x] T014 **Added retroactively, 2026-08-21** — hand-walk `quickstart.md`'s V1–V4 at 375px against
      a real production build (`pnpm build && pnpm start`, matching `frontend/AGENTS.md`'s hand-walk
      setup), the discipline every prior iteration's Final Phase had and this one's originally did
      not (`docs/retro-05.md` §2.2). `frontend/scripts/005-walk.mjs`.
      **Walk note**: run 2026-08-21, **9/9 walkable scenarios passing** (V1.1–V1.3, the undated-entry
      edge case, V2.1–V2.3, V3.1). Fixtures prefixed `IT005`, swept on every run's start and end —
      verified empty afterward, only the owner's own six real Destinations remain.
      **V4 (empty state) could not be walked**: the real dev database already holds at least one
      Destination in every one of the three statuses (`{visited: 3, planned: 1, wishlist: 2}` at
      run time), so no status filter can be made to show zero real matches without deleting the
      owner's own data, which this script must never do. Recorded as a known gap rather than faked
      — the same treatment `003`'s R2 gap and `004`'s photo-upload-under-Visited gap already use.
      `TravelLogDrawer`'s empty-state branch itself is still covered by the stubbed
      `travel-log.spec.ts` (V4), so this is a gap in *this hand-walk's* coverage, not in the
      feature's automated coverage.
      **One finding, in the walk script's own first draft, not the app**: an initial assertion
      claimed an undated entry always sorts last in the Travel Log. `compareLogOrder`
      (`lib/log.ts`) actually falls back to comparing a bare `YYYY-MM-DD` `start_date` against a
      full ISO `created_at` timestamp as plain strings — which sorts an undated (recently-created)
      entry *between* a dated entry in a later month and one in an earlier year, never simply
      "last". Corrected to assert the documented relative ordering instead of an invented absolute
      one — the same class of walk-script bug `003`'s T056 and `004`'s T031 each found once.
