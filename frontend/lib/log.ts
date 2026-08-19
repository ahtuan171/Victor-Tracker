import type { Destination, DestinationStatus, Trip } from "./api";

/**
 * A single entry in the Travel Log timeline.
 */
export interface LogEntry {
  readonly destination: Destination;
  readonly tripName: string | null;
  readonly formattedDateRange: string | null;
  readonly status: DestinationStatus;
}

/**
 * Format a destination's start_date and end_date into a readable string (or null if none).
 * E.g., "2026-08-10 — 2026-08-15", "2026-08-10", or null.
 */
export function formatDestinationDateRange(destination: Destination): string | null {
  if (!destination.start_date) {
    return null;
  }
  if (!destination.end_date || destination.end_date === destination.start_date) {
    return destination.start_date;
  }
  return `${destination.start_date} — ${destination.end_date}`;
}

/**
 * Compare function for sorting destinations in reverse-chronological order for the Travel Log.
 * 1. Places with `start_date` are sorted by `start_date DESC`.
 * 2. Places without `start_date` fallback to `created_at DESC`.
 * 3. Tie-breaker by `id DESC`.
 */
export function compareLogOrder(a: Destination, b: Destination): number {
  const dateA = a.start_date || a.created_at;
  const dateB = b.start_date || b.created_at;

  if (dateA !== dateB) {
    return dateA > dateB ? -1 : 1;
  }
  return b.id - a.id;
}

/**
 * Convert a list of Destinations and Trips into ordered LogEntry objects.
 */
export function sortDestinationsForLog(
  destinations: readonly Destination[],
  trips: readonly Trip[],
): LogEntry[] {
  const tripMap = new Map<number, string>();
  for (const trip of trips) {
    tripMap.set(trip.id, trip.name);
  }

  const sorted = [...destinations].sort(compareLogOrder);

  return sorted.map((dest) => ({
    destination: dest,
    tripName: dest.trip_id !== null ? (tripMap.get(dest.trip_id) ?? null) : null,
    formattedDateRange: formatDestinationDateRange(dest),
    status: dest.status,
  }));
}

/**
 * Filter log entries by destination status ("all" | DestinationStatus).
 */
export function filterLogEntries(
  entries: readonly LogEntry[],
  statusFilter: "all" | DestinationStatus,
): LogEntry[] {
  if (statusFilter === "all") {
    return [...entries];
  }
  return entries.filter((entry) => entry.status === statusFilter);
}
