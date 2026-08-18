# Tasks: Opening a Place

**Input**: Design documents from `/specs/004-place-detail-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md — all present. No
`contracts/` this iteration (plan.md's Project Structure: no backend file changes at all).

**Tests**: Included. This project's constitution names `reviewer` and `/speckit-analyze` as recurring
checkpoints and every prior iteration wrote tests alongside implementation; this one does the same —
frontend-only, since there is no backend change to test.

**Organization**: Tasks are grouped by user story (spec.md's six: four P1, two P2) so each is
independently implementable and testable, per `.claude/rules/workflow.md`'s one-task-one-merge-request
norm. `docs/retro-03.md` flagged that discipline slipping last iteration (one MR carrying 13 tasks,
undocumented) — this list is sized to hold the line.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6, matching spec.md's numbering
- File paths are exact, per plan.md's Project Structure section

---

## Phase 1: Setup

**Skipped — no tasks.** No new dependency, package, environment variable, or migration this iteration
needs (plan.md's Summary: `maplibre-gl` is already installed from `003`, and nothing else is added).

---

## Phase 2: Foundational

**Skipped as a separate phase.** Unlike `003`, no infrastructure here is shared by *all six* user
stories: US1 (selection + camera) and US2 (confirmation) touch `MapView`/`MapShell`'s selection state
and never open `DestinationSheet`'s content at all; US3–US6 touch `DestinationSheet`'s content and
editing form and never need `selectedId`/`confirmingId` to exist first. Forcing a shared Foundational
phase here would block stories on infrastructure they do not use. The real dependency shape — US2 on
US1, and US4/US5/US6 on US3's shell restructuring — is stated explicitly in each phase below and in
Dependencies & Execution Order, rather than hidden behind a phase that would overstate what is
actually shared.

---

## Phase 3: User Story 1 - Know which place I just opened (Priority: P1) 🎯 MVP

**Goal**: Tapping a pin brings the map to it and marks it selected; at most one place selected at a
time; dismissing leaves the map where it is; overlapping pins separate on tap.

**Independent Test**: with several places marked close together, tap one and confirm the map moves to
centre it, the pin is distinguishable as selected, and dismissing leaves the map in place with nothing
selected.

- [x] T001 [P] [US1] Add pure Web Mercator overlap/target-zoom geometry to `frontend/lib/map.ts` — a
      function taking `(tapped: Destination, all: readonly Destination[], currentZoom: number)` and
      returning `data-model.md`'s `OverlapResolution` (R-002): whether the tapped place has another
      within a too-close-to-tap-separately screen-pixel radius (44px) at `currentZoom`, and if so, the
      smallest zoom that separates them. **No `mapWidthPx` parameter** — dropped during
      implementation once the Mercator math showed screen-pixel distance never depends on container
      width (`data-model.md`'s own correction note)
- [x] T002 [P] [US1] Add a `selected` prop to `frontend/components/map/DestinationPin.tsx`, drawn as a
      distinct treatment beyond the existing status fill — not colour alone (FR-002)
- [x] T003 [US1] Add `selectedId: number | null` state to `frontend/components/map/MapShell.tsx`; pass
      `selected={destination.id === selectedId}` through `MapView` to each `DestinationPin` (depends on
      T002)
- [x] T004 [US1] In `frontend/components/map/MapView.tsx`, call `map.easeTo({ center, zoom })` on
      selection (no `essential: true`, so `prefers-reduced-motion` collapses it to an instant jump
      automatically, R-002), using T001's geometry to pick the target zoom when the tapped place
      overlaps another; wire pin taps to set `selectedId` (depends on T001, T003). **Combined into one
      MR with T003 and T005**: `setSelectedId` from T003 alone has no caller until T004 wires it, which
      is exactly the "a task's entire subject is the next task" collision `003`'s own accepted
      deviations already named — confirmed by `pnpm lint` actually failing on the unused setter when
      tried as separate commits.
- [x] T005 [US1] Confirm dismissing the selection leaves the map's camera untouched (FR-004) — clearing
      `selectedId` must not itself trigger another `easeTo` call; add a guard in T004's effect if the
      current structure would otherwise re-fire one. **No guard needed**: `easeTo` is only ever called
      inside the pin's own click closure (`buildOnOpen` in `MapView.tsx`), never reactively from the
      `selectedId`-watching sync effect, so clearing the selection re-renders every pin's `selected`
      prop without touching the camera at all.
- [x] T006 [P] [US1] `frontend/tests/client/map.spec.ts` — pure-function tests for T001's overlap/
      target-zoom geometry, asserting against plain coordinate arrays, no live map instance.
      **Merged late, not late-started**: its MR (!103) auto-merge-on-pipeline-success silently
      stalled on a conflict when T003–T005's MR (!102) landed first and moved the shared lines in
      this file out from under it — GitLab left !103 `state: opened` for the rest of the session
      while `glab mr merge --yes`'s own stdout had already claimed success. Caught only by an
      end-of-session `git merge-base --is-ancestor` sweep across every commit believed merged, not
      by anything in the moment. Fixed by rebasing onto `main` and re-merging, verified via the API
      this time rather than the CLI's own report.
- [x] T007 [P] [US1] `frontend/tests/e2e/place-selection.spec.ts` — V1: selection marking,
      at-most-one-selected, overlapping pins separate on tap (depends on T004, T005). **Dismiss is
      not covered here** — `quickstart.md`'s own V1 step 3 already deferred it to V2 ("via the
      confirmation step's dismissal"), since the only dismiss gesture this product has is
      `PlaceConfirm`'s, which does not exist until T008–T009. Coverage lands with T011.

**Checkpoint**: US1 independently functional — selection and zoom-to-pin work with no confirmation
step or restructured detail yet.

---

## Phase 4: User Story 2 - Confirm the place before it takes the screen (Priority: P1)

**Goal**: Selecting a pin shows a short step naming the place and its status before the full detail
opens; one action opens it, dismissing changes nothing.

**Independent Test**: tap a pin, confirm the place's name and status are readable without the full
detail opening, and confirm dismissing returns to the map with nothing else having happened.

**Depends on US1** — reuses `selectedId` and the pin-tap handler T004 wired.

- [x] T008 [US2] Add `frontend/components/map/PlaceConfirm.tsx` — a small dismissible surface naming
      the selected place and its status, with exactly one action that requests the full detail
      (FR-006, FR-007). Occupies `QuickAdd`'s own floating slot in `MapShell.tsx` (T009 wires the
      swap) rather than a new position — the two panels are mutually exclusive by construction.
- [x] T009 [US2] Add `confirmingId: number | null` state to `MapShell.tsx`; a pin tap sets both
      `selectedId` (T003) and `confirmingId`; `PlaceConfirm`'s action clears `confirmingId` and sets
      `openDestinationId` (opening the existing `DestinationSheet`) (depends on T003, T008).
      **Correction found during implementation**: dismissing clears **both** `confirmingId` and
      `selectedId`, not only `confirmingId` as this line originally said. FR-004 (User Story 1) is
      explicit that dismissing a selection "MUST... leave no place selected" — `PlaceConfirm` is the
      only dismiss gesture this product has, so leaving `selectedId` set on dismiss would leave
      FR-004 undischarged. The map's camera is still untouched either way (nothing here calls
      `easeTo`). **Also retires T004's interim behaviour**: a pin tap no longer calls
      `onOpenDestination` (stopped passing that prop to `MapView`), so `DestinationSheet` only opens
      via `PlaceConfirm`'s own action now — required fixing three tests in `photo-upload.spec.ts`
      and one in `place-selection.spec.ts` (T007) that assumed the old direct-open, in this same
      commit. **Also adds `MINIMUM_SELECTION_ZOOM` (owner request, mid-session)**: selecting a place
      now always eases to at least a close, local-area zoom (14) via `Math.max` on top of
      `resolveOverlap`'s own answer in `MapView.tsx`'s `buildOnOpen` — `resolveOverlap` itself is
      untouched, keeping T006's exact-value tests valid. The owner's reference material (a
      third-party map product's screenshot) was used only for this interaction-pattern description
      — zoom closer, callout, panel-after-tap — never as a visual/asset source (standing
      Spider-Man-IP exclusion, `.claude/memory.md`).
      **Further owner-directed follow-up, same day, against two more reference images ("image 1"
      and "image 2")**: `MINIMUM_SELECTION_ZOOM` raised **14 → 16** (a street-level view, closer
      than the neighbourhood-level first guess); `PlaceConfirm` moved from a fixed full-width bar
      anchored to the map's own lower edge into a `maplibregl.Popup` anchored to the confirming
      Destination's own coordinate, so it floats directly over the selected pin instead — MapLibre
      repositions a `Popup` on pan/zoom by itself, matching how pins are already plain
      `maplibregl.Marker` instances rather than anything hand-projected. `QuickAdd` is no longer
      suppressed while a place is being confirmed, since the two no longer compete for the map's
      lower edge. FR-006–FR-008's guarantees, every `place-confirm*` testid, and `resolveOverlap`
      itself are all unchanged — this is a presentation change, not a behaviour change. See
      `MapView.tsx`'s and `PlaceConfirm.tsx`'s own docstrings for the detail. Same standing
      Spider-Man-IP exclusion held again: the owner's reference images described zoom level and
      the "floats at the pin, one action, panel only after tapping it" mechanic only, never a
      visual/asset source.
- [x] T010 [US2] Update `frontend/components/map/DestinationStrip.tsx`'s tap handler to set
      `selectedId` and move the camera (T004) but open `openDestinationId` directly, skipping
      `confirmingId` — R-001's documented asymmetry: a strip card is already unambiguous, so the
      confirmation step's mis-tap defence does not apply there (depends on T004, T009)
      **Implementation note**: `DestinationStrip.tsx` itself needed no change — its tap already goes
      through one callback (`onOpenDestination`), so the behaviour change lives in that callback,
      `MapShell.tsx`'s `openDestination`. The camera move was the real obstacle: it only ever
      happened inside `MapView.tsx`'s own pin-click closure (`buildOnOpen`), which `MapShell` cannot
      reach — `MapView` owns `mapRef` privately. Solved with a small imperative escape hatch:
      `MapView` is now `forwardRef`-wrapped exposing `MapViewHandle.focusDestination(id)`, backed by
      a shared `easeToDestination` helper `buildOnOpen` now also calls, so a strip tap and a pin tap
      move the camera identically. No change to `resolveOverlap`'s own exact-value tests (T006).
- [x] T011 [P] [US2] `frontend/tests/e2e/place-selection.spec.ts` (extend) — V2: confirmation step
      appears naming place+status, dismiss changes nothing and opens nothing, its action opens the
      full detail, and a strip tap opens the full detail directly while still selecting (depends on
      T009, T010)
      **Implementation note**: four tests added. Verified 5 consecutive local runs, `--retries=0`,
      all green — not green-once, matching this project's own standing bar for map e2e tests. Also
      ran the full map-related surface (`map`, `photo-upload`, `place-selection`, `trip-organise`,
      `viewport-audit`, 58 tests) against the `MapView` `forwardRef` change with no regressions.

**Checkpoint**: US1+US2 — selecting and confirming a place both work; `DestinationSheet`'s content is
still today's unconditional form.

---

## Phase 5: User Story 3 - A Visited place opens to what happened there (Priority: P1)

**Goal**: A Visited place's detail shows its photographs and impressions as content, not as form
fields; an empty Visited place invites adding both.

**Independent Test**: mark a place Visited with a note and photographs, open it, and confirm both are
shown as the panel's substance rather than as fields on a form.

- [x] T012 [US3] Restructure `frontend/components/map/DestinationSheet.tsx` into a thin shell: fetch
      `DestinationDetail` as today, then branch what it renders on `detail.status` (FR-009) —
      `"visited"` renders the new `VisitedPanel` (T013); every other status keeps today's unconditional
      form as an explicit, temporary fallback, replaced by US4 (T021) and US5 (T024) in their own
      phases rather than built here
      **Implementation note**: the branch reads `detail.status` (the saved status), deliberately not
      `draft.status` (the earlier code's own gate) — what content panel shows is a fact about the
      Destination as it is, not a live preview of the status control mid-edit. T026 (US6) is what
      later branches the *editing form* on `draft.status`; the two are separate concerns from here on.
- [x] T013 [US3] Add `frontend/components/map/VisitedPanel.tsx` — photographs and the existing `note`
      field (spec.md's "impressions", Clarifications) presented as content; move the existing
      attach-photo, remove-photo, and save-note actions here from the old combined form (FR-010)
      (depends on T012)
      **Implementation note**: takes `detail`/`setDetail`/`onUpdated` straight from the shell (the
      identical `useState<DestinationDetail | null>` setter, not a wrapper) so a photo/note write
      updates the one source of truth the shell's other fields also read. Rendered `key={detail.id}`
      by the shell so its local `noteDraft` seeds fresh per Destination without an effect.
- [x] T014 [US3] In `VisitedPanel.tsx`, add the invitation to add impressions and photographs when a
      Visited place has neither yet (FR-010 scenario 2) (depends on T013)
      **Implementation note**: bundled into the same MR as T012/T013 — T012 alone does not compile
      without `VisitedPanel` existing, matching this project's own recorded exception for a task
      whose entire subject is the next task (`CLAUDE.md`'s "Seven merge requests" note).
- [x] T015 [P] [US3] `frontend/tests/e2e/place-detail.spec.ts` — V3: a Visited place with content shows
      both; an empty Visited place invites adding both (depends on T014)
      **Implementation note**: new file (didn't exist before). Three tests — both scenarios plus a
      third pinning the invitation's own boundary (retired by *either* a note or a photo, not only
      both). Verified 5 consecutive local runs, `--retries=0`, plus the full map-related suite (61
      tests, including the pre-existing `photo-upload.spec.ts` coverage from `003`) with no
      regressions from the `detail.status` vs `draft.status` change.

**Checkpoint**: US1–US3 — a Visited place now opens to its photos/impressions as content. Planned and
Wishlist places still show the old unconditional form.

---

## Phase 6: User Story 4 - A Planned place opens to the trip it belongs to (Priority: P1)

**Goal**: A Planned place's detail shows its own dates, its Trip's name/range, whether its dates fall
outside that range, whether today falls inside them, its sibling places, and — with no Trip — an offer
to attach one.

**Independent Test**: create a Trip with two places, open one, and confirm the panel names the Trip,
its range, this place's own dates, and the sibling place.

**Depends on US3** (T012's shell).

- [x] T016 [US4] Lift `useTrips()` out of `frontend/components/map/TripPanel.tsx` and into
      `MapShell.tsx` (R-003's lift-up); `TripPanel` receives `trips`/`status`/`error`/`reload` as
      props instead of calling the hook itself — the map screen still issues exactly one Trips read,
      not two
      **Implementation note**: mechanical — `MapShell` now holds `tripsStore = useTrips()` and passes
      its four fields straight through. Verified with the full `trip-organise` + `map` suite (20
      tests) with no regressions.
- [x] T017 [US4] Add the pure `PlannedPlaceContext` composition to `frontend/lib/map.ts` (R-003): a
      function taking `(destination: DestinationDetail, allDestinations: readonly Destination[],
      allTrips: readonly Trip[])` and returning `data-model.md`'s `PlannedPlaceContext` — the matching
      Trip or `null`, sibling places sharing `trip_id`, and the already-present
      `outside_trip_range`/currently-traveling flags passed through unchanged
      **Implementation note**: the signature also takes a fourth parameter, `today: DateOnly | null`
      — `data-model.md` says `currentlyTraveling` is "`isCurrentlyTraveling()`, as-is", and that
      function requires `today` for the same reason every other caller of it does (`dates.today()`
      throws outside the browser). Not a deviation from the contract, a parameter the task line's
      prose omitted while the referenced function still needs it.
- [x] T018 [P] [US4] `frontend/tests/client/map.spec.ts` (extend) — T017's composition against plain
      arrays: a Trip found, siblings correctly excluding the place itself, a missing/deleted Trip
      treated the same as no `trip_id` (depends on T017)
      **Implementation note**: six tests — the three named in this line, plus `outsideTripRange`
      passing through, `currentlyTraveling` matching `isCurrentlyTraveling` exactly (asserted against
      the real function, not a duplicated expectation), and a no-mutation guard matching this file's
      existing style for the other pure functions. Bundled into T017's own MR: a task whose entire
      subject is proving the previous one, same exception this project already uses elsewhere.
      36/36 `client` project tests passing, no regressions in the other five `describe` blocks.
- [x] T019 [US4] Add `frontend/components/map/PlannedPanel.tsx` — own dates, Trip name/range, the
      outside-range message (FR-012), the currently-traveling message reusing `isCurrentlyTraveling`
      (FR-013), and the sibling-places list (FR-011) (depends on T017)
- [x] T020 [US4] Add the "offer to attach a Trip" UI in `PlannedPanel.tsx` for a Planned place with no
      Trip: a picker sourced from the `trips` prop (T016), wired to
      `updateDestination(id, { trip_id })` (FR-014, R-004 — the existing `PATCH`, no new endpoint)
      (depends on T016, T019)
- [x] T021 [US4] Wire `DestinationSheet.tsx`'s shell (T012) to render `PlannedPanel` for
      `status === "planned"`, passing down `destinations` (already loaded in `MapShell`) and `trips`
      (T016) (depends on T012, T016, T020)
      **Implementation note**: T019–T021 bundled into one MR — `PlannedPanel` alone (T019) is a
      compilable but unusable component until T021 wires it in, and T020's attach picker lives in
      the same file, so splitting them would put an unreachable component behind two green-but-inert
      pipelines. Same reasoning already used for T012–T014.
- [x] T022 [P] [US4] `frontend/tests/e2e/place-detail.spec.ts` (extend) — V4: Trip context, the
      outside-range message, the currently-traveling message, the sibling list, the attach-a-Trip flow
      actually attaching, and — FR-016 — no `destination-photo`/`destination-note-input` testid present
      on a Planned place's panel (depends on T021)
      **Implementation note**: four tests, one per V4 scenario, bundled into T019–T021's own MR since
      its whole subject is verifying them. The traveling-message test also asserts the *pin's* own
      `data-traveling="true"` overlay in the same test, so it proves the panel's message actually
      matches the pin rather than merely existing (FR-013's own wording). One real bug caught while
      writing it: the list fixture (`GET /destinations`) needs the place's dates repeated onto it
      separately from the `detail` fixture — the pin reads the list response, not the detail one —
      the same trap `map.spec.ts`'s own Currently-Traveling test exists to get right. Verified 5
      consecutive local runs, `--retries=0`, plus the full map-related suite (65 tests) with no
      regressions.

**Checkpoint**: US1–US4 — a Planned place now opens to its trip context. Wishlist places still show
the old unconditional form.

---

## Phase 7: User Story 5 - A Wishlist place says honestly that there is nothing yet (Priority: P2)

**Goal**: A Wishlist place's detail is an honest empty state inviting the owner to plan it — no blank
fields, no gallery, no note section.

**Independent Test**: open a Wishlist place and confirm the panel explains why it is empty and offers
the next step, with no blank photo grid and no empty date fields presented as content.

**Depends on US3** (T012's shell). Independent of US4 — can be built in parallel once US3 lands.

- [ ] T023 [US5] Add `frontend/components/map/WishlistPanel.tsx` — the empty-state message inviting
      the owner to plan the place; no photo gallery, no note section, no blank date fields (FR-015,
      FR-016)
- [ ] T024 [US5] Wire `DestinationSheet.tsx`'s shell (T012) to render `WishlistPanel` for
      `status === "wishlist"`, which is also what removes the last of T012's temporary unconditional
      fallback (depends on T012, T023)
- [ ] T025 [P] [US5] `frontend/tests/e2e/place-detail.spec.ts` (extend) — V5: the empty state's message
      and offer, and — FR-016 — no `destination-photo`/`destination-note-input` testid present on a
      Wishlist place's panel (depends on T024)

**Checkpoint**: US1–US5 — every status now opens to its own content; `DestinationSheet`'s old
unconditional form is fully retired from the display side.

---

## Phase 8: User Story 6 - Changing status asks for what that status makes meaningful (Priority: P2)

**Goal**: The status control changes which fields the editing form asks for; a status change always
saves, even when a newly-asked field is left empty.

**Independent Test**: take a Wishlist place to Planned and confirm the form asks for dates and a Trip;
take it on to Visited and confirm it asks for impressions and photographs; leave a newly-asked field
empty and confirm the save still succeeds.

**Depends on US3** (T012's shell) for the same reason US4/US5 do — the status branch it extends is the
one T012 introduces. Touches the editing-fields half of the shell rather than the display panels US4/
US5 own, so it can be built in parallel with either once US3 lands.

- [ ] T026 [US6] Restructure the editable-fields portion of `DestinationSheet.tsx`'s shell (name,
      dates, status control, save) to branch what it asks for on the **draft's own**, not-yet-saved
      status: moving to `"planned"` additionally shows date and Trip inputs (FR-018); moving to
      `"visited"` additionally shows impressions and photo inputs (FR-019); `"wishlist"` asks for
      neither (FR-017) (depends on T012)
- [ ] T027 [US6] Confirm the save path never withholds a save when a newly-asked field is left empty
      (FR-020) — `PATCH /destinations/{id}` already accepts partial/empty fields with no backend
      validation (R-004), so this is a verification pass over T026's new branches, adding a guard only
      if one is found missing (depends on T026)
- [ ] T028 [P] [US6] `frontend/tests/e2e/place-status-form.spec.ts` — V6: each status transition asks
      for the right fields, every direction is accepted, and the FR-020 case — change status, leave a
      newly-asked field empty, save, confirm it saves and the field stays unset. Closes the
      automated-coverage gap `003`'s retro left open for the status control (`plan.md`'s Project
      Structure note) (depends on T027)

**Checkpoint**: All six user stories independently functional — this iteration's full scope is
delivered.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Extend `frontend/tests/e2e/viewport-audit.spec.ts` with a `/map` block: the existing
      map surfaces `003` never added (`MapView`, `DestinationStrip`, `TripPanel`, `QuickAdd`,
      `StatusFilter`, `LocationSearch`) plus this iteration's four new ones (`PlaceConfirm`,
      `VisitedPanel`, `PlannedPanel`, `WishlistPanel`) — FR-021, SC-005. Found by this iteration's
      `/speckit-analyze` pass: the file is hand-maintained per-surface, not an automatic sweep, and
      `/map` was never in it even before this iteration
- [ ] T030 [P] Run `pnpm lint && pnpm exec tsc --noEmit` from `frontend/` and fix anything either flags
      across every file this iteration touched
- [ ] T031 Hand-walk `quickstart.md`'s V1–V6 at 375px against a real backend (`pnpm build && pnpm
      start`, matching `frontend/AGENTS.md`'s hand-walk setup) — the same discipline every prior
      iteration's Final Phase used, and the one check no automated suite structurally can (`.claude/
      memory.md`'s Traps)
- [ ] T032 Run `/speckit-analyze` against spec.md/plan.md/tasks.md before merge (constitution Stage 6)
- [ ] T033 Run the `reviewer` agent against the full branch diff before merge, per this project's
      standing checkpoint practice (constitution principles II, III, IV, VII as the recurring
      offenders)

---

## Pre-implementation `/speckit-analyze` pass (2026-08-17)

Run before any code, per constitution Stage 1 (`/speckit-analyze` after `/speckit-tasks`). Four
findings, none CRITICAL, all fixed in this same pass rather than left for `/speckit-implement` to
discover — this project's own recurring lesson about a drifted claim not sitting inert applies to a
task list as much as to any other artifact:

- **Two task-ID cross-references were wrong.** T012 originally cited "(T020) and (T023)" as the tasks
  that replace its temporary fallback; the tasks that actually do (they wire the shell) are **T021**
  and **T024**. Fixed.
- **FR-021/SC-005 (one presentation at every width) had no task.** `viewport-audit.spec.ts` is
  hand-maintained per-surface, not an automatic sweep, and `/map` was never added to it — not by this
  iteration and not by `003` before it. Added **T029**.
- **The overlap-detection radius (R-002, T001) was never given a number.** Pinned at **44px** (this
  product's own tap-target floor) in `research.md` and `data-model.md`.
- **FR-016 (gallery/note never offered outside Visited) had no negative assertion.** Structurally true
  by construction (`PlannedPanel`/`WishlistPanel` never import that UI) but unverified. Added an
  assertion each to T022 and T025.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup, Foundational**: skipped — see Phase 1/2 notes above for why neither applies here.
- **US1 (Phase 3)**: no dependency on any other story. Can start immediately.
- **US2 (Phase 4)**: depends on US1 (`selectedId`, the pin-tap handler).
- **US3 (Phase 5)**: no dependency on US1 or US2 — testable today by tapping a pin directly, exactly as
  it works before this iteration.
- **US4 (Phase 6)**: depends on US3 (T012's shell).
- **US5 (Phase 7)**: depends on US3 (T012's shell). Independent of US4.
- **US6 (Phase 8)**: depends on US3 (T012's shell). Independent of US4 and US5.
- **Final Phase**: depends on all six stories being complete.

### The two independent tracks

This iteration splits cleanly into two tracks that never touch the same file, the same shape
`.claude/memory.md`'s 2026-08-02 entry describes for splitting by tree rather than task count:

- **Selection mechanics** (US1 → US2): `MapView.tsx`, `MapShell.tsx`'s selection state,
  `DestinationPin.tsx`, `PlaceConfirm.tsx`, `DestinationStrip.tsx`.
- **Status-branched content** (US3 → {US4, US5, US6} in parallel): `DestinationSheet.tsx`'s shell and
  the three panels, plus `TripPanel.tsx`'s prop change.

The two tracks share no file. A solo session can run them sequentially in story-priority order (as
numbered above); two sessions could run one track each after agreeing on T003/T012's shapes first,
since both later tracks build on those two tasks specifically.

### Within Each User Story

- Tests are written alongside implementation and must fail first against the pre-task behaviour.
- Pure functions (`lib/map.ts` additions) before the components that call them.
- The shell/state task before the panel/UI task that depends on it.
- Story complete and its own checkpoint validated before moving to a story that depends on it.

---

## Parallel Example: User Story 1

```bash
# T001 and T002 touch different files and share no dependency — run together:
Task: "Add pure overlap/target-zoom geometry to frontend/lib/map.ts"
Task: "Add a selected prop to frontend/components/map/DestinationPin.tsx"

# T006 and T007 are both tests, written after T001/T004 land, and can run together:
Task: "frontend/tests/client/map.spec.ts — pure-function overlap/zoom tests"
Task: "frontend/tests/e2e/place-selection.spec.ts — V1"
```

## Parallel Example: US4 and US5 (after US3's checkpoint)

```bash
# Once T012 (US3's shell) is merged, these two stories touch disjoint new files:
Task: "US4 — frontend/components/map/PlannedPanel.tsx and the useTrips() lift-up"
Task: "US5 — frontend/components/map/WishlistPanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3: User Story 1.
2. **STOP and VALIDATE**: run `place-selection.spec.ts`'s V1 checks independently.
3. Selection and zoom-to-pin work; nothing else in this iteration needs to exist yet for that to be
   true and demonstrable.

### Incremental Delivery

1. US1 → US2: the full selection-and-confirmation gesture works end to end (Independent Test for both
   passes; SC-001, SC-002 both measurable).
2. US3: Visited places stop being the only status with real content.
3. US4, US5 (in either order or in parallel): Planned and Wishlist each get their own content; by the
   end of US5, `DestinationSheet.tsx`'s old unconditional fallback is fully retired.
4. US6: the status control becomes progressive, and FR-020's always-saves guarantee gets its first
   automated coverage.
5. Final Phase: lint/typecheck clean, quickstart hand-walked, `/speckit-analyze` and `reviewer` both
   run, exactly as every prior iteration's Final Phase did.

### Parallel Team Strategy

With two people: one takes the Selection-mechanics track (US1 → US2), the other takes
Status-branched-content (US3, then US4/US5/US6 in any order once US3's shell lands). The two tracks
integrate at `DestinationSheet.tsx`'s open/close plumbing only, which neither track's early tasks touch.

---

## Notes

- [P] tasks touch different files and share no incomplete dependency.
- [Story] labels map each task to spec.md's six user stories for traceability.
- Every story above is independently completable and testable except where an explicit dependency is
  named (US2→US1; US4/US5/US6→US3) — and even those dependents remain independently *testable* once
  their one prerequisite task has landed, per each phase's own Independent Test.
- Commit after each task; one task, one merge request, per `.claude/rules/workflow.md` — `docs/
  retro-03.md`'s finding is why this note is here at all.
- Stop at any checkpoint to validate a story independently before moving on.
