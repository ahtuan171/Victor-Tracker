# Implementation Plan: Opening a Place

**Branch**: `004-place-detail-panel` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-place-detail-panel/spec.md`

## Summary

This iteration makes opening a place feel like something, without recording a single new fact about
one. Tapping a pin now brings the map to it and marks it selected (FR-001–FR-005); a short,
dismissible confirmation step names the place before the full detail opens (FR-006–FR-008); and what
the detail shows — and what the status control asks for when it changes — is chosen entirely by the
place's own status (FR-009–FR-020). Every field involved already exists on `Destination` or
`DestinationDetail`, and every request the frontend needs already exists too.

**This iteration touches no backend file.** `002-pixel-arcade-skin` is the only precedent for a
frontend-only iteration, and this one is frontend-only for a stronger reason than that one: nothing
here needs a new read (`outside_trip_range` and `trip_id` are already present on every `Destination`;
`useDestinations()` already loads its full, unparameterised list in `MapShell` today, and `useTrips()`
already does the same — just one component lower, inside `TripPanel` — so R-003 below lifts that one
call up to `MapShell` rather than adding a second one, which is `001`'s R-007 "load once, narrow
client-side" applied a third time), and nothing needs a new write (attaching an existing place to a
Trip is the existing `PATCH /destinations/{id}` `trip_id` field, used in the direction opposite `003`'s
FR-020 detach). `plan.md` names this explicitly rather than leaving it to be discovered
mid-implementation, because every prior iteration's plan opened a new Alembic revision and this is the
first one that does not.

## Technical Context

**Language/Version**: TypeScript 5 / React 19.2.4 / Next.js 16.2.12 App Router — unchanged, frontend
only. No backend change, so Python/FastAPI is not touched by this iteration at all.

**Primary Dependencies**: None new. `maplibre-gl` 6.3.0 is already a dependency (`003`); this
iteration uses its existing `Map#easeTo`/`Map#flyTo` and `Map#project` APIs, not a new package.

**Storage**: PostgreSQL, unchanged — no new table, column, or Alembic revision. `Place`/`Trip` in
spec.md's Key Entities are `003`'s existing `destination`/`trip` tables, read and written through the
endpoints `003` already built.

**Testing**: Playwright's existing `mobile-375` project for the new interaction flows (selection,
confirmation, status-branched detail, status-branched form). Pure-function unit tests in
`tests/client/map.spec.ts` for the new geometry helpers in `lib/map.ts` (R-002), matching how
`disambiguateCoincidentPins` and `boundsForDestinations` are already tested with no live map instance.

**Target Platform**: Mobile browsers first, 375×667 as a hard floor (constitution principle I) — this
iteration's own FR-021 makes that the *only* width it ships, not merely the baseline. Deployed on
Vercel (frontend only; nothing on Render changes).

**Project Type**: Web application — existing `backend/` + `frontend/` trees. This iteration touches
only `frontend/`.

**Performance Goals**: No new round trip anywhere in this iteration (R-003, R-004) — selection,
confirmation, the status-branched detail, and the Trip context are all computed from data already in
memory once `MapShell`'s existing `useDestinations()`/`useTrips()` have loaded. SC-006 restates `003`'s
three-interaction budget for marking a new place and requires this iteration add nothing to that path.

**Constraints**: 375px floor, no horizontal body scroll, 44px minimum tap target — unchanged,
inherited from `002`'s token layer (`.claude/rules/design.md`), consumed as-is (no new token). FR-021
adds a constraint of its own: one presentation at every viewport width, so there is no wide-screen
branch to build or maintain.

**Scale/Scope**: One user (constitution VII), a personal number of places and Trips — unchanged from
`003`. No pagination designed for volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — result at the bottom of
this section.*

| Principle | Verdict | Reasoning |
|---|---|---|
| **I. Mobile-First, Thumb-First** | **PASS** | FR-021 makes the narrow layout not just the baseline but the *only* shipped presentation this iteration, which is a stronger reading of this principle than any prior iteration needed. SC-005 restates it as a measurable outcome. |
| **II. Personal Data Is Private By Default** | **PASS, nothing new to disclose** | No new request leaves the browser: the map's own zoom-to-pin is a local camera move over already-loaded coordinates, and the Trip-context composition (R-003) reads data already in memory. No new third-party call, no new field reaching R2 or Nominatim. |
| **III. One Core Capability Per Module** | **PASS** | This iteration does not add a capability — it makes the map's existing one (opening a place) legible. Spec.md's "Why this iteration, and what it deliberately does not build" section is the record of what was kept out despite being asked for (cost, companions, itinerary, the Trip/place merge) or constitutionally permitted (Budget, since the 2.1.0 amendment) — permission and a request are both distinguished from an obligation to build. |
| **IV. The Spec Is The Source Of Truth** | **PASS** | `spec.md` names no technology; every decision here — MapLibre's camera APIs, the pure-function overlap geometry, the no-new-endpoint composition — lives in this file and `research.md`. |
| **V. Working And Deployed Beats Polished And Local** | **PASS** | No design-stage token decision is made here; this module consumes `002`'s token layer unchanged. |
| **VI. Merges Are Gated, Not Trusted** | **PASS** | Unchanged — tasks land through merge requests behind the green pipeline. |
| **VII. Build For One User Until There Is A Second** | **PASS** | No schema change at all, so no new column to get wrong. |

**Post-Phase-1 re-check**: no verdict changed. Phase 1 confirmed there is no new entity or attribute
to check against principle VII (data-model.md), and sharpened principle II's row from "nothing new"
to the specific reasoning above.

## Project Structure

### Documentation (this feature)

```text
specs/004-place-detail-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output — R-001…R-004
├── data-model.md        # Phase 1 output — confirms no new entity/attribute; documents derived view data
├── quickstart.md        # Phase 1 output — V1…V6
├── checklists/
│   └── requirements.md  # Written at stage 1, re-validated after clarification (16/16)
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

No `contracts/` directory this iteration — see Summary and R-003/R-004: nothing here changes what any
endpoint accepts or returns, so there is no contract delta to write down. Naming that explicitly here
is the point, per this project's own recurring lesson about a claim left unstated rather than wrong
(`.claude/memory.md`'s Traps): "no API changes" is itself a plan-level decision, not a gap.

### Source Code (repository root)

No new tree, and — for the first time — no backend change at all.

```text
frontend/
├── components/map/
│   ├── MapView.tsx            # MODIFIED — selection state, easeTo/flyTo on select (FR-001, R-002),
│   │                           # overlap resolution on tap (FR-005, R-002)
│   ├── DestinationPin.tsx     # MODIFIED — a `selected` prop, drawn as a distinct treatment that is
│   │                           # not colour alone (FR-002), matching the shape-first rule `lib/map.ts`
│   │                           # already established for status
│   ├── PlaceConfirm.tsx       # NEW — the confirmation step (FR-006–FR-008): names the place and its
│   │                           # status, one action to open the full detail, dismissible
│   ├── DestinationSheet.tsx   # MODIFIED, substantially restructured — content and editable fields
│   │                           # both now branch on status (FR-009–FR-020) instead of showing every
│   │                           # field unconditionally; delegates to the three panels below
│   ├── VisitedPanel.tsx       # NEW — photographs + impressions as content, not form fields (FR-010)
│   ├── PlannedPanel.tsx       # NEW — own dates, Trip name/range, containment flag, currently-
│   │                           # traveling, sibling places, or an offer to attach a Trip (FR-011–FR-014)
│   ├── WishlistPanel.tsx      # NEW — the honest empty state (FR-015, FR-016)
│   ├── DestinationStrip.tsx   # MODIFIED — a strip tap still selects (so SC-001 holds regardless of
│   │                           # entry point) but opens the full detail directly, bypassing the
│   │                           # confirmation step (R-001 states why this is not a spec violation)
│   ├── TripPanel.tsx          # MODIFIED — its own `useTrips()` call is removed; it now receives
│   │                           # `trips`/`status`/`error`/`reload` as props from `MapShell` (R-003's
│   │                           # lift-up), so the map screen still issues exactly one Trips read
│   └── MapShell.tsx           # MODIFIED — threads selection/confirmation state between MapView,
│                               # PlaceConfirm, and DestinationSheet; now also calls `useTrips()`
│                               # itself (lifted up from TripPanel, R-003) and passes it to both
│                               # TripPanel and DestinationSheet
├── lib/
│   ├── map.ts                 # MODIFIED — `findOverlapGroup`/target-zoom geometry (R-002), a pure
│   │                           # function so it is tested the same way `disambiguateCoincidentPins` is
│   └── trips.ts                # UNCHANGED — `useTrips()` already loads what R-003 needs
└── tests/
    ├── e2e/place-selection.spec.ts   # NEW — User Stories 1–2 (FR-001–FR-008)
    ├── e2e/place-detail.spec.ts      # NEW — User Stories 3–5 (FR-009–FR-016)
    ├── e2e/place-status-form.spec.ts # NEW — User Story 6 (FR-017–FR-020), including FR-020's
    │                                  # always-saves-on-empty-field case — closing the automated-
    │                                  # coverage gap `003`'s retro left open for the status control
    └── client/map.spec.ts            # MODIFIED — the new geometry helpers, pure-function only
```

**Structure Decision**: everything lands inside the existing `frontend/components/map/` and
`frontend/lib/` trees `003` created — no new directory. `DestinationSheet.tsx` changes from one
combined form to a thin shell that branches on status and delegates to `VisitedPanel`/`PlannedPanel`/
`WishlistPanel`, the same "one file per concern" shape `TripPanel.tsx` already uses for its own
list/detail split (`TripList`/`TripDetail`).

## Complexity Tracking

*No entries.* Nothing here required a constitution exception. The one thing worth naming as a
**non**-violation: splitting `DestinationSheet.tsx` into a shell plus three panel components is not
abstraction ahead of need — the three panels already have a second caller each in the sense that
matters here, because FR-009 requires exactly three mutually-exclusive contents and a single file
branching three ways inline is what `TripPanel.tsx`'s own `TripList`/`TripDetail` split was already
chosen over.
