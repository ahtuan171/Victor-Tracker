"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { NavDrawer } from "@/components/arcade/NavDrawer";
import { getPreferences, type Destination, type DestinationStatus } from "@/lib/api";
import { today as readToday } from "@/lib/dates";
import { useDestinations } from "@/lib/destinations";
import { selectByStatus } from "@/lib/map";
import { setSoundEnabled } from "@/lib/sound";
import { reconcileTheme } from "@/lib/theme";
import { useTrips } from "@/lib/trips";

import { DestinationSheet } from "./DestinationSheet";
import { DestinationStrip } from "./DestinationStrip";
import { MapView, type MapViewHandle } from "./MapView";
import { QuickAdd } from "./QuickAdd";
import { StatusFilter } from "./StatusFilter";
import { TravelLogDrawer } from "./TravelLogDrawer";
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
  /** Lifted out of `TripPanel` (004, T016, R-003's lift-up) — `PlannedPanel` (T019) needs the
   * full Trip list too, and a second `useTrips()` there would issue a second, redundant
   * `GET /trips`. One call, passed down as props to whatever reads it. */
  const tripsStore = useTrips();
  const today = useSyncExternalStore(subscribeToNothing, readToday, readNoToday);
  const [openDestinationId, setOpenDestinationId] = useState<number | null>(null);
  const [tripsOpen, setTripsOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
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

  /**
   * Mount-time preference reconciliation — `lib/sound.ts` and `lib/theme.ts`'s own docstrings
   * both point at "`CalendarShell`'s existing reconciliation effect" as the caller, which was
   * true until Content Calendar was removed entirely (2026-08-22, the owner's instruction) and
   * left `getPreferences()` with no caller anywhere in the app. `MapShell` is `CalendarShell`'s
   * successor as the app's shell (this file's own header comment says so), so this is where that
   * effect belongs now, not a new decision. One `GET /preferences` read reconciles both: the
   * theme cookie against the account's own value (a no-op when they already agree), and the sound
   * toggle, which has no cookie at all and starts `false` until this resolves (FR-020). Failures
   * are swallowed — a preference that fails to load leaves the existing cookie-derived theme and
   * sound-off default in place, neither of which is wrong, only possibly stale.
   */
  useEffect(() => {
    void getPreferences()
      .then((preferences) => {
        reconcileTheme(preferences.theme);
        setSoundEnabled(preferences.sound_enabled);
      })
      .catch(() => {});
  }, []);

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
   * spec.md's own Edge Cases (004): "What happens when the selected place is filtered out by the
   * active status filter? The selection is cleared, because a panel describing a pin the owner
   * cannot see is a surface with no context." `setStatusFilter` alone does not discharge that —
   * `selectedId`/`confirmingId` are independent state, so a place could stay visually "selected"
   * (and the map still centred on it) with no pin left on screen to relate it to. This wrapper is
   * the one place that guarantee is actually kept, the same shape `dismissConfirmation` already is
   * for FR-004. `openDestinationId` is deliberately untouched here — same reasoning as `visible`
   * above: a sheet stays open on a place the owner has just filtered away rather than closing
   * itself mid-edit.
   */
  function changeStatusFilter(next: DestinationStatus | null): void {
    setStatusFilter(next);
    if (selectedId === null) return;
    const selected = destinations.find((d) => d.id === selectedId);
    if (next !== null && (selected === undefined || selected.status !== next)) {
      setSelectedId(null);
      setConfirmingId(null);
    }
  }

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
      <header className="border-hairline web-grain flex items-center justify-between gap-1.5 border-b px-2.5 pt-4 pb-2.5">
        <div>
          <p
            className="text-brand mb-1 text-xs leading-none font-semibold tracking-[0.2em] uppercase"
            data-testid="map-eyebrow"
          >
            Victor Tracker
          </p>
          <h1
            className="font-display text-xl leading-none font-bold tracking-wide uppercase"
            data-testid="map-title"
          >
            Travel Map
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsLogOpen(true)}
            className="border-hairline text-ink-mid focus-ring h-11 rounded-sm border px-2 text-xs font-semibold tracking-[0.05em] uppercase"
            data-testid="open-travel-log"
          >
            Collection
          </button>
          <button
            type="button"
            onClick={() => setTripsOpen(true)}
            className="border-hairline text-ink-mid focus-ring h-11 rounded-sm border px-2 text-xs font-semibold tracking-[0.05em] uppercase"
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
        <div className="border-hairline notch-card relative h-full overflow-hidden border shadow-e1">
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

          {/* One tap back to the world view (2026-08-21, owner-requested) — the alternative is
              scrolling/pinching back out by hand after a selection zooms in. Top-right, clear of
              `QuickAdd`'s own floating panel along the bottom edge. */}
          <button
            type="button"
            onClick={() => mapViewRef.current?.resetView()}
            className="border-hairline bg-surface-0/90 text-ink-mid focus-ring absolute top-2 right-2 z-10 flex h-11 w-11 items-center justify-center rounded-sm border text-lg shadow-e1"
            aria-label="Reset to world view"
            data-testid="map-reset-view"
          >
            ⌂
          </button>
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
      <StatusFilter status={statusFilter} onChange={changeStatusFilter} />

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
        allDestinations={destinations}
        trips={tripsStore.trips}
        onOpenChange={(open) => {
          if (!open) setOpenDestinationId(null);
        }}
        onUpdated={() => reload()}
        onDeleted={(id) => {
          setOpenDestinationId(null);
          // A deleted Destination — whether confirmed in this sheet or discovered as a 404 on its
          // own load (004, T034's E1 fix) — should not keep reading as "selected": a ring and a
          // scale-up around a pin that no longer exists is a ghost, not a place the owner can act
          // on. The same guard `changeStatusFilter` above already uses for the filtered-out case.
          if (selectedId === id) {
            setSelectedId(null);
            setConfirmingId(null);
          }
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
        trips={tripsStore.trips}
        status={tripsStore.status}
        error={tripsStore.error}
        reload={tripsStore.reload}
      />

      <TravelLogDrawer
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        destinations={destinations}
        trips={tripsStore.trips}
        onSelectDestination={(id) => {
          const dest = destinations.find((d) => d.id === id);
          if (dest) {
            openDestination(dest);
          }
        }}
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
