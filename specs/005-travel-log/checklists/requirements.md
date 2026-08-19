# Requirements Checklist: Travel Log

**Spec**: [spec.md](../spec.md)

## Functional Requirements

- [x] **FR-001**: Reverse-chronological order (`start_date DESC`, `created_at DESC`)
- [x] **FR-002**: Entry display (name, status cue without color alone, date range, trip name)
- [x] **FR-003**: Status filtering (`All`, `Visited`, `Planned`, `Wishlist`)
- [x] **FR-004**: Tap log entry opens `DestinationSheet` and selects pin on map
- [x] **FR-005**: Honest empty state when no destinations match
- [x] **FR-006**: No schema changes or new DB columns
- [x] **FR-007**: 375px floor with no horizontal body scroll

## Success Criteria

- [x] **SC-001**: Scan places in order of time
- [x] **SC-002**: Instant filtering (<1s) using local client state
- [x] **SC-003**: Usable at 375px floor with 44px tap targets
- [x] **SC-004**: Zero new database columns or tables
