# Feature Specification: Travel Log

**Feature Branch**: `005-travel-log`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "A Travel Log (Activity Log) presenting places marked Visited, Planned, or Wishlist as a reverse-chronological timeline — status cue, name, date range, and trip context — so the owner can view their travel memory organized by time rather than only by location."

## Why this iteration, and what it deliberately does not build

`003-travel-map` shipped the world map and `004-place-detail-panel` rich place opening. While the map organizes memory spatially by place, a map cannot easily answer "what did I do, and in what order?" — a travel memory is remembered by time as much as by location.

This iteration adds the **Travel Log** surface: a reverse-chronological timeline of the owner's destinations.

**This iteration requires NO database schema changes or new columns**:
- Every field drawn already exists on `Destination` (`name`, `status`, `start_date`, `end_date`, `created_at`, `trip_id`).
- It is a second presentation of already-loaded client state, sharing the same architectural relationship `BacklogDrawer` has to the calendar grid.

**What it deliberately does not build**:
- **No hour-by-hour time scheduling**: Dates remain calendar days with no time of day (FR-023 in prior iterations).
- **No third-party social share / public link**: The archive remains strictly private to the single owner (Constitution Principle II).
- **No manual reordering or drag-to-reorder**: Items are strictly ordered by timeline date (`start_date DESC`, falling back to `created_at DESC`).
- **No new recorded fields**: Budget, companions, transport, ratings, and reviews remain out of scope for this iteration.

## Clarifications

### Session 2026-08-19

- **Q: How does the Travel Log surface coexist with the map?**
  **A: As an accessible panel/tab or drawer view within the main map screen.** On 375px viewports, the owner can toggle between the map view and the Travel Log timeline view seamlessly without losing filter or selection context.

- **Q: How are items ordered in the log?**
  **A: Reverse-chronological order.** Places with a `start_date` are ordered by `start_date DESC`. Places without a `start_date` (e.g., Wishlist items) are ordered by `created_at DESC` at the bottom or interleave deterministically.

- **Q: Does tapping an item in the Travel Log open its place detail?**
  **A: Yes.** Tapping a log item opens the same rich `DestinationSheet` established in `004`, and focuses/selects the place on the map.

## User Scenarios & Testing

### User Story 1 - View Travel Timeline in Order (Priority: P1)

The owner opens the Travel Log and sees all destinations listed in reverse-chronological order, grouped or labeled by date/period, so they can scan what they did and when.

**Why this priority**: Core value of the Travel Log — presenting travel memory by time.

**Independent Test**: Create destinations with different dates (Visited, Planned, Wishlist). Open the Travel Log and verify they appear ordered from newest date to oldest.

**Acceptance Scenarios**:
1. **Given** destinations with start dates exist, **When** the owner opens the Travel Log, **Then** places are displayed in reverse-chronological order by `start_date`.
2. **Given** a destination has a date range (start_date to end_date), **When** viewed in the log, **Then** the formatted date range is displayed clearly.
3. **Given** a destination belongs to a Trip, **When** viewed in the log, **Then** the Trip name is displayed as context.

---

### User Story 2 - Filter Log by Status (Priority: P1)

The owner can filter the Travel Log timeline by status (All, Visited, Planned, Wishlist) to focus on specific phases of their travel journey.

**Why this priority**: Allows quick filtering when the log grows long.

**Independent Test**: Toggle status filters in the Travel Log and confirm only matching destinations appear.

**Acceptance Scenarios**:
1. **Given** places of all three statuses exist, **When** the owner selects the "Visited" filter, **Then** only Visited places are displayed in the log.
2. **Given** a status filter is active, **When** the owner switches filters, **Then** the log updates immediately (<1s) using local client state.

---

### User Story 3 - Inspect & Focus Place from Log (Priority: P1)

Tapping a log entry opens its detail panel and focuses the place on the map.

**Why this priority**: Connects the chronological view back to the spatial map view.

**Independent Test**: Tap a destination entry in the Travel Log, confirm `DestinationSheet` opens for that place and the map centres on its pin.

**Acceptance Scenarios**:
1. **Given** the Travel Log is open, **When** the owner taps a place entry, **Then** its detail panel opens and the pin is marked selected on the map.

---

### Edge Cases

- What happens when a destination has no `start_date`? It is ordered by `created_at DESC` in the Wishlist section.
- What happens when the log is empty? An honest empty state explains that no places are logged yet and offers to add a place.
- What happens on narrow (375px) viewports? The log fits comfortably without horizontal scrolling, maintaining full touch targets (44px floor).

## Requirements

### Functional Requirements

- **FR-001**: The Travel Log MUST display all loaded destinations in reverse-chronological order (`start_date DESC`, then `created_at DESC`).
- **FR-002**: Each log entry MUST display the place's name, status cue (distinguishable without color alone), date range (if set), and Trip name (if attached).
- **FR-003**: The Travel Log MUST support filtering by status (`All`, `Visited`, `Planned`, `Wishlist`), synchronized with local client state.
- **FR-004**: Tapping a log entry MUST open the place's detail panel (`DestinationSheet`) and select/focus the pin on the map.
- **FR-005**: The Travel Log MUST display an honest empty state when no matching destinations exist.
- **FR-006**: The Travel Log MUST NOT require any new database columns or backend schema migrations.
- **FR-007**: The Travel Log layout MUST adhere to the 375px viewport floor with no horizontal body scroll.

### Key Entities

- **Place (`Destination`)**: Reuses existing `name`, `status`, `start_date`, `end_date`, `created_at`, `trip_id`.
- **Trip (`Trip`)**: Reuses existing `name` for contextual labelling.

## Success Criteria

- **SC-001**: The owner can scan all past and upcoming places in order of time without closing the timeline.
- **SC-002**: Filtering the log updates instantly (<1s) without a server round trip.
- **SC-003**: All surfaces are fully usable at 375px floor with minimum 44px tap targets.
- **SC-004**: Zero new columns or database tables added.

## Assumptions

- Uses local state from existing `useDestinations()` and `useTrips()` hooks.
- Mobile-first presentation at 375px.
