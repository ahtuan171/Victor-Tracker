"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import type * as MapLibreGL from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { Destination } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import {
  DEFAULT_MAP_VIEW,
  boundsForDestinations,
  disambiguateCoincidentPins,
  resolveOverlap,
} from "@/lib/map";

import { DestinationPin } from "./DestinationPin";
import { PlaceConfirm } from "./PlaceConfirm";

/**
 * The map surface (T014, FR-003, FR-004, T019, T020).
 *
 * A full-bleed MapLibre GL instance against CARTO's free dark-matter basemap
 * (`tech-defaults.md`'s "The map" — no API key, and its `AttributionControl` discharges the
 * tile-attribution licence term automatically, confirmed by the pre-planning spike
 * `frontend/AGENTS.md` records). Sits inside `Frame` the same way `/calendar` does — this
 * component only has to fill `h-full` from its parent, not establish its own viewport height.
 *
 * ## `maplibre-gl` is imported dynamically, once, inside the mount effect
 *
 * Next.js server-renders a `"use client"` component's module for the initial HTML, and
 * MapLibre's own module touches `window`/`document` at points a static top-level import would
 * reach during that server pass. A dynamic `import()` inside `useEffect` guarantees the module
 * only loads once this component is actually mounted in a browser, and it code-splits a fairly
 * large dependency away from every route that is not this one.
 *
 * **The resolved module is kept in a ref (`maplibreRef`), not re-imported per marker.** An
 * earlier version called `import("maplibre-gl")` again inside the marker-creation loop; dynamic
 * `import()` does cache the module after the first load, but resolving that promise is still
 * asynchronous, and two `syncMarkers` calls close enough together (a fast `destinations` update
 * arriving before the previous marker's promise had resolved) could each find no existing marker
 * for the same id and create two. Reading the module synchronously from a ref set once at mount
 * removes the race entirely — `syncMarkers` never runs before `maplibreRef.current` is set,
 * because nothing calls it until the mount effect's own `.then()` has already done so.
 *
 * The CSS import above is safe static: it carries no JavaScript, only a stylesheet the bundler
 * inlines.
 *
 * ## Markers are real DOM nodes, each holding its own React root
 *
 * `research.md` R-002's spike finding is why: a canvas-rendered symbol layer can only be
 * asserted through a pixel read, and `canvas.getImageData()` reads back zeros for a real,
 * genuinely-painted MapLibre canvas (cross-origin tile textures taint it for 2D readback) even
 * with `preserveDrawingBuffer` on. A `maplibregl.Marker` wraps an arbitrary HTML element, so
 * `DestinationPin` renders into a real, Playwright-queryable DOM node instead — "assert the map
 * through the DOM ... never through its canvas" (`frontend/AGENTS.md`), now with a spike-proven
 * reason rather than a hunch.
 *
 * One `createRoot` per Destination, kept alive across re-renders and only unmounted when that
 * Destination leaves the list — remounting a fresh root on every render would leak the previous
 * one and flash the marker's DOM node.
 *
 * ## Near-overlapping pins (T020, User Story 1 scenario 3)
 *
 * Each Destination is placed at its **own real coordinates** — a `maplibregl.Marker` is anchored
 * to a `LngLat`, and MapLibre's projection is continuous, so two markers at genuinely distinct
 * points always separate visually as the owner zooms in, however close together they start.
 * Scenario 3's own wording accepts "zooming in" as sufficient disambiguation. The one case that
 * needs help is **exact** coincidence — two Destinations sharing the identical coordinate, which
 * no amount of zooming would ever separate — and `lib/map.ts`'s `disambiguateCoincidentPins`
 * nudges those apart by a small, deterministic offset before markers are placed.
 *
 * ## The empty-map state (T019, User Story 1 scenario 2)
 *
 * With no Destinations, the map still renders — centred on `lib/map.ts`'s `DEFAULT_MAP_VIEW`, a
 * reasonable world-scale view tied to no real place — with a message inviting the owner to add
 * their first one. No working "add a place" control yet: Quick Add (T049–T051) and Trip
 * organising (T036–T042) are later phases, so this phase's empty state is informational only —
 * a button that does nothing would be the "wasted tap target" `Frame.tsx`'s own rivets already
 * avoid.
 */
interface MapViewProps {
  readonly destinations: readonly Destination[];
  /** Null until the browser's clock is read (research.md R-006 addendum) — passed straight
   * through to `DestinationPin` for the "Currently Traveling" overlay. */
  readonly today: DateOnly | null;
  /** `MapShell`'s selection state (004, T003) — threaded to each `DestinationPin` so at most one
   * ever draws as selected (FR-003). */
  readonly selectedId?: number | null;
  /**
   * Tapping a pin (004, T004, FR-001, FR-005): brings the map to that place and reports the
   * selection up to `MapShell`, which is what actually holds `selectedId`. This component owns
   * the camera move itself — only it holds `mapRef` — and computes the overlap-aware target zoom
   * via `resolveOverlap` before calling `map.easeTo`. Deliberately separate from
   * `onOpenDestination` below: selecting a place and opening its full detail are two different
   * gestures as of this iteration (User Story 1 vs. User Story 2's confirmation step).
   */
  readonly onSelectDestination?: (destination: Destination) => void;
  /**
   * Optional and unwired in this phase — `DestinationSheet` (T029, User Story 2) is what will
   * pass this. See `DestinationPin`'s own docstring for why the pin is a real button regardless.
   */
  readonly onOpenDestination?: (destination: Destination) => void;
  /**
   * The Destination `PlaceConfirm` is naming, if any (004, T009 follow-up). Owned by `MapShell`
   * alongside `selectedId`, but **rendered here**, not by the caller — the confirmation card is a
   * `maplibregl.Popup` anchored to this Destination's own coordinate rather than a fixed-position
   * bar (so it reads as attached to the pin, matching the interaction the owner pointed at), and
   * only this component holds `mapRef`/`maplibreRef` to attach one.
   */
  readonly confirmingDestination: Destination | null;
  /** `PlaceConfirm`'s one action (FR-007): requests the full detail for the confirming place. */
  readonly onOpenConfirmed: () => void;
  /** `PlaceConfirm`'s dismiss action (FR-008): the confirmation closes, nothing else changes. */
  readonly onDismissConfirmation: () => void;
}

/**
 * Imperative escape hatch for a caller that selects a Destination **without** going through a
 * pin's own click handler (004, T010) — `DestinationStrip`'s tap is the one case: it is a sibling
 * of `MapView`, not a child, so it cannot reach `mapRef` any other way. `focusDestination` runs
 * the identical camera-move `buildOnOpen` uses (`easeToDestination` below), so a strip tap and a
 * pin tap bring the map to the same place the same way — only whether `PlaceConfirm` appears
 * differs, and that is `MapShell`'s decision (T009 vs. T010), not this component's.
 *
 * `resetView` is the same shape for the opposite direction (2026-08-21, owner-requested): a
 * one-tap way back to the world view after zooming into a place, rather than scrolling/pinching
 * out by hand.
 */
export interface MapViewHandle {
  focusDestination(destinationId: number): void;
  resetView(): void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  {
    destinations,
    today,
    selectedId = null,
    onSelectDestination,
    onOpenDestination,
    confirmingDestination,
    onOpenConfirmed,
    onDismissConfirmation,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const maplibreRef = useRef<typeof MapLibreGL | null>(null);
  const markersRef = useRef<Map<number, MarkerEntry>>(new Map());
  const confirmPopupRef = useRef<ConfirmPopupEntry | null>(null);
  const hasFitBoundsRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      focusDestination(destinationId: number) {
        const map = mapRef.current;
        if (map === null) return;
        const placed = disambiguateCoincidentPins(destinations);
        const target = placed.find((destination) => destination.id === destinationId);
        if (target === undefined) return;
        easeToDestination(map, target, placed);
      },
      resetView() {
        const map = mapRef.current;
        if (map === null) return;
        map.easeTo({
          center: [DEFAULT_MAP_VIEW.center[0], DEFAULT_MAP_VIEW.center[1]],
          zoom: DEFAULT_MAP_VIEW.zoom,
        });
      },
    }),
    [destinations],
  );

  /**
   * Flips once the async `import("maplibre-gl")` below has resolved and `mapRef.current` is set
   * — **not** read by anything, only used to force the sync/fit-bounds effects below to run
   * again once the map exists.
   *
   * This is not decorative. An earlier version had the mount effect call `syncMarkers` directly
   * inside the `.then()`, passing the `destinations`/`today` it closed over at mount time — and
   * `useDestinations()` starts with an **empty** array before its own fetch resolves (T017), so
   * that closure's `destinations` was `[]` whenever the real list arrived *after* the map
   * finished constructing, which loading a ~1MB dynamic import against a fast stubbed fetch made
   * the common case, not the rare one. The separate sync effect (below) already reads fresh
   * props on every render, but with no state change to re-trigger it once the map became ready,
   * it never got a second chance to run — the markers were simply never created.
   * `tests/e2e/map.spec.ts` is what caught it: every test asserting more than a bare canvas
   * screenshot failed with zero pins found.
   */
  const [isMapReady, setIsMapReady] = useState(false);

  // Mount the map once. Cleanup tears down every marker's root before removing the map itself,
  // so `root.unmount()` runs against a DOM node that still exists.
  useEffect(() => {
    if (containerRef.current === null) return;

    let cancelled = false;
    // Captured once, rather than read as `markersRef.current` inside the cleanup below: the ref
    // holds one `Map` instance for this component's whole lifetime (mutated in place by
    // `syncMarkers`, never reassigned), so this is the identical object either way — capturing it
    // is what tells the `react-hooks/exhaustive-deps` lint that cleanup is not reading a
    // *different* value than the effect set up, since the rule cannot see "mutated in place".
    const markers = markersRef.current;

    void import("maplibre-gl").then((module) => {
      if (cancelled || containerRef.current === null) return;

      maplibreRef.current = module;

      // **Required, and its absence is close to invisible** — see
      // `scripts/copy-maplibre-worker.mjs` for the full diagnosis. Turbopack emits MapLibre's
      // worker and the shared chunk it imports under *hashed* names without rewriting the
      // worker's own `from "./maplibre-gl-shared.mjs"`, so the worker 404s on its own import and
      // dies at creation. Everything fetched on the main thread (style, sprite, tiles.json) still
      // loads, so the map reports healthy and renders markers over a **totally black canvas** —
      // vector tiles are the only thing the worker fetches. Pointing this at the copies in
      // `public/maplibre/`, whose names are unhashed, is what makes the relative import resolve.
      module.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      const map = new module.Map({
        container: containerRef.current,
        style: CARTO_DARK_MATTER_STYLE,
        center: [DEFAULT_MAP_VIEW.center[0], DEFAULT_MAP_VIEW.center[1]],
        zoom: DEFAULT_MAP_VIEW.zoom,
        // Explicit rather than omitted, because the tile attribution string is a licence term
        // (`tech-defaults.md`) and this line is what makes rendering it non-negotiable. `{}`
        // rather than `true`: MapLibre's own type is `false | AttributionControlOptions`, and an
        // empty options object is the "on, with defaults" spelling.
        attributionControl: {},
      });
      mapRef.current = map;

      // Deliberately no `syncMarkers`/`fitBoundsOnce` call here — see `isMapReady`'s own
      // docstring for why that used to be a race, and why setting this state is what lets the
      // effects below run against current props instead of a stale closure.
      setIsMapReady(true);
    });

    return () => {
      cancelled = true;
      for (const entry of markers.values()) {
        entry.marker.remove();
        entry.root.unmount();
      }
      markers.clear();
      if (confirmPopupRef.current !== null) {
        confirmPopupRef.current.popup.remove();
        unmountPopupRoot(confirmPopupRef.current.root);
        confirmPopupRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
      setIsMapReady(false);
    };
    // Deliberately mount-once: this effect no longer reads `destinations`/`today`/
    // `onOpenDestination` at all (see `isMapReady`'s docstring for why it used to, and why that
    // was the bug) — the effects below read them fresh on every change instead.
  }, []);

  // Keep markers in sync with the loaded Destinations, without recreating the map. Runs both on
  // every Destination-list change *and* the one time `isMapReady` flips true, which is what
  // covers the case where the list already changed before the map finished constructing.
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (map === null || maplibregl === null) return;
    syncMarkers(
      maplibregl,
      map,
      markersRef.current,
      destinations,
      today,
      selectedId,
      onSelectDestination,
      onOpenDestination,
    );
  }, [isMapReady, destinations, today, selectedId, onSelectDestination, onOpenDestination]);

  /**
   * Show/update/remove the confirmation callout as a `maplibregl.Popup` anchored to the
   * confirming Destination's own coordinate (004, T009 follow-up — replaces the earlier
   * full-width bottom bar). MapLibre repositions a `Popup` on every pan/zoom by itself, the same
   * reason pins are plain `maplibregl.Marker` instances rather than something this component
   * would have to re-project by hand on every camera move.
   *
   * Anchors at the **same, possibly-nudged** coordinate `syncMarkers` placed the pin at
   * (`disambiguateCoincidentPins`), so the callout never floats over open water while its own pin
   * sits nudged apart from an exact coincidence with another Destination.
   *
   * `anchor: "bottom"` puts the popup's own tip at the given coordinate and the card itself
   * *above* it — the "floats over the pin" placement the owner asked for, as opposed to the
   * retired bar anchored to the map's own lower edge.
   */
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (map === null || maplibregl === null) return;

    if (confirmingDestination === null) {
      if (confirmPopupRef.current !== null) {
        confirmPopupRef.current.popup.remove();
        unmountPopupRoot(confirmPopupRef.current.root);
        confirmPopupRef.current = null;
      }
      return;
    }

    const placed = disambiguateCoincidentPins(destinations);
    const target = placed.find((d) => d.id === confirmingDestination.id) ?? confirmingDestination;
    const lngLat: [number, number] = [target.longitude, target.latitude];

    const existing = confirmPopupRef.current;
    if (existing === null || existing.destinationId !== confirmingDestination.id) {
      existing?.popup.remove();
      if (existing !== null) unmountPopupRoot(existing.root);

      const element = document.createElement("div");
      const root = createRoot(element);
      root.render(
        <PlaceConfirm
          destination={confirmingDestination}
          onOpen={onOpenConfirmed}
          onDismiss={onDismissConfirmation}
        />,
      );

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        anchor: "bottom",
        offset: 28,
        maxWidth: "none",
        className: "place-confirm-popup",
      })
        .setLngLat(lngLat)
        .setDOMContent(element)
        .addTo(map);

      confirmPopupRef.current = { popup, root, destinationId: confirmingDestination.id };
      return;
    }

    existing.popup.setLngLat(lngLat);
    existing.root.render(
      <PlaceConfirm
        destination={confirmingDestination}
        onOpen={onOpenConfirmed}
        onDismiss={onDismissConfirmation}
      />,
    );
  }, [isMapReady, destinations, confirmingDestination, onOpenConfirmed, onDismissConfirmation]);

  // Fit the view to every Destination the first time they become available (T019) — not on every
  // change afterward, which would yank the owner's own pan/zoom around every time a new place is
  // added from a later phase's Quick Add or Trip flow. `isMapReady` in the deps for the same
  // reason the sync effect above needs it: the list can already be loaded before the map is.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    fitBoundsOnce(map, hasFitBoundsRef, destinations);
  }, [isMapReady, destinations]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map-canvas" className="h-full w-full" />

      {destinations.length === 0 ? (
        <div
          className="pointer-events-none absolute inset-x-4 bottom-6 flex justify-center"
          data-testid="map-empty-state"
        >
          <p className="border-hairline bg-surface-1/90 text-ink-mid notch-card max-w-xs border px-4 py-3 text-center text-sm leading-relaxed shadow-e1">
            No places marked yet. Search or organise a Trip to add your first one.
          </p>
        </div>
      ) : null}
    </div>
  );
});

/** CARTO's free dark-matter basemap, no API key (`tech-defaults.md`'s "The map"). */
const CARTO_DARK_MATTER_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface MarkerEntry {
  readonly marker: MapLibreGL.Marker;
  readonly root: Root;
}

/** One live `PlaceConfirm` popup at a time — `destinationId` is what lets the popup effect tell
 * "still confirming the same place, just re-render" apart from "confirming a different one, tear
 * down and recreate at the new coordinate". */
interface ConfirmPopupEntry {
  readonly popup: MapLibreGL.Popup;
  readonly root: Root;
  readonly destinationId: number;
}

/**
 * Unmount a popup's React root on the next tick rather than synchronously.
 *
 * Calling `root.unmount()` straight from the effect above is what React 19 warns as "Attempted to
 * synchronously unmount a root while React was already rendering" — observed while switching
 * `confirmingDestination` between two places in quick succession (a real sequence: tapping one
 * pin's confirmation, then another's, before the first has settled). The unmount is still real and
 * still runs before the next popup for a *different* destination would reuse the DOM node — it is
 * simply deferred past the render pass that's asking for it, which is the documented workaround for
 * a `createRoot` root nested inside another component's own render/commit cycle.
 */
function unmountPopupRoot(root: Root): void {
  setTimeout(() => root.unmount(), 0);
}

/**
 * Reconcile the map's markers against the current Destination list.
 *
 * Not a React component's own render — this runs imperatively against `maplibregl.Marker`
 * instances, so it is a plain function rather than JSX, kept here (not inlined in the effects
 * above) because both the mount effect and the update effect need the identical logic on the
 * identical `markersRef` map. `maplibregl` is passed in rather than imported here — see this
 * module's docstring for why a second dynamic import per call would race.
 */
function syncMarkers(
  maplibregl: typeof MapLibreGL,
  map: MapLibreGL.Map,
  markers: Map<number, MarkerEntry>,
  destinations: readonly Destination[],
  today: DateOnly | null,
  selectedId: number | null,
  onSelectDestination: ((destination: Destination) => void) | undefined,
  onOpenDestination: ((destination: Destination) => void) | undefined,
): void {
  const placed = disambiguateCoincidentPins(destinations);
  const nextIds = new Set(placed.map((destination) => destination.id));

  for (const [id, entry] of markers) {
    if (nextIds.has(id)) continue;
    entry.marker.remove();
    entry.root.unmount();
    markers.delete(id);
  }

  for (const destination of placed) {
    // Spread rather than `onOpen={onOpen}`: under `exactOptionalPropertyTypes`, an explicit
    // `undefined` is not the same as an omitted prop, and `DestinationPin.onOpen` is typed
    // `?: () => void` (no `| undefined`). Omitting the key entirely when there is nothing to
    // pass is what that flag requires — see `frontend/AGENTS.md`'s `ContentItemUpdate` note.
    const onOpen = buildOnOpen(map, destination, placed, onSelectDestination, onOpenDestination);
    const pinProps = onOpen === undefined ? {} : { onOpen };

    const existing = markers.get(destination.id);

    const selected = destination.id === selectedId;

    if (existing === undefined) {
      const element = document.createElement("div");
      const root = createRoot(element);
      root.render(
        <DestinationPin destination={destination} today={today} selected={selected} {...pinProps} />,
      );

      // `Marker`'s own default anchor (`center`) puts the pin's centre on the coordinate, which
      // is correct for this shield: it has no separate "tip" the way a teardrop marker would.
      const marker = new maplibregl.Marker({ element })
        .setLngLat([destination.longitude, destination.latitude])
        .addTo(map);

      markers.set(destination.id, { marker, root });
      continue;
    }

    existing.root.render(
      <DestinationPin destination={destination} today={today} selected={selected} {...pinProps} />,
    );
    existing.marker.setLngLat([destination.longitude, destination.latitude]);
  }
}

/**
 * The pin's click handler (004, T004): selects the tapped Destination, brings the map to it, and
 * — while User Story 2's confirmation step does not exist yet — still opens the full detail
 * directly, exactly as it does today.
 *
 * The camera move reads `map.getZoom()` **inside this closure**, i.e. at tap time rather than at
 * the last `syncMarkers` call — the owner may have panned or zoomed freely between syncs, and
 * `resolveOverlap` needs the zoom the tap actually happened at, not a stale one from whenever
 * markers last reconciled. `essential` is deliberately omitted from the `easeTo` call: MapLibre
 * collapses an inessential camera move to an instant jump under `prefers-reduced-motion: reduce`
 * on its own (research.md R-002) — this function does not need to branch on that preference
 * itself.
 *
 * Returns `undefined` when there is nothing to wire up, so `syncMarkers` can omit the `onOpen` key
 * entirely under `exactOptionalPropertyTypes` rather than pass an explicit `undefined`.
 *
 * ## Selecting always zooms in to at least a close, local-area view
 *
 * `resolveOverlap` alone only *raises* the zoom when the tapped place is genuinely too close to
 * another to tap separately — at a wide, zoomed-out view with nothing nearby, it hands back the
 * current zoom unchanged (its own contract, `tests/client/map.spec.ts`). FR-001 asks selection to
 * "bring the map to that place", and staying at a world- or country-scale zoom does not read as
 * that. `MINIMUM_SELECTION_ZOOM` is a second, independent floor applied with `Math.max` *after*
 * `resolveOverlap`'s own answer — deliberately not folded into `resolveOverlap` itself, which stays
 * a pure overlap-detector with its own exact-value tests unaffected by this.
 */
function buildOnOpen(
  map: MapLibreGL.Map,
  destination: Destination,
  allDestinations: readonly Destination[],
  onSelectDestination: ((destination: Destination) => void) | undefined,
  onOpenDestination: ((destination: Destination) => void) | undefined,
): (() => void) | undefined {
  if (onSelectDestination === undefined && onOpenDestination === undefined) return undefined;

  return () => {
    if (onSelectDestination !== undefined) {
      easeToDestination(map, destination, allDestinations);
      onSelectDestination(destination);
    }
    onOpenDestination?.(destination);
  };
}

/**
 * The camera move a selection always performs: overlap-aware zoom-in (`resolveOverlap`) floored
 * at `MINIMUM_SELECTION_ZOOM`, centred on the Destination's own (possibly nudged-apart)
 * coordinate. Shared between `buildOnOpen` (a pin's own tap) and `focusDestination` (`MapViewHandle`,
 * a caller outside the map — `DestinationStrip`, 004 T010) so the two selection paths bring the
 * map to a place the identical way.
 */
function easeToDestination(
  map: MapLibreGL.Map,
  destination: Destination,
  allDestinations: readonly Destination[],
): void {
  const resolution = resolveOverlap(destination, allDestinations, map.getZoom());
  map.easeTo({
    center: [destination.longitude, destination.latitude],
    zoom: Math.max(resolution.targetZoom, MINIMUM_SELECTION_ZOOM),
  });
}

/**
 * The zoom "bring the map to that place" (FR-001) settles on — close enough to read as an actual
 * approach rather than a recentre at whatever zoom the owner happened to be at, while keeping
 * enough of the surrounding area legible that the selected place still reads in context.
 *
 * **Moved several times on real owner feedback against real places** (004's T009 follow-up first
 * raised it to 16 for a genuine "approach" feel; it read as street-level-tight in practice and
 * came back to 14; 14 still read close in a dense delta region and came down to 10; 10 was still
 * closer than wanted and this landed on **7**, a wide-country/multi-province view, 2026-08-21).
 * `resolveOverlap` is untouched by any of this — its own exact-value tests
 * (`tests/client/map.spec.ts`, T006) hold regardless of this constant's value. See git blame for
 * the full history if this needs tuning again.
 */
const MINIMUM_SELECTION_ZOOM = 7;

/** Fit the view to every Destination, once, the first time the list is non-empty (T019). */
function fitBoundsOnce(
  map: MapLibreGL.Map,
  hasFitBounds: { current: boolean },
  destinations: readonly Destination[],
): void {
  if (hasFitBounds.current) return;

  const bounds = boundsForDestinations(destinations);
  if (bounds === null) return;

  hasFitBounds.current = true;
  // MapLibre's own `LngLatBoundsLike` wants a mutable tuple; `bounds` is `lib/map.ts`'s
  // `readonly [...]`, so this copies rather than widening the type away.
  map.fitBounds([bounds[0], bounds[1], bounds[2], bounds[3]], {
    padding: 48,
    maxZoom: 12,
    duration: 0,
  });
}
