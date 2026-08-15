"use client";

/**
 * Trip state for `TripPanel` (T040, User Story 3).
 *
 * Same shape as `lib/destinations.ts`'s own `useDestinations` — one unparameterised read (FR-014:
 * no pagination, a personal number of trips) plus a `reload()` the panel calls after every create,
 * update, or delete. Kept read-only-plus-reload rather than optimistic: `TripPanel` is opened
 * deliberately (not a background surface), so a short round trip after a write is not the SC-005
 * budget problem it would be on the calendar's filter.
 */

import { useEffect, useState } from "react";

import { ApiError, listTrips, type Trip } from "./api";

export type TripsStatus = "loading" | "ready" | "error";

export interface TripsState {
  readonly trips: readonly Trip[];
  readonly status: TripsStatus;
  readonly error: string | null;
}

export const INITIAL_TRIPS_STATE: TripsState = {
  trips: [],
  status: "loading",
  error: null,
};

export interface TripsStore extends TripsState {
  readonly reload: () => void;
}

/** Load every Trip and hold it in state. */
export function useTrips(): TripsStore {
  const [state, setState] = useState<TripsState>(INITIAL_TRIPS_STATE);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let current = true;

    listTrips()
      .then((trips) => {
        if (current) setState({ trips, status: "ready", error: null });
      })
      .catch((error: unknown) => {
        if (current) {
          setState((previous) => ({
            trips: previous.trips,
            status: "error",
            error: messageFor(error),
          }));
        }
      });

    return () => {
      current = false;
    };
  }, [reloadCount]);

  return {
    ...state,
    reload: () => setReloadCount((count) => count + 1),
  };
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong loading your trips. Try again.";
}
