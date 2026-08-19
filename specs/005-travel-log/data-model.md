# Data Model: Travel Log

**Branch**: `005-travel-log` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

## Schema Changes

**NO SCHEMA CHANGES.** No new tables, columns, constraints, or Alembic migrations exist in this iteration.

## Derived View Model

### `LogEntry`

Derived client-side from `Destination` and optional `Trip`:

```typescript
export interface LogEntry {
  destination: Destination;
  tripName: string | null;
  formattedDateRange: string | null;
  status: DestinationStatus;
}
```

### Ordering Rule

Given array `destinations: Destination[]`:
- Sort key 1: `start_date` if present, else null (nulls last or in Wishlist section).
- Sort key 2: `created_at DESC`.
- Sort key 3: `id DESC` (tie-breaker).
