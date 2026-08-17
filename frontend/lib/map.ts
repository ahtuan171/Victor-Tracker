/**
 * How a Destination's status is encoded as a map pin, and the "Currently Traveling" overlay
 * (T015, FR-002, FR-026, research.md R-004).
 *
 * This module is the single definition of the pin encoding, the same split `lib/status.ts`
 * already established for Content Calendar's status cue — it holds no geometry, only data, so
 * `DestinationPin.tsx` (T016) owns drawing it and `tests/client/map.spec.ts` (T054) can assert
 * the encoding with no renderer at all (`tech-defaults.md` rules out Jest/RTL at v0.1).
 *
 * ## The encoding itself
 *
 * `design/003-travel-map/BRIEF.md`'s audit findings (panel `1d`), not invented here: a **shield
 * silhouette**, not Content Calendar's circle, carrying the same outline → half-filled → solid
 * progression `001`'s status pipeline established, for house consistency — but deliberately not
 * copied onto a circle, so a pin never reads as a calendar chip. Confirmed separable in
 * greyscale (`1b`), so hue is decoration exactly as `lib/status.ts` already states for Content
 * Calendar.
 *
 * ## "Currently Traveling" is computed here, never stored
 *
 * research.md R-004: no `currently_traveling` column exists. It is derived the same way Content
 * Calendar's `isOverdue` is (`lib/items.ts`) — from the browser's own `today()` compared against
 * a **Planned** Destination's `start_date`/`end_date` — and takes `today` as a parameter for the
 * identical reason `isOverdue` does: `dates.today()` throws outside the browser
 * (research.md R-006 addendum), so `null` has to be a first-class "not known yet" answer rather
 * than a call this module makes for itself.
 */

import type { Destination, DestinationStatus } from "./api";
import { isBeforeDateOnly, type DateOnly } from "./dates";

/** One status's pin encoding. Everything `DestinationPin` needs except how big it draws. */
export interface DestinationPinTreatment {
  readonly status: DestinationStatus;
  /** The accessible name — a shape announces as nothing at all to a screen reader. */
  readonly label: string;
  /** The greyscale-surviving half of the encoding — see this module's docstring. */
  readonly fill: "outline" | "half" | "solid";
  /** The glyph drawn inside the shield, one per status, never a fourth. */
  readonly glyph: "check" | "caret" | "star";
  /** Tailwind classes naming the token, never a hex — `app/globals.css` is the only file allowed
   * to contain one. */
  readonly borderClass: string;
  readonly fillClass: string;
  readonly textClass: string;
}

/**
 * The three statuses' encodings, keyed by status so a caller cannot index this with a string the
 * contract does not define — `DESTINATION_STATUSES` in `lib/api.ts` is checked against
 * `openapi.yaml` by `tests/contract/api-types.spec.ts`, so this record inherits that guarantee.
 */
export const DESTINATION_PIN_TREATMENTS: Readonly<Record<DestinationStatus, DestinationPinTreatment>> =
  {
    visited: {
      status: "visited",
      label: "Visited",
      fill: "solid",
      glyph: "check",
      borderClass: "border-status-visited",
      fillClass: "bg-status-visited",
      textClass: "text-status-visited",
    },
    planned: {
      status: "planned",
      label: "Planned",
      fill: "half",
      glyph: "caret",
      borderClass: "border-status-planned",
      fillClass: "bg-status-planned",
      textClass: "text-status-planned",
    },
    wishlist: {
      status: "wishlist",
      label: "Wishlist",
      fill: "outline",
      glyph: "star",
      borderClass: "border-status-wishlist",
      fillClass: "bg-status-wishlist",
      textClass: "text-status-wishlist",
    },
  };

export function pinTreatment(status: DestinationStatus): DestinationPinTreatment {
  return DESTINATION_PIN_TREATMENTS[status];
}

/**
 * Whether a Destination should carry the "Currently Traveling" overlay right now (FR-002,
 * research.md R-004).
 *
 * **Only a Planned Destination is ever eligible** — data-model.md's state diagram draws this as
 * an overlay layered on `planned` alone, never on `visited` or `wishlist`, regardless of what
 * dates either of those carries. A Destination with no date range is never "currently
 * traveling": there is nothing to compare `today` against.
 *
 * Both bounds are **inclusive**, matching how a calendar day range is normally read: a trip
 * starting and ending today is traveling today.
 *
 * `today` is a parameter rather than read internally, for the identical reason `lib/items.ts`'s
 * `isOverdue` takes it as one: `dates.today()` throws outside the browser on purpose
 * (research.md R-006 addendum), so this function must not be the thing that calls it — `null` is
 * a first-class "not known yet" answer, and nothing is "currently traveling" before the
 * browser's own clock has been read.
 */
export function isCurrentlyTraveling(destination: Destination, today: DateOnly | null): boolean {
  if (today === null) return false;
  if (destination.status !== "planned") return false;
  if (destination.start_date === null || destination.end_date === null) return false;

  return !isBeforeDateOnly(today, destination.start_date) && !isBeforeDateOnly(destination.end_date, today);
}

// --- Filtering by status (T053, User Story 5, FR-010) -------------------------------------------

/**
 * Narrow a loaded list of Destinations to a single status, or return it whole for `null` (T053,
 * FR-010).
 *
 * The direct sibling of `lib/items.ts`'s `selectByPlatform`, deliberately down to its shape: a
 * pure function over an already-loaded array, `null` meaning "every status" rather than "no
 * status". Both surfaces this feeds — `MapView`'s pins and `DestinationStrip`'s cards — read the
 * same narrowed list, so they can never disagree about what is on the map.
 *
 * ## This narrows loaded state; it never becomes a request
 *
 * `useDestinations()` issues one unparameterised read (FR-001, FR-019 — the map draws every
 * Destination whatever its Trip membership), and this is what a filter change costs: one array
 * pass, no round trip. Sending a status to `GET /destinations` instead would put a request behind
 * every toggle on a stack whose cold path T072 measured in tens of seconds, which is the exact
 * cost R-007 rejected for the calendar's own filter (`.claude/memory.md`'s Deferred section holds
 * the numbers). `tests/e2e/map.spec.ts` asserts the request count does not move when the filter
 * does, the same guard `platform-filter.spec.ts` keeps for Content Calendar.
 *
 * Ordering needs no sort: the array arrives in the server's own total order and `filter`
 * preserves it.
 */
export function selectByStatus(
  destinations: readonly Destination[],
  status: DestinationStatus | null,
): readonly Destination[] {
  if (status === null) return destinations;
  return destinations.filter((destination) => destination.status === status);
}

// --- Near-overlapping pins (T020, User Story 1 scenario 3) --------------------------------------

/**
 * Nudge Destinations that share **exactly** the same coordinates apart by a small, deterministic
 * offset, so two truly coincident pins are never permanently unreachable from each other.
 *
 * **Two Destinations at genuinely distinct coordinates need no help, however close.** MapLibre's
 * projection is continuous, so the screen-space distance between two different points grows as
 * the owner zooms in, however small the real distance is — scenario 3's own wording permits
 * "zooming in" as the disambiguation, and real markers anchored at their own real coordinates
 * already provide it for free. The one case that wording does not cover is **exact** coincidence
 * (e.g. the same search result geocoded and saved twice): identical coordinates project onto the
 * identical screen point at every zoom level, so no amount of zooming would ever separate them
 * without this.
 *
 * Deterministic by index, not random: the same list of Destinations always produces the same
 * offsets, which is what makes this testable without a map and stable across re-renders. The
 * radius (~7m at the equator) is small enough that a nudged pin still reads as "here" at any
 * zoom the map's own minimum allows, and large enough to separate at the map's maximum zoom.
 */
export function disambiguateCoincidentPins(
  destinations: readonly Destination[],
): readonly Destination[] {
  const seenAt = new Map<string, number>();

  return destinations.map((destination) => {
    const key = `${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`;
    const occurrence = seenAt.get(key) ?? 0;
    seenAt.set(key, occurrence + 1);

    if (occurrence === 0) return destination;

    const angle = (occurrence * 2 * Math.PI) / COINCIDENT_PIN_FAN_OUT;
    return {
      ...destination,
      latitude: destination.latitude + COINCIDENT_PIN_OFFSET_DEGREES * Math.sin(angle),
      longitude: destination.longitude + COINCIDENT_PIN_OFFSET_DEGREES * Math.cos(angle),
    };
  });
}

/** How many coincident pins fan out before the offset angle repeats. Plenty for a real account. */
const COINCIDENT_PIN_FAN_OUT = 8;

/** ~7m at the equator (1 degree of latitude is ~111km) — separable at any zoom, negligible at any. */
const COINCIDENT_PIN_OFFSET_DEGREES = 0.00006;

// --- Initial view (T019, User Story 1 scenario 2) ------------------------------------------------

/** A `[west, south, east, north]` bounding box, the shape MapLibre's `fitBounds` takes. */
export type LngLatBounds = readonly [number, number, number, number];

/**
 * The map's default view when there is nothing to fit to — a reasonable world-scale centre,
 * never tied to any real Destination (User Story 1 scenario 2's empty-map state). `zoom` is low
 * enough that the whole inhabited world is visible without panning.
 */
export const DEFAULT_MAP_VIEW: { readonly center: readonly [number, number]; readonly zoom: number } = {
  center: [10, 20],
  zoom: 1.2,
};

/**
 * A bounding box containing every Destination, or `null` for an empty list — the caller's cue to
 * fall back to `DEFAULT_MAP_VIEW` rather than fit to nothing (T019).
 *
 * A single Destination produces a box of zero width and height, which `MapView` still hands to
 * `fitBounds` — MapLibre pads a degenerate box out to a reasonable single-point zoom on its own,
 * so no special case is needed here for "exactly one place marked".
 */
export function boundsForDestinations(destinations: readonly Destination[]): LngLatBounds | null {
  if (destinations.length === 0) return null;

  let west = destinations[0]!.longitude;
  let east = destinations[0]!.longitude;
  let south = destinations[0]!.latitude;
  let north = destinations[0]!.latitude;

  for (const destination of destinations) {
    west = Math.min(west, destination.longitude);
    east = Math.max(east, destination.longitude);
    south = Math.min(south, destination.latitude);
    north = Math.max(north, destination.latitude);
  }

  return [west, south, east, north];
}

// --- Selection zoom and overlap resolution (T001, FR-001, FR-005, research.md R-002) --------------

/** The outcome of checking whether a tapped Destination is too close to another to tap separately. */
export interface OverlapResolution {
  readonly overlapping: boolean;
  /** Unchanged from the current zoom when `overlapping` is `false`. */
  readonly targetZoom: number;
}

/**
 * The screen-pixel radius under which two pins are considered too close to tap separately —
 * this product's own 44px tap-target floor (`.claude/rules/design.md`), reused rather than
 * inventing a second constant (research.md R-002).
 */
const OVERLAP_RADIUS_PX = 44;

/** Web Mercator's world size in pixels at zoom 0 — the shared 256px-tile convention every slippy
 * map (MapLibre included) builds its zoom levels on. */
const WORLD_PX_AT_ZOOM_0 = 256;

/** How far `resolveOverlap` will zoom in searching for separation, so two destinations placed at
 * the exact same coordinate (already nudged apart by `disambiguateCoincidentPins` before this ever
 * runs) cannot spin the search past what a real map ever zooms to. */
const MAX_OVERLAP_SEARCH_ZOOM = 20;

/**
 * A coordinate's Web Mercator pixel position at a given zoom — the same projection MapLibre's own
 * renderer uses, computed here with no map instance (research.md R-002: testable with plain
 * arrays). Screen-space *distance* between two points depends only on their coordinates and the
 * zoom level, never on the map container's width — a wider container shows more of the same
 * projected pixel grid, it does not rescale it.
 */
function mercatorPixel(point: { readonly latitude: number; readonly longitude: number }, zoom: number): {
  readonly x: number;
  readonly y: number;
} {
  const scale = WORLD_PX_AT_ZOOM_0 * 2 ** zoom;
  const x = ((point.longitude + 180) / 360) * scale;
  const sinLatitude = Math.sin((point.latitude * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** The on-screen pixel distance between two coordinates at a given zoom. */
function mercatorPixelDistance(
  a: { readonly latitude: number; readonly longitude: number },
  b: { readonly latitude: number; readonly longitude: number },
  zoom: number,
): number {
  const pa = mercatorPixel(a, zoom);
  const pb = mercatorPixel(b, zoom);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/**
 * Whether the tapped Destination sits within `OVERLAP_RADIUS_PX` of another at `currentZoom`, and
 * if so, the smallest zoom that separates it from every other Destination by at least that radius
 * (FR-005 — "the map moves in far enough that each is separately tappable").
 *
 * Web Mercator's scale doubles with every whole zoom level, so distance grows monotonically as
 * `zoom` increases — the search below is a plain increasing walk, not a binary search, because the
 * step count is small (`MAX_OVERLAP_SEARCH_ZOOM` bounds it) and a walk is the version that reads
 * as "closed-form arithmetic", matching research.md R-002's own description.
 */
export function resolveOverlap(
  tapped: Destination,
  all: readonly Destination[],
  currentZoom: number,
): OverlapResolution {
  const others = all.filter((destination) => destination.id !== tapped.id);
  if (others.length === 0) return { overlapping: false, targetZoom: currentZoom };

  const closestDistanceAt = (zoom: number): number =>
    Math.min(...others.map((other) => mercatorPixelDistance(tapped, other, zoom)));

  if (closestDistanceAt(currentZoom) >= OVERLAP_RADIUS_PX) {
    return { overlapping: false, targetZoom: currentZoom };
  }

  let zoom = currentZoom;
  while (closestDistanceAt(zoom) < OVERLAP_RADIUS_PX && zoom < MAX_OVERLAP_SEARCH_ZOOM) {
    zoom += 0.5;
  }
  return { overlapping: true, targetZoom: zoom };
}
