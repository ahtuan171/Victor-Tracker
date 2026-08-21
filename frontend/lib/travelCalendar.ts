import type { Destination } from "./api";
import type { DateOnly } from "./dates";

/**
 * Whether a Destination's own date range covers `date` (its home is `start_date`, optionally
 * through `end_date`). A Destination with no `start_date` never occurs on any day — most
 * Wishlist places have none, since "somewhere I want to go" carries no date yet, and a calendar
 * has nothing to place them on until one exists.
 *
 * String comparison, not `Date` arithmetic: `DateOnly` is `YYYY-MM-DD`, fixed-width and
 * big-endian, so lexicographic order already is chronological order (`lib/dates.ts`'s own
 * `compareDateOnly`).
 */
export function destinationOccursOn(destination: Destination, date: DateOnly): boolean {
  if (destination.start_date === null) return false;
  const end = destination.end_date ?? destination.start_date;
  return destination.start_date <= date && date <= end;
}

/** Every Destination occurring on `date`, in a stable id order so a cell's contents don't reorder themselves between renders. */
export function destinationsOnDay(
  destinations: readonly Destination[],
  date: DateOnly,
): readonly Destination[] {
  return destinations.filter((destination) => destinationOccursOn(destination, date)).sort((a, b) => a.id - b.id);
}
