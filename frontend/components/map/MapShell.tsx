"use client";

import { useState, useSyncExternalStore } from "react";

import { NavDrawer } from "@/components/arcade/NavDrawer";
import type { Destination } from "@/lib/api";
import { today as readToday } from "@/lib/dates";
import { useDestinations } from "@/lib/destinations";

import { DestinationSheet } from "./DestinationSheet";
import { MapView } from "./MapView";
import { TripPanel } from "./TripPanel";

/**
 * The map surface's shell (T017, FR-001, FR-019) — the same role `CalendarShell` plays for
 * Content Calendar: it owns the data load and the header, `MapView` owns the map itself.
 *
 * `useDestinations()` (T017) is the one unparameterised read — every Destination, regardless of
 * Trip membership, matching `useContentItems`'s own "load once, narrow in memory" shape
 * (research.md R-007, `lib/destinations.ts`'s own docstring).
 *
 * `today` follows `CalendarShell`'s exact pattern: `useSyncExternalStore` rather than
 * `useEffect` + `useState`, because `dates.today()` throws outside the browser on purpose
 * (research.md R-006 addendum) and this avoids both a hydration-mismatch render and the "set
 * state from an effect" pattern React 19's compiler lint flags. `null` on the server and during
 * hydration; the creator's own day afterwards.
 */
export function MapShell() {
  const { destinations, status, error, reload } = useDestinations();
  const today = useSyncExternalStore(subscribeToNothing, readToday, readNoToday);
  const [openDestinationId, setOpenDestinationId] = useState<number | null>(null);
  const [tripsOpen, setTripsOpen] = useState(false);

  function openDestination(destination: Destination): void {
    setOpenDestinationId(destination.id);
  }

  return (
    <div className="bg-surface-0 text-ink relative flex h-full flex-col overflow-hidden">
      <header className="border-hairline web-grain flex items-center justify-between gap-3 border-b px-4 pt-5 pb-3">
        <div>
          <p
            className="text-brand mb-1.5 text-xs leading-none font-semibold tracking-[0.24em] uppercase"
            data-testid="map-eyebrow"
          >
            Victor Tracker
          </p>
          <h1
            className="font-display text-[27px] leading-none font-bold tracking-wide uppercase"
            data-testid="map-title"
          >
            Travel Map
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTripsOpen(true)}
            className="border-hairline text-ink-mid focus-ring h-11 rounded-sm border px-3 text-xs font-semibold tracking-[0.1em] uppercase"
            data-testid="open-trips"
          >
            Trips
          </button>
          <NavDrawer />
        </div>
      </header>

      {status === "error" ? (
        <p
          id="map-error"
          role="alert"
          className="border-danger-hi text-danger-hi m-4 border-l-4 px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <main className="min-h-0 flex-1" aria-busy={status === "loading"}>
        <MapView destinations={destinations} today={today} onOpenDestination={openDestination} />
      </main>

      {/*
       * T029-T032, User Story 2: tapping a pin opens this sheet. `reload()` on both an update and
       * a delete rather than threading an optimistic patch through `useDestinations` — this list
       * is small (constitution VII, a personal number of destinations) and a full reload keeps
       * the pin's own status/position/traveling-overlay derivation in exactly one place, `MapView`
       * itself, rather than a second copy here.
       */}
      <DestinationSheet
        destinationId={openDestinationId}
        today={today}
        onOpenChange={(open) => {
          if (!open) setOpenDestinationId(null);
        }}
        onUpdated={() => reload()}
        onDeleted={() => {
          setOpenDestinationId(null);
          reload();
        }}
      />

      {/* T036-T037, T040, T042-T043, User Story 3: create/organise Trips, add Destinations to
          one by search. Reloads the map's own destinations whenever a Trip write could change
          what pins exist (adding a Destination, or a cascade delete). */}
      <TripPanel
        open={tripsOpen}
        onOpenChange={setTripsOpen}
        onDestinationsChanged={() => reload()}
      />
    </div>
  );
}

/** `useSyncExternalStore`'s subscribe argument — nothing subscribes, same as `CalendarShell`'s
 * own `subscribeToNothing`: the calendar day does not change under the creator mid-session in a
 * way this surface needs to react to. */
function subscribeToNothing(): () => void {
  return () => {};
}

function readNoToday(): null {
  return null;
}
