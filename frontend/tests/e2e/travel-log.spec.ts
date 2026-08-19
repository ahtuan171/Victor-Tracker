import { expect, test, type Page } from "@playwright/test";

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

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: "Japan Summer 2026",
    start_date: "2026-08-01",
    end_date: "2026-08-15",
    status: "planned",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

async function openMapWithFixtures(
  page: Page,
  baseURL: string | undefined,
  destinations: unknown[] = [],
  trips: unknown[] = [],
): Promise<void> {
  await page.route("**/api/trips*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(trips),
    });
  });
  await page.route("**/api/destinations*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(destinations),
    });
  });
  await page.route("**/api/destinations/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const base = destinations.find((d) => (d as { id: number }).id === id) ?? destination({ id });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...(base as object), note: "Great memories", photographs: [] }),
    });
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

test.describe("Travel Log Surface", () => {
  test("V1: opens Travel Log timeline and displays places in reverse-chronological order", async ({
    page,
    baseURL,
  }) => {
    const dest1 = destination({ id: 1, name: "Tokyo", start_date: "2026-08-01", status: "visited", trip_id: 10 });
    const dest2 = destination({ id: 2, name: "Osaka", start_date: "2026-08-15", status: "visited" });
    const dest3 = destination({ id: 3, name: "Kyoto", start_date: "2026-08-10", status: "visited" });
    const t10 = trip({ id: 10, name: "Summer Trip" });

    await openMapWithFixtures(page, baseURL, [dest1, dest2, dest3], [t10]);

    // Open Travel Log via header button
    await page.getByTestId("open-travel-log").click();
    await expect(page.getByTestId("travel-log-drawer")).toBeVisible();

    // Verify item count badge
    await expect(page.getByTestId("log-count")).toHaveText("3");

    // Verify ordering: Osaka (Aug 15) -> Kyoto (Aug 10) -> Tokyo (Aug 1)
    const logCards = page.locator("[data-testid^='travel-log-card-']");
    await expect(logCards).toHaveCount(3);
    await expect(page.getByTestId("log-name-2")).toHaveText("Osaka");
    await expect(page.getByTestId("log-name-3")).toHaveText("Kyoto");
    await expect(page.getByTestId("log-name-1")).toHaveText("Tokyo");

    // Verify Trip attachment context on Tokyo
    await expect(page.getByTestId("log-trip-1")).toContainText("Summer Trip");
  });

  test("V2: filters Travel Log entries by status", async ({ page, baseURL }) => {
    const dest1 = destination({ id: 1, name: "Tokyo", status: "visited", start_date: "2026-08-01" });
    const dest2 = destination({ id: 2, name: "Osaka", status: "planned", start_date: "2026-08-15" });
    const dest3 = destination({ id: 3, name: "Kyoto", status: "wishlist" });

    await openMapWithFixtures(page, baseURL, [dest1, dest2, dest3], []);

    await page.getByTestId("open-travel-log").click();
    await expect(page.getByTestId("travel-log-drawer")).toBeVisible();

    // Filter by Visited
    await page.getByTestId("log-filter-visited").click();
    await expect(page.getByTestId("log-count")).toHaveText("1");
    await expect(page.getByTestId("log-name-1")).toBeVisible();
    await expect(page.getByTestId("log-name-2")).not.toBeVisible();

    // Filter by Planned
    await page.getByTestId("log-filter-planned").click();
    await expect(page.getByTestId("log-count")).toHaveText("1");
    await expect(page.getByTestId("log-name-2")).toBeVisible();

    // Filter back to All
    await page.getByTestId("log-filter-all").click();
    await expect(page.getByTestId("log-count")).toHaveText("3");
  });

  test("V3: tapping a log entry closes drawer, selects pin on map, and opens DestinationSheet", async ({
    page,
    baseURL,
  }) => {
    const dest1 = destination({ id: 1, name: "Tokyo", status: "visited", start_date: "2026-08-01" });

    await openMapWithFixtures(page, baseURL, [dest1], []);

    await page.getByTestId("open-travel-log").click();
    await expect(page.getByTestId("travel-log-drawer")).toBeVisible();

    // Tap the log card for Tokyo
    await page.getByTestId("travel-log-card-1").click();

    // Drawer should close
    await expect(page.getByTestId("travel-log-drawer")).not.toBeVisible();

    // DestinationSheet should open for Tokyo
    await expect(page.getByTestId("destination-sheet-close")).toBeVisible();
    await expect(page.getByTestId("destination-name-input")).toHaveValue("Tokyo");
  });

  test("V4: shows honest empty state when filter matches no places", async ({ page, baseURL }) => {
    const dest1 = destination({ id: 1, name: "Tokyo", status: "visited", start_date: "2026-08-01" });

    await openMapWithFixtures(page, baseURL, [dest1], []);

    await page.getByTestId("open-travel-log").click();
    await expect(page.getByTestId("travel-log-drawer")).toBeVisible();

    // Filter by Planned (which has 0 items)
    await page.getByTestId("log-filter-planned").click();
    await expect(page.getByTestId("travel-log-empty")).toBeVisible();
    await expect(page.getByTestId("log-count")).toHaveText("0");
  });
});
