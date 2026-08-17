# Phase 1 Data Model: Opening a Place

**Feature**: `004-place-detail-panel` | **Date**: 2026-08-17 | **Plan**: [plan.md](./plan.md)

**No new table, column, or enum value.** Spec.md's Key Entities section says so explicitly — "No new
entities, and no new attributes on the existing ones" — and this document exists to confirm that
statement against the actual schema rather than let it stand as an assertion. FR-022 makes it a
requirement, not a preference.

---

## Existing entities this iteration reads and writes

Both are `003-travel-map`'s tables, unchanged. Full column definitions live in
[`003-travel-map/data-model.md`](../003-travel-map/data-model.md); only what this iteration touches is
restated here.

### `destination` (spec.md's "Place")

| Column | Used by this iteration for |
|---|---|
| `name`, `latitude`, `longitude` | FR-001 (camera target), the confirmation step's naming (FR-006) |
| `status` | FR-009's branch — which of `VisitedPanel`/`PlannedPanel`/`WishlistPanel` renders, and FR-017's branch — which fields the editing form asks for |
| `start_date`, `end_date` | FR-011 (own dates in the Planned panel), FR-013 (currently-traveling, via the existing `isCurrentlyTraveling`), FR-018 (asked for when moving to Planned) |
| `trip_id` | FR-011/FR-014 (which Trip, or the offer to attach one); written by R-004's existing `PATCH` |
| `note` | FR-010 — this **is** spec.md's "impressions" (Clarifications, resolved), not a new field |
| `photographs` (via `DestinationDetail`) | FR-010, FR-019 |
| `outside_trip_range` (computed on every response, not stored) | FR-012, read as-is |

No column is written by any new code path this iteration adds beyond what `PATCH /destinations/{id}`
already accepted before this iteration — R-004 confirms `trip_id`'s attach direction was already legal.

### `trip` (spec.md's "Trip")

| Column | Used by this iteration for |
|---|---|
| `name`, `start_date`, `end_date` | FR-011 — shown in the Planned panel, read via the already-loaded `useTrips()` (R-003) |
| `status` | **Not read anywhere in this iteration** — restated from spec.md's Clarifications and Assumptions, and worth carrying into this document because it is the one column on either table this iteration deliberately ignores. |

---

## Derived view data (frontend-only, not persisted)

Three shapes exist only in `frontend/`, computed from the two tables above, and are documented here
because FR-011's "the panel shows X" requirements each name a composition, not a single field.

### Selection state (`MapShell`)

```ts
interface PlaceSelectionState {
  readonly selectedId: number | null;    // FR-001–FR-005 — drives the pin's visual treatment and the map's camera
  readonly confirmingId: number | null;  // FR-006–FR-008 — drives PlaceConfirm
  readonly openDestinationId: number | null; // unchanged from today — drives DestinationSheet
}
```

Not a new entity — a UI state triple, gone on page reload, matching `003`'s existing `openDestinationId`
in shape (`MapShell.tsx` already holds one of these three).

### A Planned place's Trip context (`PlannedPanel`, R-003)

```ts
interface PlannedPlaceContext {
  readonly trip: Trip | null;                    // null → FR-014's "offer to attach"
  readonly siblings: readonly Destination[];      // same trip_id, excluding this place
  readonly outsideTripRange: boolean;             // Destination.outside_trip_range, as-is
  readonly currentlyTraveling: boolean;           // lib/map.ts's isCurrentlyTraveling(), as-is
}
```

Computed by a pure function taking `(destination, allDestinations, allTrips)` — no fetch, no new
request, per R-003. Testable in `tests/client/map.spec.ts` with plain arrays, the same way
`disambiguateCoincidentPins` is tested today.

### Overlap-resolution geometry (`lib/map.ts`, R-002)

```ts
interface OverlapResolution {
  readonly overlapping: boolean;
  readonly targetZoom: number; // unchanged from the map's current zoom when `overlapping` is false
}
```

Pure Web Mercator arithmetic over `(tappedDestination, allDestinations, currentZoom, mapWidthPx)` — no
MapLibre instance required to compute it, only to apply it (`map.easeTo`).

---

## State Transitions

Unchanged from `003`. FR-020 restates `003`'s FR-028 rather than adding a new rule: any of the three
`destination.status` values is reachable from either other, at any time, and this iteration's own
status-branched form (FR-017–FR-019) never blocks that — a save with an empty newly-asked field simply
leaves that field unset (Clarifications, Session 2026-08-17).

## Constitution VII check

No new column on either table, so there is nothing here for principle VII's "no speculative owner
column" rule to catch — the same PASS `003`'s own INV-2 recorded, unchanged because nothing changed.
