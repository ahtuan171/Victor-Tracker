"use client";

import { useState } from "react";

import {
  ApiError,
  DESTINATION_STATUSES,
  createDestination,
  type DestinationStatus,
  type LocationCandidate,
} from "@/lib/api";
import { pinTreatment } from "@/lib/map";
import { playCue } from "@/lib/sound";
import { useTrips } from "@/lib/trips";
import { cn } from "@/lib/utils";

import { LocationSearch } from "./LocationSearch";

/**
 * Mark a new place on the map without opening a Trip first (T049, T050 — User Story 4,
 * FR-020–FR-022, SC-003).
 *
 * ## The three interactions, and why the search bar is always on screen
 *
 * SC-003 fixes this flow at **at most three interactions**, counted "from selecting or searching a
 * location to choosing its status", and the clarification behind it (spec.md, "Should marking a new
 * place carry a specific interaction budget") names them: *select or search a location, then choose
 * a status*. So the flow is:
 *
 * 1. **search** — type a place name and submit it,
 * 2. **select** — tap one of the candidates that come back,
 * 3. **choose a status** — which saves immediately.
 *
 * That budget is what decides this component's shape. It is **not** a sheet behind a `+ ADD`
 * button: opening one would spend an interaction before the first of the three named above, and
 * nothing in the flow could then be given up to pay for it — the location genuinely costs two
 * (this backend does not reverse-geocode, so a place must be searched *and* a candidate picked;
 * `backend/app/schemas.py`'s `DestinationCreate` states that outright), and the status choice is
 * the third by name. So the search input is simply always there.
 *
 * **There is no separate save step** (FR-022): the status tap *is* the save. An intermediate
 * confirmation is exactly what `design/003-travel-map/BRIEF.md` forbids under "Two interactions
 * already decided — do not redesign them".
 *
 * ## Why it floats over the map rather than sitting under it
 *
 * `MapView` installs no `ResizeObserver`, so a container that changes height would leave MapLibre's
 * canvas at its old size — a real defect, not a cosmetic one. Anchoring this panel over the map's
 * lower edge means the map's own box never changes, whatever this expands to. Growing **upward**
 * from `bottom` also puts the candidate list and the status row where the thumb already is, which
 * is what `.claude/rules/design.md` asks of a primary action at the 375px floor.
 *
 * ## Attaching to a Trip is a choice inside the flow, not a fourth step
 *
 * FR-021: the owner may attach the new place to an existing Trip "as one of that flow's choices, or
 * leave it unattached". So the Trip control sits beside the status row, defaulted to no Trip — the
 * three-interaction path never touches it, and using it costs one interaction the base flow does
 * not spend. `useTrips()` is called from `StatusStep` rather than from this component, so the read
 * happens when the owner picks a candidate rather than on every render of the map surface.
 */
export function QuickAdd({ onCreated }: { readonly onCreated: () => void }) {
  const [candidate, setCandidate] = useState<LocationCandidate | null>(null);

  return (
    <div
      className="border-hairline notch-card bg-surface-0/95 absolute inset-x-3 bottom-2 z-10 flex max-h-full flex-col gap-2 overflow-y-auto border p-2 shadow-e1"
      data-testid="quick-add"
    >
      {candidate === null ? (
        <>
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a ~3 KB local SVG, same
                reasoning as `IntelConsole.tsx`. Decorative: shooting a web is the closest thing
                this mascot's set has to "marking a new place", which is exactly this flow. */}
            <img src="/mascot/mascot-webshoot.svg" alt="" width={32} height={18} />
            <p className="text-ink-lo text-xs leading-none font-semibold tracking-[0.14em] uppercase">
              Mark a new place
            </p>
          </div>
          {/* Its own testid namespace: `TripPanel` mounts a second `LocationSearch`, and two
              instances sharing one set of testids is a Playwright strict-mode failure. */}
          <LocationSearch onSelect={setCandidate} testIdPrefix="quick-add-search" />
        </>
      ) : (
        <StatusStep
          candidate={candidate}
          onCancel={() => setCandidate(null)}
          onCreated={() => {
            setCandidate(null);
            onCreated();
          }}
        />
      )}
    </div>
  );
}

/**
 * Step 3: choose a status, which saves. Mounted only once a candidate exists, which is what keeps
 * `GET /trips` off the map's initial load.
 */
function StatusStep({
  candidate,
  onCancel,
  onCreated,
}: {
  readonly candidate: LocationCandidate;
  readonly onCancel: () => void;
  readonly onCreated: () => void;
}) {
  const { trips } = useTrips();
  const [tripId, setTripId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAs(status: DestinationStatus): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createDestination({
        name: candidate.name,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        status,
        // Omitted rather than sent as null when no Trip is chosen — `trip_id` is optional in the
        // contract (FR-020: a Destination MAY exist with no Trip), and the two spellings are the
        // same row here, but omission is what "not part of this flow" actually means.
        ...(tripId === null ? {} : { trip_id: tripId }),
      });
      playCue("save");
      onCreated();
    } catch (err: unknown) {
      playCue("refuse");
      // The panel stays open on the chosen candidate, so a refused save costs the owner neither
      // their search nor their place — the same rule the capture sheet follows for a refused
      // create (`frontend/AGENTS.md`).
      setError(err instanceof ApiError ? err.detail : "Could not mark that place. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="quick-add-status-step">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-semibold" data-testid="quick-add-name">
            {candidate.name}
          </p>
          <p className="text-ink-mid truncate text-xs">{candidate.address}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="border-hairline text-ink-mid focus-ring h-9 shrink-0 rounded-sm border px-3 text-xs font-semibold tracking-[0.08em] uppercase"
          data-testid="quick-add-cancel"
        >
          Back
        </button>
      </div>

      {/* FR-021. `TripPanel` already treats `TripStatus` as descriptive text that "drives no pin",
          so a plain select naming each Trip is the whole control this needs. */}
      <label className="flex items-center gap-2">
        <span className="text-ink-lo flex-none text-xs font-semibold tracking-[0.14em] uppercase">
          Trip
        </span>
        <select
          value={tripId === null ? "" : String(tripId)}
          onChange={(event) =>
            setTripId(event.target.value === "" ? null : Number(event.target.value))
          }
          className="border-hairline bg-surface-3 text-ink focus-ring h-11 min-w-0 flex-1 rounded-sm border px-2 text-sm"
          data-testid="quick-add-trip"
        >
          <option value="">No trip</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name}
            </option>
          ))}
        </select>
      </label>

      {error === null ? null : (
        <p role="alert" className="text-danger-hi text-xs" data-testid="quick-add-error">
          {error}
        </p>
      )}

      {/* The third interaction. Each button saves on its own tap — no confirmation between the
          choice and the pin (FR-022). */}
      <div
        role="group"
        aria-label="Mark this place as"
        className="flex gap-1.5"
        data-testid="quick-add-status-group"
      >
        {DESTINATION_STATUSES.map((status) => {
          const treatment = pinTreatment(status);
          return (
            <button
              key={status}
              type="button"
              disabled={saving}
              onClick={() => void markAs(status)}
              data-testid={`quick-add-status-${status}`}
              className={cn(
                "focus-ring flex h-11 flex-1 items-center justify-center rounded-sm border text-xs font-semibold tracking-[0.08em] uppercase disabled:opacity-50",
                treatment.borderClass,
                treatment.textClass,
                "bg-surface-2",
              )}
            >
              {treatment.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
