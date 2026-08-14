"use client";

/**
 * Destination state for the map surface (T017, research.md R-007).
 *
 * Read-only at this phase: User Story 1 only needs to **load** every Destination and hand it to
 * `MapView`. The pure-functions-plus-thin-hook split `lib/items.ts` establishes stays the
 * pattern — this is the same shape, deliberately smaller, because Phase 3 has no write path yet
 * (create lands at T042's Trip flow, update/delete at T023–T025's `DestinationSheet`). Extending
 * this hook with optimistic create/update/delete when those land is the natural next step, not a
 * second data-fetching strategy invented alongside it.
 *
 * One unparameterised read, same reasoning as `useContentItems`'s own calendar-wide load: the
 * map draws every Destination regardless of Trip membership (FR-001, FR-019), so there is no
 * narrower request to make, and `StatusFilter` (T052–T053, Phase 7) narrows this same loaded
 * list client-side rather than re-fetching — R-007's "load once, narrow in memory" applied here
 * for the identical reason it protects the calendar's SC-005 filter budget.
 */

import { useEffect, useState } from "react";

import { ApiError, listDestinations, type Destination } from "./api";

export type DestinationsStatus = "loading" | "ready" | "error";

export interface DestinationsState {
  readonly destinations: readonly Destination[];
  readonly status: DestinationsStatus;
  /** A sentence safe to render. Null whenever `status` is not `"error"`. */
  readonly error: string | null;
}

export const INITIAL_DESTINATIONS_STATE: DestinationsState = {
  destinations: [],
  status: "loading",
  error: null,
};

export interface DestinationsStore extends DestinationsState {
  /** Re-read from the server. Keeps the current list visible while it runs. */
  readonly reload: () => void;
}

/** Load every Destination and hold it in state. */
export function useDestinations(): DestinationsStore {
  const [state, setState] = useState<DestinationsState>(INITIAL_DESTINATIONS_STATE);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    // Guards the response, not the request — the same reason `useContentItems` needs this: an
    // unmounted component receiving a state update is React's classic warning, and a slow first
    // response landing after a fast reload would otherwise show stale data as current.
    let current = true;

    listDestinations()
      .then((destinations) => {
        if (current) setState({ destinations, status: "ready", error: null });
      })
      .catch((error: unknown) => {
        if (current) {
          setState((previous) => ({
            destinations: previous.destinations,
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

/**
 * A sentence to show a human, from anything that was thrown — the identical helper
 * `lib/items.ts` keeps for the same reason: `ApiError.detail` is safe verbatim (the contract
 * makes every error body a single string), and anything else is a bug rather than a server
 * response.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong loading your map. Try again.";
}
