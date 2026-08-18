import { expect, test, type Page } from "@playwright/test";

/**
 * A Visited place's detail is its photographs and impressions, as content (004, T015, User
 * Story 3, V3 in quickstart.md) — FR-009, FR-010, FR-016.
 *
 * `photo-upload.spec.ts` already proves the gallery/note render and that a non-Visited place gets
 * neither (carried over from `003`'s T035) — this file is `004`'s own V3 coverage, added by the
 * `VisitedPanel` restructuring (T012–T014): the empty-state invitation (FR-010 scenario 2) has no
 * coverage anywhere else, and the "content, not form fields" framing is this iteration's own claim
 * to prove rather than assume the older file's tests already cover it.
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
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...overrides,
  };
}

async function openMapWithDetail(
  page: Page,
  baseURL: string | undefined,
  list: unknown[],
  detail: Record<string, unknown>,
): Promise<void> {
  await page.route("**/api/destinations", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) });
  });
  await page.route(new RegExp(`/api/destinations/${detail["id"]}$`), async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) });
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

test("a Visited place with a note and a photograph shows both as content (V3 scenario 1)", async ({
  page,
  baseURL,
}) => {
  const visited = destination({
    id: 1,
    name: "Porto",
    status: "visited",
    note: "Rain the whole time, worth it for the bookshop.",
    photographs: [
      { id: 1, url: "https://stub-r2.example.com/photo-1.jpg", created_at: "2026-08-01T09:00:00Z" },
    ],
  });
  await openMapWithDetail(page, baseURL, [destination({ id: 1, name: "Porto", status: "visited" })], visited);

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-note-input")).toHaveValue(
    "Rain the whole time, worth it for the bookshop.",
  );
  await expect(page.getByTestId("destination-photo")).toHaveCount(1);
  // FR-010: content, not the empty-state invitation — the two are mutually exclusive (T014).
  await expect(page.getByTestId("visited-empty-invite")).toHaveCount(0);
});

test("a Visited place with neither a note nor a photograph invites adding both (V3 scenario 2, FR-010)", async ({
  page,
  baseURL,
}) => {
  const visited = destination({ id: 1, name: "Porto", status: "visited", note: null, photographs: [] });
  await openMapWithDetail(page, baseURL, [destination({ id: 1, name: "Porto", status: "visited" })], visited);

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("visited-empty-invite")).toBeVisible();
  // The invitation accompanies the means to act on it — an empty grid and an empty note are not
  // presented as though they were content on their own (FR-010, FR-016's own framing).
  await expect(page.getByTestId("destination-photo-attach")).toBeVisible();
  await expect(page.getByTestId("destination-note-input")).toBeVisible();
  await expect(page.getByTestId("destination-photo")).toHaveCount(0);
});

test("the invitation disappears once a note or a photograph exists (FR-010's own boundary)", async ({
  page,
  baseURL,
}) => {
  // A note alone, no photograph — either one on its own is enough to retire the invitation, not
  // only the "both present" case the first test already covers.
  const visited = destination({
    id: 1,
    name: "Porto",
    status: "visited",
    note: "Just a line, nothing more yet.",
    photographs: [],
  });
  await openMapWithDetail(page, baseURL, [destination({ id: 1, name: "Porto", status: "visited" })], visited);

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("visited-empty-invite")).toHaveCount(0);
});
