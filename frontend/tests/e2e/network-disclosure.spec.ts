import { expect, test, type Page } from "@playwright/test";

/**
 * FR-013, SC-006, constitution principle II (T048, V9 in quickstart.md).
 *
 * Two outgoing requests this product makes to third parties, and what each may carry:
 *
 *   1. **Map tile requests** (the browser → CARTO, directly). Necessarily disclose the viewport —
 *      `tech-defaults.md`'s accepted, stated cost — and MUST disclose nothing else: no place name,
 *      note, or record id may ride along in a tile/style URL.
 *   2. **`GET /locations/search`** (the browser → this app's own proxy → FastAPI → Nominatim,
 *      research.md R-001). The browser never talks to Nominatim directly — only the backend does —
 *      so what this test can actually observe from the browser is the **outgoing proxy request**,
 *      and the contract this defends is that it carries only the owner-typed `q`, never anything
 *      about a stored Destination or Trip.
 */

const SESSION_COOKIE = "ch_session";

async function openMap(page: Page, baseURL: string | undefined): Promise<void> {
  await page.route("**/api/destinations*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  const trips: Record<string, unknown>[] = [];
  await page.route("**/api/trips", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(trips) });
      return;
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        start_date: string;
        end_date: string;
        status?: string;
      };
      const trip = {
        id: trips.length + 1,
        name: body.name,
        start_date: body.start_date,
        end_date: body.end_date,
        status: body.status ?? "wishlist",
        created_at: "2026-08-16T09:00:00Z",
        updated_at: "2026-08-16T09:00:00Z",
      };
      trips.push(trip);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(trip) });
      return;
    }
    await route.fallback();
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

test("outgoing tile requests carry only viewport/style data, never a place name or note (V9 scenario 1)", async ({
  page,
  baseURL,
}) => {
  const secret = "TOP-SECRET-PRIVATE-NOTE-CONTENTS";
  const tileRequestUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("cartocdn.com")) tileRequestUrls.push(request.url());
  });

  await openMap(page, baseURL);

  // Wait for the map to have actually issued its style/tile requests.
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).not.toHaveClass(/maplibregl-attrib-empty/, { timeout: 20000 });

  expect(tileRequestUrls.length).toBeGreaterThan(0);
  for (const url of tileRequestUrls) {
    expect(url).not.toContain(secret);
    expect(url.toLowerCase()).not.toContain("destination");
    expect(url.toLowerCase()).not.toContain("note");
  }
});

test("the location search request carries only the owner-typed text, nothing about any stored record (V9 scenario 2)", async ({
  page,
  baseURL,
}) => {
  await openMap(page, baseURL);

  const searchRequests: string[] = [];
  await page.route("**/api/locations/search**", async (route) => {
    searchRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.getByTestId("open-trips").click();
  await page.getByTestId("trip-create-toggle").click();
  await page.getByTestId("trip-name-input").fill("A trip with a secret note nobody should leak");
  await page.getByTestId("trip-start-date-input").fill("2026-09-01");
  await page.getByTestId("trip-end-date-input").fill("2026-09-15");
  await page.getByTestId("trip-create-submit").click();

  await page.getByTestId("location-search-input").waitFor();
  await page.getByTestId("location-search-input").fill("Kyoto");
  await page.getByTestId("location-search-submit").click();

  await expect(page.getByTestId("location-search-empty")).toBeVisible();
  expect(searchRequests).toHaveLength(1);

  const url = new URL(searchRequests[0]!);
  // Exactly one query parameter, exactly the typed text — never a trip name, note, or id riding
  // along on the same request.
  expect([...url.searchParams.keys()]).toEqual(["q"]);
  expect(url.searchParams.get("q")).toBe("Kyoto");
  expect(searchRequests[0]).not.toContain("secret");
  expect(searchRequests[0]?.toLowerCase()).not.toContain("trip");
});
