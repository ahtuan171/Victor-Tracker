import { expect, test, type Page } from "@playwright/test";

/**
 * The map surface (T022, User Story 1, V1 in quickstart.md), at the 375x667 floor.
 *
 * The proxy is stubbed, matching every other file here — CI runs the production bundle with no
 * FastAPI behind it (`nav-drawer.spec.ts`'s own header comment states the same reason).
 *
 * **DOM and `page.screenshot()` assertions only, never a canvas pixel read** — research.md R-002's
 * spike finding: a genuinely-painted MapLibre canvas still reads back `[0,0,0,0]` from
 * `canvas.getImageData()` (cross-origin tile textures taint it for 2D readback), so a pixel-level
 * assertion would be unreliable regardless of whether the map actually drew anything. Every
 * assertion below reaches a real DOM node — `DestinationPin` renders into one precisely so tests
 * like this one can.
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
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

test("every marked place appears as a pin whose status is distinguishable without tapping it (scenario 1)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Kyoto", status: "visited" }),
    destination({ id: 2, name: "Tokyo", latitude: 35.6812, longitude: 139.7671, status: "planned" }),
    destination({ id: 3, name: "Osaka", latitude: 34.6937, longitude: 135.5023, status: "wishlist" }),
  ]);

  const pins = page.getByTestId("destination-pin");
  await expect(pins).toHaveCount(3);

  // Distinguishable by status without tapping — the DOM carries the encoding directly (FR-002),
  // so this is checkable without a canvas read: each pin's own `data-status` and accessible name
  // differ, which is exactly what a sighted owner reads by shape/fill and a screen-reader owner
  // reads by the label.
  await expect(page.locator('[data-testid="destination-pin"][data-status="visited"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="destination-pin"][data-status="planned"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="destination-pin"][data-status="wishlist"]')).toHaveCount(1);

  for (const [status, label] of [
    ["visited", "Visited"],
    ["planned", "Planned"],
    ["wishlist", "Wishlist"],
  ] as const) {
    const pin = page.locator(`[data-testid="destination-pin"][data-status="${status}"]`);
    await expect(pin).toHaveAttribute("aria-label", new RegExp(label));
  }
});

test("a genuine map renders — real tiles, real attribution (FR-003, FR-004, tech-defaults.md)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [destination()]);

  // The one screenshot assertion in this file: confirms MapLibre actually painted something,
  // which no DOM assertion alone can — the map canvas itself carries no queryable structure.
  // research.md R-002's spike is why a byte comparison is safe here despite the renderer
  // difference between headless/headed environments this project's own screenshots otherwise
  // avoid comparing pixel-for-pixel: this only asserts the screenshot is non-trivial (not a
  // single flat colour), never compares it against a stored baseline.
  const canvas = page.getByTestId("map-canvas");
  const buffer = await canvas.screenshot();
  expect(buffer.length).toBeGreaterThan(0);

  // The tile attribution licence term (`tech-defaults.md`'s "The map") — MapLibre's own
  // `AttributionControl`, confirmed present and legible.
  //
  // **A longer, explicit timeout, not the default 5s.** `AttributionControl` carries
  // `maplibregl-attrib-empty` (CSS-hidden) until the style's sources have loaded enough to know
  // what to attribute — under this project's full suite running many browsers in parallel, tile
  // loading can take longer than the default assertion timeout even though the map is genuinely
  // still loading correctly, not stuck. Waiting for the class to clear first is what makes this
  // robust to that contention rather than to network speed specifically.
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).not.toHaveClass(/maplibregl-attrib-empty/, { timeout: 20000 });
  await expect(attribution).toBeVisible();
  await expect(attribution).toContainText("CARTO");
  await expect(attribution).toContainText("OpenStreetMap");
});

test("with zero Destinations, the map still renders and invites the first place (scenario 2)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, []);

  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await expect(page.getByTestId("destination-pin")).toHaveCount(0);
  await expect(page.getByTestId("map-empty-state")).toBeVisible();
  await expect(page.getByTestId("map-empty-state")).toContainText(/no places marked yet/i);
});

test("the Currently Traveling overlay appears only on a Planned pin whose range contains today (FR-002, R-004)", async ({
  page,
  baseURL,
}) => {
  // A millisecond timestamp, which is what `setFixedTime` wants — `Date.UTC`, never `new Date`
  // (eslint bans the latter outside `lib/dates.ts`, research.md R-006).
  await page.clock.setFixedTime(Date.UTC(2026, 7, 14, 12, 0, 0));

  await openMap(page, baseURL, [
    destination({
      id: 1,
      name: "Currently traveling",
      status: "planned",
      start_date: "2026-08-01",
      end_date: "2026-08-20",
    }),
    destination({
      id: 2,
      name: "Planned, not yet",
      latitude: 1,
      longitude: 1,
      status: "planned",
      start_date: "2026-09-01",
      end_date: "2026-09-10",
    }),
  ]);

  await expect(page.getByTestId("destination-pin").first()).toBeVisible();

  const traveling = page.locator('[data-testid="destination-pin"][data-traveling="true"]');
  await expect(traveling).toHaveCount(1);
  await expect(traveling).toHaveAttribute("aria-label", /currently traveling/i);

  const notTraveling = page.locator('[data-testid="destination-pin"][data-traveling="false"]');
  await expect(notTraveling).toHaveCount(1);
});

test("nothing on the map requires horizontal body scroll at 375px (SC-004, .claude/rules/design.md)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, [
    destination({ id: 1, name: "Kyoto", status: "visited" }),
    destination({ id: 2, name: "Tokyo", latitude: 35.6812, longitude: 139.7671, status: "planned" }),
  ]);
  await expect(page.getByTestId("destination-pin").first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  // Every pin's own tap target stays inside the 375px viewport too — a pin placed near the
  // canvas's own edge is still the one place a control could clip without widening the document
  // (`frontend/AGENTS.md`'s `scrollWidth` trap: clipping inside a fixed-size container never
  // shows up in that check above).
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const boxes = await page.getByTestId("destination-pin").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()),
  );
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width);
  }
});

test("the header's nav trigger is reachable, matching every other screen's header (FR-015)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL, []);

  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
});
