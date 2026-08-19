# Quickstart Verification: Travel Log

**Branch**: `005-travel-log` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

## Verification Scenarios

### V1: Reverse-Chronological Timeline Display
1. Sign in and navigate to `/map`.
2. Open the Travel Log toggle.
3. Verify places appear in reverse-chronological order by date (`start_date DESC`).
4. Verify each entry shows place name, status cue, date range, and Trip name if attached.

### V2: Status Filtering
1. In the Travel Log, tap status filter "Visited".
2. Confirm only Visited destinations appear.
3. Tap "Planned" and confirm only Planned destinations appear.
4. Tap "All" and confirm all destinations reappear.

### V3: Tap Log Entry to Focus Map and Open Detail
1. Tap a destination entry in the Travel Log.
2. Confirm the map camera eases to the destination's pin, marks it selected, and opens `DestinationSheet`.

### V4: Empty State
1. Filter by a status that has zero places.
2. Confirm the honest empty state message appears explaining no places match that filter.
