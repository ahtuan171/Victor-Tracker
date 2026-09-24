"use client";

import type { TravelEvent, Trip } from "@/lib/api";
import { daysBetween, type DateOnly } from "@/lib/dates";
import { formatDateRange } from "@/lib/period";
import { computeTripStats, sortTripsByStartDate } from "@/lib/schedule";
import { cn } from "@/lib/utils";

/**
 * §10's Trip Timeline: every Trip as a date-range entity, soonest-first, with its place/flight/
 * stay/event counts. Deliberately plain — §10 itself says "do not make the timeline overly
 * decorative; it is primarily an information hierarchy element", so this is a list of rows, not a
 * gantt chart.
 */
export function TripTimeline({
  trips,
  events,
  placesCountByTrip,
  today,
  highlightTripId,
  onOpenTrip,
}: {
  readonly trips: readonly Trip[];
  readonly events: readonly TravelEvent[];
  /** Destination count per Trip, from Module 01's own data — §16's "reuse place entities". */
  readonly placesCountByTrip: ReadonlyMap<number, number>;
  readonly today: DateOnly | null;
  readonly highlightTripId: number | null;
  readonly onOpenTrip: (trip: Trip) => void;
}) {
  const ordered = sortTripsByStartDate(trips);

  if (ordered.length === 0) {
    return (
      <section aria-label="Trip timeline" className="px-4 py-6 text-center" data-testid="trip-timeline-empty">
        <p className="text-ink text-sm font-semibold">No trips scheduled</p>
        <p className="text-ink-mid mt-1 text-xs leading-relaxed">Your next journey starts here.</p>
      </section>
    );
  }

  return (
    <section aria-label="Trip timeline" className="flex flex-col" data-testid="trip-timeline">
      <h2 className="text-ink-mid px-4 pt-4 pb-2 text-xs leading-none font-semibold tracking-[0.18em] uppercase">
        Trip timeline
      </h2>
      <ul className="flex flex-col">
        {ordered.map((trip, index) => {
          const stats = computeTripStats(trip.id, events, placesCountByTrip.get(trip.id) ?? 0);
          const phase = today === null ? null : tripPhase(trip, today);
          return (
            <li key={trip.id} className="border-hairline border-t">
              <button
                type="button"
                onClick={() => onOpenTrip(trip)}
                className={cn(
                  "focus-ring-inset hover:bg-surface-2 anim-fade-up flex w-full flex-col gap-1.5 px-4 py-3 text-left",
                  phase?.kind === "past" && "opacity-60",
                  highlightTripId === trip.id && "anim-flash",
                )}
                style={{ animationDelay: `${index * 40}ms` }}
                data-testid={`trip-timeline-row-${trip.id}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold tracking-[0.04em] uppercase">
                    {trip.destination ?? trip.name}
                  </span>
                  {phase !== null ? (
                    <span
                      className={cn(
                        "flex-none rounded-sm px-1.5 py-0.5 text-xs leading-none font-semibold tracking-[0.08em] uppercase",
                        phase.kind === "now" && "bg-brand text-white",
                        phase.kind === "soon" && "bg-brand/25 text-ink",
                        phase.kind === "past" && "text-ink-lo",
                      )}
                    >
                      {phase.label}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-mid text-xs">
                  {formatDateRange(trip.start_date, trip.end_date)}
                  {trip.destination !== null && trip.destination !== trip.name ? ` · ${trip.name}` : ""}
                </span>
                {phase?.kind === "now" ? (
                  <span className="bg-surface-3 block h-1 w-full overflow-hidden rounded-full" aria-hidden="true">
                    <span
                      className="bg-brand block h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${Math.round(phase.progress * 100)}%` }}
                    />
                  </span>
                ) : null}
                <span className="text-ink-mid flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>◆ {stats.places} {stats.places === 1 ? "place" : "places"}</span>
                  <span>✈ {stats.flights} {stats.flights === 1 ? "flight" : "flights"}</span>
                  <span>⌂ {stats.stays} {stats.stays === 1 ? "stay" : "stays"}</span>
                  <span>◇ {stats.events} {stats.events === 1 ? "event" : "events"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type TripPhase =
  | { readonly kind: "now"; readonly label: string; readonly progress: number }
  | { readonly kind: "soon"; readonly label: string }
  | { readonly kind: "past"; readonly label: string };

function tripPhase(trip: Trip, today: DateOnly): TripPhase {
  if (today > trip.end_date) return { kind: "past", label: "Done" };
  if (today >= trip.start_date) {
    const total = daysBetween(trip.start_date, trip.end_date) + 1;
    const day = daysBetween(trip.start_date, today) + 1;
    return { kind: "now", label: `Day ${day}/${total}`, progress: day / total };
  }
  const days = daysBetween(today, trip.start_date);
  return { kind: "soon", label: days === 1 ? "Tomorrow" : `In ${days} days` };
}
