import { expect, test, type Page } from "@playwright/test";

/**
 * The status control changes which fields the editing form asks for (004, T026–T028, User Story 6,
 * V6 in quickstart.md) — FR-017–FR-020, and the Clarification (Session 2026-08-17) that a status
 * change always saves, even when a newly-asked field is left empty. Closes the automated-coverage
 * gap `003`'s own retro left open for the status control (`plan.md`'s Project Structure note).
 *
 * The proxy is stubbed, matching every other file here.
 */

const SESSION_COOKIE = "ch_session";

function destination(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trip_id: null,
    name: "Porto",
    latitude: 41.1579,
    longitude: -8.6291,
    start_date: null,
    end_date: null,
    status: "wishlist",
    note: null,
    photographs: [],
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    outside_trip_range: false,
    ...overrides,
  };
}

async function openMapWithDetail(
  page: Page,
  baseURL: string | undefined,
  detail: Record<string, unknown>,
  trips: unknown[] = [],
): Promise<void> {
  await page.route("**/api/destinations", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([destination({ id: detail["id"], name: detail["name"], status: detail["status"] })]),
    });
  });
  await page.route(new RegExp(`/api/destinations/${detail["id"]}$`), async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) });
      return;
    }
    return route.fallback();
  });
  await page.route("**/api/trips", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(trips) });
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();
}

test("moving a Wishlist place to Planned asks for dates and a Trip (V6 scenario 1, FR-018)", async ({
  page,
  baseURL,
}) => {
  const porto = destination({ id: 1, name: "Porto", status: "wishlist" });
  await openMapWithDetail(page, baseURL, porto);

  await expect(page.getByTestId("destination-start-date-input")).toHaveCount(0);
  await expect(page.getByTestId("destination-planned-no-trip")).toHaveCount(0);

  await page.getByTestId("destination-status-option-planned").click();

  await expect(page.getByTestId("destination-start-date-input")).toBeVisible();
  await expect(page.getByTestId("destination-end-date-input")).toBeVisible();
  await expect(page.getByTestId("destination-planned-no-trip")).toBeVisible();
});

test("moving a Planned place to Visited asks for impressions and photographs (V6 scenario 2, FR-019)", async ({
  page,
  baseURL,
}) => {
  const kyoto = destination({ id: 1, name: "Kyoto", status: "planned", start_date: "2026-09-05" });
  await openMapWithDetail(page, baseURL, kyoto);

  await expect(page.getByTestId("destination-note-input")).toHaveCount(0);
  await expect(page.getByTestId("destination-photo-attach")).toHaveCount(0);

  await page.getByTestId("destination-status-option-visited").click();

  await expect(page.getByTestId("destination-note-input")).toBeVisible();
  await expect(page.getByTestId("destination-photo-attach")).toBeVisible();
});

test("the asked-for fields for a place already at that status live only in the content section, never doubled above the save button (T026's non-duplication rule)", async ({
  page,
  baseURL,
}) => {
  // Opened directly on Planned — draft.status === detail.status from the start, so the
  // transitional `PlannedPanel` reuse above Save must not also render; only the content
  // section's own instance should be on screen.
  const kyoto = destination({ id: 1, name: "Kyoto", status: "planned", start_date: "2026-09-05" });
  await openMapWithDetail(page, baseURL, kyoto);

  await expect(page.getByTestId("destination-planned-no-trip")).toHaveCount(1);
});

test("every status is reachable from every other, with no direction restricted (V6 scenario 3, FR-020)", async ({
  page,
  baseURL,
}) => {
  const porto = destination({ id: 1, name: "Porto", status: "wishlist" });
  await openMapWithDetail(page, baseURL, porto);

  for (const status of ["planned", "visited", "wishlist", "visited", "planned", "wishlist"]) {
    await page.getByTestId(`destination-status-option-${status}`).click();
    await expect(page.getByTestId(`destination-status-option-${status}`)).toHaveAttribute("aria-checked", "true");
  }
});

test("a status change saves even when a newly-asked field is left empty, and the field simply stays unset (V6 scenario 4, FR-020)", async ({
  page,
  baseURL,
}) => {
  const porto = destination({ id: 1, name: "Porto", status: "wishlist" });

  let patchedBody: Record<string, unknown> | undefined;
  await page.route("**/api/destinations", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([destination({ id: 1, name: "Porto", status: "wishlist" })]),
    });
  });
  await page.route("**/api/destinations/1", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(porto) });
      return;
    }
    if (route.request().method() === "PATCH") {
      patchedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...porto, status: "planned", start_date: null, end_date: null }),
      });
      return;
    }
    return route.fallback();
  });
  await page.route("**/api/trips", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await page.getByTestId("destination-status-option-planned").click();
  // The newly-asked date fields are left empty, on purpose.
  await page.getByTestId("destination-save").click();

  await expect(page.getByTestId("destination-save")).toHaveText("Save");
  expect(patchedBody?.["status"]).toBe("planned");
  expect(patchedBody?.["start_date"]).toBeNull();
  expect(patchedBody?.["end_date"]).toBeNull();
});
