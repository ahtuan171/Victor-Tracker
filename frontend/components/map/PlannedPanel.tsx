"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import {
  ApiError,
  updateDestination,
  type Destination,
  type DestinationDetail,
  type Trip,
} from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { plannedPlaceContext } from "@/lib/map";
import { playCue } from "@/lib/sound";

/**
 * A Planned place's content: its own dates, the Trip it belongs to, and that Trip's other places
 * (004, T019, T020, FR-011–FR-014).
 *
 * `plannedPlaceContext` (T017) does the actual composition from state `MapShell` already loaded
 * (`allDestinations`, `trips`) — this component only renders what that function hands back, the
 * same division `VisitedPanel` draws between `DestinationSheet`'s fetch and its own rendering.
 *
 * ## With no Trip, this panel offers to attach one (T020, FR-014)
 *
 * Rather than an empty Trip section — the same "an offer, not a blank" shape FR-015 asks for on a
 * Wishlist place's whole panel (US5), applied here to one section instead of the panel as a
 * whole. The picker is sourced from the `trips` prop `MapShell` already loaded (T016) — no new
 * fetch — and the write is the existing `PATCH /destinations/{id}` (R-004), no new endpoint.
 */
export function PlannedPanel({
  detail,
  allDestinations,
  trips,
  today,
  setDetail,
  onUpdated,
}: {
  readonly detail: DestinationDetail;
  readonly allDestinations: readonly Destination[];
  readonly trips: readonly Trip[];
  readonly today: DateOnly | null;
  readonly setDetail: Dispatch<SetStateAction<DestinationDetail | null>>;
  readonly onUpdated: (destination: Destination) => void;
}) {
  const context = plannedPlaceContext(detail, allDestinations, trips, today);

  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  async function attachTrip(tripId: number): Promise<void> {
    if (attaching) return;

    setAttaching(true);
    setAttachError(null);
    try {
      const updated = await updateDestination(detail.id, { trip_id: tripId });
      playCue("save");
      setDetail((previous) => (previous === null ? previous : { ...previous, ...updated }));
      onUpdated(updated);
    } catch (error: unknown) {
      playCue("refuse");
      setAttachError(messageFor(error));
    } finally {
      setAttaching(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-ink-mid mb-1.5 block text-xs leading-none font-semibold tracking-[0.1em] uppercase">
          Dates
        </span>
        <p className="text-ink flex items-center gap-2 text-sm" data-testid="destination-planned-dates">
          {detail.start_date ?? "No start date"} – {detail.end_date ?? "no end date"}
          {context.currentlyTraveling ? (
            <span
              className="border-danger text-danger-hi rounded-sm border px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-[0.08em] uppercase"
              data-testid="destination-planned-traveling"
            >
              Traveling now
            </span>
          ) : null}
        </p>
      </div>

      <div>
        <span className="text-ink-mid mb-1.5 block text-xs leading-none font-semibold tracking-[0.1em] uppercase">
          Trip
        </span>

        {context.trip !== null ? (
          <>
            <p className="text-ink text-sm" data-testid="destination-planned-trip-name">
              {context.trip.name}
            </p>
            <p className="text-ink-lo text-xs" data-testid="destination-planned-trip-range">
              {context.trip.start_date} – {context.trip.end_date}
            </p>
            {context.outsideTripRange ? (
              <p
                role="alert"
                className="text-danger-hi mt-1.5 text-xs leading-relaxed"
                data-testid="destination-planned-outside-range"
              >
                This place&rsquo;s own dates fall outside the trip&rsquo;s range.
              </p>
            ) : null}

            {context.siblings.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-1.5" data-testid="destination-planned-siblings">
                {context.siblings.map((sibling) => (
                  <li
                    key={sibling.id}
                    className="border-hairline bg-surface-2 text-ink rounded-sm border px-2.5 py-1.5 text-xs"
                    data-testid={`destination-planned-sibling-${sibling.id}`}
                  >
                    {sibling.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-ink-lo text-xs" data-testid="destination-planned-no-trip">
              Not part of a Trip yet.
            </p>
            {trips.length > 0 ? (
              <select
                className="border-hairline bg-surface-3 text-ink focus-ring h-11 w-full rounded-sm border px-3 text-sm"
                value=""
                disabled={attaching}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  if (!Number.isNaN(id) && id > 0) void attachTrip(id);
                }}
                data-testid="destination-planned-attach-trip"
              >
                <option value="" disabled>
                  {attaching ? "Attaching…" : "Attach to a Trip…"}
                </option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name}
                  </option>
                ))}
              </select>
            ) : null}
            {attachError !== null ? (
              <p role="alert" className="text-danger-hi text-xs">
                {attachError}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong. Try again.";
}
