"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import { NavDrawer } from "@/components/arcade/NavDrawer";
import type { Destination, DestinationStatus } from "@/lib/api";
import { today as readToday } from "@/lib/dates";
import { useDestinations } from "@/lib/destinations";
import { selectByStatus } from "@/lib/map";

import { DestinationSheet } from "./DestinationSheet";
import { DestinationStrip } from "./DestinationStrip";
import { MapView, type MapViewHandle } from "./MapView";
import { QuickAdd } from "./QuickAdd";
import { StatusFilter } from "./StatusFilter";
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
  const [statusFilter, setStatusFilter] = useState<DestinationStatus | null>(null);
  /**
   * The one place `MapView` draws as selected and centres its camera on (004, T003/T004, FR-002,
   * FR-003).
   */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /**
   * The place `PlaceConfirm` is naming (004, T009, FR-006–FR-008, User Story 2). A pin tap sets
   * both this and `selectedId` together — selecting and confirming are one gesture from here on,
   * which is what retires the old "pin tap opens the full sheet directly" behaviour T004 preserved
   * only as an interim step. `DestinationStrip`'s own tap handler (T010) still opens the full
   * detail directly, bypassing this — a strip card is already unambiguous, so there is no mis-tap
   * for a confirmation step to guard against there.
   */
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  /** `MapView`'s imperative escape hatch (004, T010) — lets `openDestination` below move the
   * camera the same way a pin tap does, from a caller (`DestinationStrip`) that is `MapView`'s
   * sibling rather than its child. */
  const mapViewRef = useRef<MapViewHandle>(null);

  /*
   * T053, User Story 5: the filter narrows the **loaded** list, and both surfaces that draw
   * Destinations read the narrowed one — so the pins and the strip can never disagree about what
   * is on the map. `openDestinationId` is deliberately not looked up here: `DestinationSheet`
   * fetches its own detail by id, so a sheet stays open on a Destination the owner has just
   * filtered away rather than closing itself mid-edit (`CalendarShell`'s own "anything that
   * displays a set takes the narrowed list; anything that acts on a row takes the whole one"
   * rule, `frontend/AGENTS.md`).
   */
  const visible = selectByStatus(destinations, statusFilter);

  /**
   * `DestinationStrip`'s own tap handler (004, T010) — a strip card is already unambiguous
   * (R-001), so unlike a pin tap it skips `confirmingId` and opens the full detail directly. It
   * still selects the place and moves the camera to it (via `mapViewRef`), so the pin the owner
   * just tapped a card for is the one left highlighted and centred once the sheet is dismissed.
   */
  function openDestination(destination: Destination): void {
    setSelectedId(destination.id);
    mapViewRef.current?.focusDestination(destination.id);
    setOpenDestinationId(destination.id);
  }

  /**
   * A pin tap (004, T009): selects the place **and** shows the confirmation step over it — the two
   * happen together now, unlike the strip's own direct-open path (T010).
   */
  function selectDestination(destination: Destination): void {
    setSelectedId(destination.id);
    setConfirmingId(destination.id);
  }

  /**
   * Dismissing the confirmation step (FR-008: nothing about the place changes — true here by
   * construction, since this touches only local UI state) also clears the selection itself, not
   * only the confirmation surface. FR-004 (User Story 1) is explicit that dismissing a selection
   * "MUST... leave no place selected" — `PlaceConfirm` is the only dismiss gesture this product
   * has, so this is the one place that guarantee is actually discharged.
   */
  function dismissConfirmation(): void {
    setConfirmingId(null);
    setSelectedId(null);
  }

  const confirmingDestination =
    confirmingId === null ? null : (destinations.find((d) => d.id === confirmingId) ?? null);

  /** `PlaceConfirm`'s "Open" action (004, T009 follow-up): closes the confirmation card and opens
   * the full detail on the same place. */
  function openConfirmedDestination(): void {
    if (confirmingDestination === null) return;
    setConfirmingId(null);
    setOpenDestinationId(confirmingDestination.id);
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

      {/*
       * The map is **inset, not full-bleed** — the owner's 2026-08-15 direction, taken from the
       * reference product: a bordered viewport with a band of real controls underneath, rather
       * than a map filling the screen edge to edge. `min-h-0` is what lets it shrink against the
       * strip below instead of pushing it off a 375x667 screen (`frontend/AGENTS.md`'s `h-dvh`
       * rule, one level down).
       */}
      <main className="relative min-h-0 flex-1 px-3 pt-3 pb-2" aria-busy={status === "loading"}>
        <div className="border-hairline notch-card h-full overflow-hidden border shadow-e1">
          <MapView
            ref={mapViewRef}
            destinations={visible}
            today={today}
            selectedId={selectedId}
            onSelectDestination={selectDestination}
            confirmingDestination={confirmingDestination}
            onOpenConfirmed={openConfirmedDestination}
            onDismissConfirmation={dismissConfirmation}
          />
        </div>

        {/* T049-T050, User Story 4. Anchored over the map's lower edge: `MapView` installs no
            `ResizeObserver`, so a container whose height changed would leave MapLibre's canvas at
            its old size. Floating keeps the map's own box constant, and puts it in thumb reach.
            No longer suppressed while a place is being confirmed (004, T009 follow-up) —
            `PlaceConfirm` moved into `MapView`'s own popup, anchored at the pin instead of this
            edge, so the two no longer compete for the same region. */}
        <QuickAdd onCreated={reload} />
      </main>

      {/* T052: below the map and above the strip — the bottom portion of a 375x667 screen, which
          is what `.claude/rules/design.md` means by thumb reach, and the same departure from where
          a design draws a filter that `PlatformFilter` already makes on the calendar. */}
      <StatusFilter status={statusFilter} onChange={setStatusFilter} />

      <DestinationStrip
        destinations={visible}
        today={today}
        onOpenDestination={openDestination}
      />

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
