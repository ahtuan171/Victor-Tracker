import { expect, test, type Page } from "@playwright/test";

/**
 * Selecting a place (004, T007, User Story 1, V1 in quickstart.md) — FR-001–FR-005.
 *
 * The proxy is stubbed, matching every other file here — CI runs the production bundle with no
 * FastAPI behind it (`map.spec.ts`'s own header comment states the same reason).
 *
 * **DOM assertions only, never MapLibre's internal camera state.** `resolveOverlap`'s exact
 * target-zoom arithmetic is already proven in `tests/client/map.spec.ts` with no browser at all
 * (T006); what this file proves is the *wiring* — that a tap actually reaches `selectedId` and
 * shows up as `data-selected`/`aria-pressed` on the right pin, never two at once. Reading
 * `map.getZoom()`/`map.getCenter()` here would mean asserting through the canvas the same way
 * `research.md` R-002 already rejected for pin rendering, for the same reason: the map instance is
 * not exposed to the page and should not be, so there is nothing to read.
 *
 * **This file does not test "dismiss" yet.** FR-004's dismiss scenario is User Story 1's own
 * acceptance criterion, but the only dismiss gesture this product has is `PlaceConfirm`'s (User
 * Story 2, T008–T009) — `quickstart.md`'s own V1 step 3 says so explicitly ("via the confirmation
 * step's dismissal, V2"). Before T009 lands, a pin tap still opens `DestinationSheet` directly
 * (T004's preserved interim behaviour), so there is no standalone "select without opening" gesture
 * to dismiss. `tests/e2e/place-selection.spec.ts` (this file) gains that coverage when T011 extends
 * it, not here.
 */

const SESSION_COOKIE = "ch_session";

function destination(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trip_id: null,
    name: "Kyoto",
    latitude: 35.0116,
    longitude: 135.7681,
    start_date: null,
    end_date: null,
    status: "wishlist",
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    outside_trip_range: false,
    ...overrides,
  };
}

async function openMap(
  page: Page,
  baseURL: string | undefined,
  destinations: unknown[] = [],
): Promise<void> {
  await page.route("**/api/destinations*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(destinations),
    });
  });
  // `DestinationSheet` still opens directly on a pin tap in this increment (T004's interim
  // behaviour) — stub its detail fetch so that open does not itself throw and obscure the
  // selection assertions this file actually cares about.
  await page.route("**/api/destinations/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const base = destinations.find((d) => (d as { id: number }).id === id) ?? destination({ id });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...(base as object), note: null, photographs: [] }),
    });
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

test("tapping a pin marks it selected, and only it", async ({ page, baseURL }) => {
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Kyoto", status: "visited" }),
    destination({ id: 2, name: "Tokyo", latitude: 35.6812, longitude: 139.7671, status: "planned" }),
  ]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  const tokyoPin = page.locator('[data-testid="destination-pin"][aria-label*="Tokyo"]');

  // Before any tap: `data-selected` is omitted entirely when unselected (never rendered as
  // `"false"` — `DestinationPin.tsx`'s own `selected ? "" : undefined` spelling), and
  // `aria-pressed` is the explicit `"false"` a boolean ARIA attribute always renders.
  await expect(kyotoPin).not.toHaveAttribute("data-selected");
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "false");

  await kyotoPin.click();

  await expect(kyotoPin).toHaveAttribute("aria-pressed", "true");
  await expect(kyotoPin).toHaveAttribute("data-selected", "");
  // The one place not selected carries neither marker (FR-003 — at most one selected).
  await expect(tokyoPin).toHaveAttribute("aria-pressed", "false");
  await expect(tokyoPin).not.toHaveAttribute("data-selected", "");
});

test("selecting a different place moves the mark — never two at once (FR-003)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Kyoto", status: "visited" }),
    destination({ id: 2, name: "Tokyo", latitude: 35.6812, longitude: 139.7671, status: "planned" }),
  ]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  const tokyoPin = page.locator('[data-testid="destination-pin"][aria-label*="Tokyo"]');

  await kyotoPin.click();
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "true");

  // Close the sheet T004's interim behaviour opened, so the second pin's own click actually lands
  // on the map rather than on the sheet's overlay.
  await page.getByTestId("destination-sheet-close").click();

  await tokyoPin.click();

  await expect(tokyoPin).toHaveAttribute("aria-pressed", "true");
  // Kyoto stops being marked the instant Tokyo becomes the selection — at most one, ever.
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "false");
});

test("tapping an overlapping cluster zooms in far enough that both become individually tappable (FR-005)", async ({
  page,
  baseURL,
}) => {
  // Deliberately **close, not identical** — exact coincidence is `disambiguateCoincidentPins`'s
  // own concern (already proven client-side with no browser at all, `tests/client/map.spec.ts`).
  // ~150m apart is close enough that `resolveOverlap`'s 44px radius (also proven client-side)
  // triggers at the low zoom `fitBoundsOnce` settles on for a pair this close — close enough that
  // their 44px tap targets genuinely overlap on screen at that starting zoom, which is FR-005's
  // own premise ("when places overlap at the current zoom").
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Shibuya Crossing", latitude: 35.6598, longitude: 139.7006, status: "visited" }),
    destination({ id: 2, name: "Shibuya Station", latitude: 35.6608, longitude: 139.7016, status: "wishlist" }),
  ]);

  const crossingPin = page.locator('[aria-label*="Shibuya Crossing"]');
  const stationPin = page.locator('[aria-label*="Shibuya Station"]');
  await expect(crossingPin).toBeVisible();
  await expect(stationPin).toBeVisible();

  // The first tap lands somewhere in the overlapping cluster — `force: true` because a strict
  // "is this element unobstructed" actionability check would refuse to click either one while
  // their boxes overlap, which is exactly the real-world tap this line simulates. Which of the two
  // actually receives it is real-browser hit-testing, not something this test controls or needs
  // to: `resolveOverlap` only needs *a* tapped place to compute a target zoom from, and its own
  // arithmetic is already proven exactly, pure-function, in `tests/client/map.spec.ts`.
  await crossingPin.click({ force: true });

  const selectedAfterFirstTap = (await crossingPin.getAttribute("aria-pressed")) === "true"
    ? crossingPin
    : stationPin;
  const otherPin = selectedAfterFirstTap === crossingPin ? stationPin : crossingPin;
  await expect(selectedAfterFirstTap).toHaveAttribute("aria-pressed", "true");

  // T004's interim behaviour (preserved until User Story 2's confirmation step replaces it, T009)
  // still opens `DestinationSheet` directly on every pin tap, covering the map — close it so the
  // second tap actually lands on the other pin rather than on the sheet's own content.
  await page.getByTestId("destination-sheet-close").click();

  // The actual FR-005 claim: after the camera has moved to separate the cluster, the *other* place
  // is now cleanly, individually tappable — a plain `.click()` with no `force`, exactly as any
  // other single-pin test in this suite already clicks a pin, must succeed without Playwright's
  // actionability check ever needing an escape hatch.
  await otherPin.click();

  await expect(otherPin).toHaveAttribute("aria-pressed", "true");
  await expect(selectedAfterFirstTap).toHaveAttribute("aria-pressed", "false");
  // Both remain present and independently reachable throughout — neither tap merged or hid either.
  await expect(page.getByTestId("destination-pin")).toHaveCount(2);
});
