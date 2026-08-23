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
 * **Updated by T009**: a pin tap now shows `PlaceConfirm` instead of opening `DestinationSheet`
 * directly — closing that confirmation card (`place-confirm-dismiss`) is what these tests use to
 * get back to a clean map between taps, replacing the `destination-sheet-close` click an earlier
 * version of this file used when a pin tap still opened the full sheet (T004's now-retired interim
 * behaviour). The dedicated dismiss *scenario* — that dismissing also clears the selection, FR-004
 * — is V2's own coverage, added by T011, below.
 *
 * **V2 coverage (T011, User Story 2, FR-004, FR-006–FR-008)** is the four tests at the bottom of
 * this file: the confirmation step appears naming the place and its status, dismissing it clears
 * the selection and opens nothing, its own action opens the full detail, and — the T010 half —
 * `DestinationStrip`'s own tap skips the confirmation step entirely while still marking the place
 * selected underneath.
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
    category: null,
    outside_trip_range: false,
    ...overrides,
  };
}

async function openMap(
  page: Page,
  baseURL: string | undefined,
  destinations: unknown[] = [],
): Promise<void> {
  // `TripPanel`'s own `useTrips()` fires on every mount regardless of whether its sheet is open
  // (`TripPanel.tsx`'s own docstring) — unstubbed, a real backend answers the stub session cookie
  // with a genuine 401, and `lib/api.ts`'s global handler navigates the page to `/login` for real,
  // mid-test. A `waitUntilSeparated` poll is exactly long enough to lose that race intermittently.
  await page.route("**/api/trips*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route("**/api/destinations*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(destinations),
    });
  });
  // `DestinationSheet`'s detail fetch, stubbed regardless: `PlaceConfirm`'s own "Open" action still
  // reaches it (T009), even though a bare pin tap no longer does.
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

/**
 * Waits until two pin locators' boxes are far enough apart to click independently.
 *
 * Selecting a place triggers an *animated* `easeTo` (T009's `MINIMUM_SELECTION_ZOOM`, on top of
 * `resolveOverlap`'s own target — `MapView.tsx`), and it is that animation settling that eventually
 * separates a genuinely overlapping pair on screen. A click sent before it finishes can still land
 * on the wrong element — the exact flakiness `force: true` exists to route around for the *first*
 * tap in a cluster, reintroduced for a *second* tap this file needs to land on one specific pin.
 * Polling the boxes' own on-screen distance is a DOM-observable consequence of the camera having
 * settled, not a read of MapLibre's internal state (`research.md` R-002's own DOM-only rule).
 */
async function waitUntilSeparated(a: ReturnType<Page["locator"]>, b: ReturnType<Page["locator"]>): Promise<void> {
  await expect
    .poll(async () => {
      const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
      if (boxA === null || boxB === null) return Number.POSITIVE_INFINITY;
      const centerA = { x: boxA.x + boxA.width / 2, y: boxA.y + boxA.height / 2 };
      const centerB = { x: boxB.x + boxB.width / 2, y: boxB.y + boxB.height / 2 };
      return Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
    })
    .toBeGreaterThan(44);
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
  // Deliberately close together, not two cities apart: selecting either now zooms in to at least a
  // local-area view (`MapView.tsx`'s `MINIMUM_SELECTION_ZOOM`, T009's zoom refinement), which would
  // push a genuinely distant second place off-screen and make it unclickable for a reason this test
  // has nothing to do with. ~150m keeps both reachable at any zoom either selection settles on.
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Kyoto Station", latitude: 35.6598, longitude: 139.7006, status: "visited" }),
    destination({ id: 2, name: "Kyoto Tower", latitude: 35.6608, longitude: 139.7016, status: "planned" }),
  ]);

  const stationPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto Station"]');
  const towerPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto Tower"]');

  // `force: true` on the first tap only — at this distance the two 44px tap targets genuinely
  // overlap on screen before either has been selected, same as the FR-005 fixture below, and for
  // the same reason: a strict actionability check would refuse to click either box while they
  // overlap. Which one the first tap actually lands on is real-browser hit-testing, not something
  // this test needs to pin down.
  await stationPin.click({ force: true });
  const firstSelected = (await stationPin.getAttribute("aria-pressed")) === "true" ? stationPin : towerPin;
  const secondPin = firstSelected === stationPin ? towerPin : stationPin;
  await expect(firstSelected).toHaveAttribute("aria-pressed", "true");

  // Wait for the camera's animated response to `firstSelected` to actually separate the pair before
  // sending a click that needs to land on one specific element (`waitUntilSeparated`'s own docstring
  // has the full reasoning).
  await waitUntilSeparated(stationPin, towerPin);

  // Deliberately no dismissal here: `PlaceConfirm` (T009) only covers the map's own lower strip,
  // and the other pin sits well clear of it, so this exercises selecting a second place *while the
  // first is still being confirmed* — the more demanding version of "never two at once" than
  // dismissing first would be.
  await secondPin.click();

  await expect(secondPin).toHaveAttribute("aria-pressed", "true");
  // The first stops being marked the instant the second becomes the selection — at most one, ever.
  await expect(firstSelected).toHaveAttribute("aria-pressed", "false");
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

  // Wait for the camera's animated response to actually separate the pair — otherwise a click sent
  // mid-animation can still land on the wrong element (`waitUntilSeparated`'s own docstring).
  await waitUntilSeparated(crossingPin, stationPin);

  // The actual FR-005 claim: once separated, the *other* place is cleanly, individually tappable —
  // a plain `.click()` with no `force`, exactly as any other single-pin test in this suite already
  // clicks a pin, must succeed without Playwright's actionability check ever needing an escape hatch.
  await otherPin.click();

  await expect(otherPin).toHaveAttribute("aria-pressed", "true");
  await expect(selectedAfterFirstTap).toHaveAttribute("aria-pressed", "false");
  // Both remain present and independently reachable throughout — neither tap merged or hid either.
  await expect(page.getByTestId("destination-pin")).toHaveCount(2);
});

test("selecting a pin shows the confirmation step, naming the place and its status (FR-006, FR-007)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [destination({ id: 1, name: "Kyoto", status: "visited" })]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  await kyotoPin.click();

  await expect(page.getByTestId("place-confirm")).toBeVisible();
  await expect(page.getByTestId("place-confirm-name")).toHaveText("Kyoto");
  await expect(page.getByTestId("place-confirm-status")).toHaveText("Visited");
  // Nothing else happened yet — the full detail has not opened.
  await expect(page.getByTestId("destination-sheet-close")).toBeHidden();
});

test("dismissing the confirmation step clears the selection and opens nothing (FR-004, FR-008)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [destination({ id: 1, name: "Kyoto", status: "visited" })]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  await kyotoPin.click();
  await expect(page.getByTestId("place-confirm")).toBeVisible();

  await page.getByTestId("place-confirm-dismiss").click();

  // FR-004 (User Story 1) — dismissing the *confirmation* also leaves no place selected, not only
  // the confirmation card itself (`MapShell.tsx`'s `dismissConfirmation`, T009's own correction).
  await expect(page.getByTestId("place-confirm")).not.toBeVisible();
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "false");
  await expect(kyotoPin).not.toHaveAttribute("data-selected", "");
  await expect(page.getByTestId("destination-sheet-close")).toBeHidden();
});

test("the confirmation step's action opens the full detail (FR-007)", async ({ page, baseURL }) => {
  await openMap(page, baseURL, [destination({ id: 1, name: "Kyoto", status: "visited" })]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  await kyotoPin.click();
  await page.getByTestId("place-confirm-open").click();

  await page.getByTestId("destination-sheet-close").waitFor();
  await expect(page.getByTestId("destination-name-input")).toHaveValue("Kyoto");
});

test("a strip tap opens the full detail directly, skipping the confirmation step, while still selecting the place (T010)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [destination({ id: 1, name: "Kyoto", status: "visited" })]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');

  await page.getByTestId("destination-card-1").click();

  // R-001's documented asymmetry: a strip card is already unambiguous, so the confirmation step's
  // mis-tap defence does not apply there — it never appears for a strip tap.
  await expect(page.getByTestId("place-confirm")).toHaveCount(0);
  await page.getByTestId("destination-sheet-close").waitFor();
  // The place is still marked selected on the map underneath, even though the sheet opened
  // directly rather than through the confirmation step.
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "true");
});

test("changing the status filter past the selected place clears the selection (spec.md's Edge Cases)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Kyoto", status: "visited" }),
    destination({ id: 2, name: "Osaka", latitude: 34.6937, longitude: 135.5023, status: "wishlist" }),
  ]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  await kyotoPin.click();
  await expect(page.getByTestId("place-confirm")).toBeVisible();
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "true");

  // Narrow to a status Kyoto (visited) does not have — the pin the owner just selected is no
  // longer on screen for it to describe.
  await page.getByTestId("status-filter-wishlist").click();

  await expect(page.getByTestId("place-confirm")).toHaveCount(0);
  await expect(page.getByTestId("destination-pin")).toHaveCount(1);
  await expect(page.getByTestId("destination-pin")).not.toHaveAttribute("aria-pressed", "true");
});

test("changing the filter to a status the selected place still has leaves the selection alone", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [destination({ id: 1, name: "Kyoto", status: "visited" })]);

  const kyotoPin = page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]');
  await kyotoPin.click();
  await page.getByTestId("status-filter-visited").click();

  // Kyoto is visited — the filter narrows to exactly the status it already has, so nothing about
  // the selection needed to change.
  await expect(kyotoPin).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("place-confirm")).toBeVisible();
});
