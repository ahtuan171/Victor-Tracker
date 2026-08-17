import { expect, test, type Page } from "@playwright/test";

/**
 * `DestinationSheet`'s photo/note gallery and the direct-to-R2 upload path (T035, User Story 2,
 * V2 and V6 in quickstart.md), at the 375x667 floor.
 *
 * The proxy is stubbed, matching every other file here — CI runs the production bundle with no
 * FastAPI behind it. The one *real* network boundary this file cares about is the upload
 * `PUT` itself, which by design (FR-023) never reaches this app's own origin — stubbed at a
 * deliberately different host (`https://stub-r2.example.com`) so a request landing on `**\/api/**`
 * instead is unambiguously a regression, not a routing coincidence.
 */

const SESSION_COOKIE = "ch_session";
const UPLOAD_HOST = "https://stub-r2.example.com";

function destination(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trip_id: null,
    name: "Lisbon",
    latitude: 38.7223,
    longitude: -9.1393,
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

test("a Visited pin's sheet shows its note and photograph in one tap (V2 scenario 1-2)", async ({
  page,
  baseURL,
}) => {
  const visited = destination({
    id: 1,
    name: "Lisbon",
    status: "visited",
    note: "Tram 28 at 7am, empty.",
    photographs: [{ id: 1, url: "https://stub-r2.example.com/photo-1.jpg", created_at: "2026-08-01T09:00:00Z" }],
  });
  await openMapWithDetail(page, baseURL, [destination({ id: 1, name: "Lisbon", status: "visited" })], visited);

  // A pin tap now shows the confirmation step first (004, T009) rather than opening the sheet
  // directly; its one action is what actually opens it.
  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-note-input")).toHaveValue("Tram 28 at 7am, empty.");
  await expect(page.getByTestId("destination-photo")).toHaveCount(1);
});

test("a Planned or Wishlist pin's sheet offers no gallery or note (V2 scenario 3, FR-009, INV-3)", async ({
  page,
  baseURL,
}) => {
  const wishlist = destination({ id: 1, name: "Lisbon", status: "wishlist", note: null, photographs: [] });
  await openMapWithDetail(page, baseURL, [destination({ id: 1, status: "wishlist" })], wishlist);

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-photo-attach")).toHaveCount(0);
  await expect(page.getByTestId("destination-note-input")).toHaveCount(0);
});

test("the upload PUT goes straight to R2, never to this product's own backend origin (V6)", async ({
  page,
  baseURL,
}) => {
  const visited = destination({
    id: 1,
    name: "Lisbon",
    status: "visited",
    note: null,
    photographs: [],
  });
  await openMapWithDetail(page, baseURL, [destination({ id: 1, status: "visited" })], visited);

  // A passive listener, not a `route` handler — it observes every request exactly once with no
  // interaction with the `route.fallback()` chain below, which is what makes it trustworthy: a
  // classification built out of routing handlers would depend on their registration order (later
  // handlers run first, and one that `fulfill()`s a request stops an earlier one from ever seeing
  // it), and the *first* version of this test asserted on the wrong request as a result — the
  // `<img>` tag's own GET of the freshly attached photo also matches `${UPLOAD_HOST}/**`, and
  // happened to be what satisfied the assertion instead of the PUT it was meant to prove.
  const uploadPuts: string[] = [];
  const backendRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(UPLOAD_HOST) && request.method() === "PUT") uploadPuts.push(url);
    if (request.method() === "PUT" && url.includes("/api/")) backendRequests.push(url);
  });

  await page.route("**/api/destinations/1/photos/upload-url", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        upload_url: `${UPLOAD_HOST}/destinations/1/stub-key`,
        object_key: "destinations/1/stub-key",
        expires_at: "2026-08-01T09:05:00Z",
      }),
    });
  });
  // The stubbed R2 host itself. Also stubs the `<img>` tag's own GET of the attached photo's URL
  // (both share this host in the fixture below) — irrelevant to what this test proves, but left
  // unhandled it would hit the real network for a URL that does not exist.
  await page.route(`${UPLOAD_HOST}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: "" });
  });
  await page.route("**/api/destinations/1/photos", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    // FR-025: the confirm body carries only the object_key, never image bytes.
    const body = route.request().postDataJSON() as { object_key: string };
    expect(Object.keys(body)).toEqual(["object_key"]);
    expect(body.object_key).toBe("destinations/1/stub-key");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        url: "https://stub-r2.example.com/photo-1.jpg",
        created_at: "2026-08-01T09:00:00Z",
      }),
    });
  });

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-photo-attach").waitFor();

  const fileInput = page.getByTestId("destination-photo-input");
  await fileInput.setInputFiles({
    name: "lisbon.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not a real jpeg, just bytes for the stub PUT"),
  });

  await expect(page.getByTestId("destination-photo")).toHaveCount(1);
  expect(uploadPuts).toEqual([`${UPLOAD_HOST}/destinations/1/stub-key`]);
  expect(backendRequests).toEqual([]);
});
