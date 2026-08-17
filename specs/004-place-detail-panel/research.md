# Phase 0 Research: Opening a Place

**Feature**: `004-place-detail-panel` | **Date**: 2026-08-17 | **Plan**: [plan.md](./plan.md)

Four real unknowns, none of them a technology choice this project has not already made — `003` already
picked MapLibre and the request-shape precedent `001`'s R-007 established. What is genuinely new is how
those existing pieces compose for this iteration's specific behaviour.

---

## R-001 — Which component owns selection, confirmation, and detail — and whether the strip goes
through confirmation too

**Decision**: `MapShell` gains two pieces of state beyond today's single `openDestinationId` —
`selectedId` (drives the pin's visual treatment and the map's camera) and `confirmingId` (drives
whether `PlaceConfirm` is showing). A pin tap sets both `selectedId` and `confirmingId` to the same
place; `PlaceConfirm`'s one action clears `confirmingId` and sets `openDestinationId` (opening the
existing `DestinationSheet`, now restructured per R-... below); dismissing `PlaceConfirm` clears only
`confirmingId`, leaving `selectedId` and the map's position untouched (FR-004, FR-008).

**A tap on `DestinationStrip` sets `selectedId` and opens the full detail directly, skipping
`PlaceConfirm`.** This is a deliberate reading of spec.md's own reasoning for the confirmation step,
not a silent narrowing of it: the Clarifications session states the step exists "because pins overlap
on a crowded map" — a risk specific to a shield glyph among others at world zoom. A strip card is
already a named, unambiguous 44px row (`DestinationStrip.tsx`'s own docstring: "a full-width 44px
target for the same action"); requiring a second confirmation there would add friction with no
corresponding mis-tap risk to defend against. **`selectedId` still updates and the map still moves to
centre the place** (FR-001), so SC-001 ("the owner can still see which pin it belongs to") holds
identically regardless of which surface opened it — only the confirmation step's own purpose (guarding
against a crowded map) is what does not transfer to a surface that was never crowded.

**Rationale for the state split** (`selectedId` vs. `confirmingId` vs. `openDestinationId`, three
values instead of collapsing to one): FR-003 requires at most one place selected at a time, and FR-004
requires dismissing the confirmation to leave the map's position and the selection alone — but opening
the full detail from the same tap (the strip's path) must *not* first show, then instantly dismiss, a
confirmation step. Three independent pieces of state say exactly what each path does; collapsing them
would need a synthetic "skip confirmation" flag threaded through the one state value, which is a worse
shape for the same three behaviours.

**Alternatives considered**: showing `PlaceConfirm` from the strip too, for consistency. Rejected —
consistency is not free here; it would add a tap to a path that has no risk to guard against, which
this project's own SC-002 ("opening the wrong place costs at most one dismissal") does not require of
a surface where the wrong place was never in question.

---

## R-002 — Zooming to a selected place, and separating pins that overlap at the tapped zoom

**Decision**: `MapView` calls `map.easeTo({ center, zoom })` on selection, where `zoom` is either the
map's current zoom (if the tapped place has no other place within a "too close to tap separately"
screen-pixel radius of it) or a computed target zoom that separates them (FR-005). **The radius is
44px** — this product's own established tap-target floor (`.claude/rules/design.md`), reused rather
than inventing a second constant: two pins closer together than one tap target's own width are, by the
same reasoning that floor already encodes, not reliably separately tappable. The separation
check and the target-zoom computation are a **pure function in `lib/map.ts`**, not a live query against
the MapLibre instance — the same split `003`'s R-002 already drew ("assert the map through the DOM,
never through its canvas") extended one step further to geometry: Web Mercator's pixel-per-degree
scaling at a given zoom and latitude is closed-form arithmetic
(`256 * 2^zoom` world pixels, scaled by `cos(latitude)` for the Mercator stretch), so "are these two
points within N screen pixels of each other at zoom Z" and "what is the smallest Z that separates them"
are both computable with no map instance at all — which is what makes them testable in
`tests/client/map.spec.ts` the same way `disambiguateCoincidentPins` and `boundsForDestinations`
already are, with no headless-browser round trip per test case.

**No `essential: true` is passed to `easeTo`.** MapLibre GL JS (confirmed in the installed 6.3.0
package's own type definitions) automatically collapses `easeTo`/`flyTo` to an instant jump when the
browser reports `prefers-reduced-motion: reduce`, unless the call opts out with `essential: true`. A
decorative camera pan to a tapped pin is exactly the kind of motion that preference exists to suppress,
so this iteration inherits that behaviour for free rather than adding a bespoke branch — consistent
with how `app/globals.css`'s existing global rule already collapses this product's CSS-driven
animations for the same preference (`tests/e2e/reduced-motion.spec.ts`).

**Tests do not wait on animation completion.** `selectedId` updates synchronously with the tap, and
`DestinationPin`'s selected treatment (FR-002) renders immediately regardless of where the camera
currently is mid-ease — so Playwright assertions read the selected pin's `data-*` attributes and
`PlaceConfirm`'s content directly, the same "assert state, not animation timing" approach
`fitBoundsOnce`'s own `duration: 0` already uses for the unrelated initial-view case (`MapView.tsx`).

**Alternatives considered**: true marker clustering (a single synthetic marker standing in for several
places at low zoom, as `supercluster`-style libraries do). Rejected — nothing in `003` ever built
clustering, every place already gets its own real DOM marker at its own (possibly `003`-nudged)
coordinate, and FR-005's acceptance scenario is satisfied by zooming existing individual markers apart
rather than introducing a new marker type this iteration has no other reason to need.

---

## R-003 — A Planned place's Trip context, composed with no new endpoint

**Decision**: `PlannedPanel` reads `useDestinations()`'s already-loaded list (unchanged — `MapShell`
already calls this today) plus a **`useTrips()` call lifted up into `MapShell`**, both passed down as
props rather than fetched again. Given a Planned `DestinationDetail`, the panel finds
`trips.find((t) => t.id === destination.trip_id)` for the Trip's own name/range, and
`destinations.filter((d) => d.trip_id === destination.trip_id && d.id !== destination.id)` for the
sibling places (FR-011). `destination.outside_trip_range` (FR-012) and the currently-traveling
computation (`lib/map.ts`'s existing `isCurrentlyTraveling`, FR-013) are already present on every
`Destination` — `003` computes the first server-side on every response and the second is already a
pure client function. **No field on this list is missing; nothing here needs `GET /trips/{id}`.**

**The lift-up, stated precisely so it is not mistaken for a new request**: today, `useTrips()` is
called exactly once, inside `TripPanel.tsx` — `MapShell.tsx` itself has no Trip state at all. Moving
that one call up to `MapShell` and passing `trips`/`status`/`error`/`reload` down to both `TripPanel`
(as props, replacing its own internal call) and the new `PlannedPanel` (via `DestinationSheet`) is
**the same single unparameterised read, relocated one component higher** — not a second `useTrips()`
call running alongside the first. Two independent calls would silently double the request `TripPanel`
already made every time the map screen opens, which is exactly the cost R-007 exists to avoid; the
lift-up is what keeps this iteration's "no new round trip" claim (`plan.md`) true rather than merely
stated.

**Rationale**: this is `001`'s R-007 ("load once, narrow client-side") applied a third time in this
codebase, after `003`'s own `StatusFilter` reused it a second time (`tasks.md` T053). The same cost
argument applies again: a per-open request against a stack whose cold path `001`'s T072 measured in
tens of seconds is not worth paying when the data needed is already sitting in memory the moment
`MapShell` has loaded once. The handoff note going into this planning stage flagged this precedent as
"likely applies again — confirm rather than assume"; this section is that confirmation, with one
correction the confirmation itself surfaced (the lift-up above) rather than an assumption carried
through unchecked.

**A Trip with no Destinations passed down** (deleted mid-session on another device, e.g.) is handled by
the same `trips.find` returning `undefined` — `PlannedPanel` treats a missing Trip identically to
`trip_id === null` (FR-014's "offer to attach"), which is also this spec's Edge Cases answer for "a
Trip is deleted while one of its places is open."

**Alternatives considered**: a new `GET /trips/{id}` call from `PlannedPanel` on open, mirroring
`DestinationSheet`'s existing "fetch fresh detail on open" pattern for the place itself. Rejected —
that pattern exists for `Destination` because the *list* shape lacks `note`/`photographs`
(`DestinationSheet`'s own docstring: "detail is not derived from the list"); no such gap exists for
`Trip`, whose list shape (`Trip` in `lib/api.ts`) already carries everything `PlannedPanel` needs.

---

## R-004 — Attaching an existing place to a Trip (FR-014)

**Decision**: `PATCH /destinations/{id}` with `{ trip_id: <chosen id> }`, the exact endpoint and field
`003` already built for the opposite direction (detaching, FR-020 in `003`'s spec — sending
`trip_id: null`). The only new work is a picker UI sourced from the already-loaded `useTrips()` list,
not a new backend capability.

**Rationale**: `DestinationUpdate.trip_id` (`lib/api.ts`) already accepts `number | null`, and the
backend's update path (`003`'s `test_destinations.py`) already accepts either direction with no
validation beyond the Trip existing. Building a new "attach" endpoint would duplicate a capability the
existing `PATCH` already has.

---

## Post-research Constitution re-check

None of the four decisions above touches principle II (no new third-party request, no new disclosure),
principle III (no new capability, only legibility for the existing one), or principle VII (no schema
change). The Constitution Check table in `plan.md` is unchanged by this research.
