# Technical Research: Travel Log

**Branch**: `005-travel-log` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

## Research Topics & Findings

### R-001: Data Fetching and Schema Impact
- **Finding**: Zero database schema changes and zero new backend API endpoints required.
- **Reasoning**: `MapShell` already calls `useDestinations()` and `useTrips()`, maintaining the full list of destinations and trips in memory. The Travel Log is a client-side presentation layer over this state, identical to how `BacklogDrawer` presents `content_item` data on the calendar surface without adding queries.

### R-002: Sorting & Grouping Logic
- **Finding**: Travel Log entries must be ordered reverse-chronologically:
  1. Items with `start_date` are sorted `start_date DESC`.
  2. Items without `start_date` are sorted `created_at DESC` (e.g. Wishlist items).
  3. Tie-breaking is performed deterministically using `id DESC`.
- **Reasoning**: A pure helper function `sortDestinationsForLog(destinations: Destination[])` will be implemented in `frontend/lib/map.ts` (or `frontend/lib/log.ts`) and thoroughly unit-tested without needing DOM or API mocks.

### R-003: UI & Viewport Design
- **Finding**: On 375px viewports, the Travel Log presents as an accessible bottom drawer/panel overlaying the map, toggleable via a button on the map header or action band.
- **Reasoning**: Keeps the map as the base route while allowing thumb-reachable toggling between spatial (map pins) and temporal (travel log) views. Tap targets follow the strict 44px floor.

### R-004: Selection Seam Integration
- **Finding**: Tapping a log item calls `onSelectDestination(id)`, which triggers camera `easeTo` to the pin, marks `selectedId`, and opens `DestinationSheet`.
- **Reasoning**: Reuses the exact selection seam built in `004-place-detail-panel`, ensuring no duplicate sheet logic or camera movement bugs.
