import { expect, test, type Page } from "@playwright/test";

/**
 * Marking a new place directly from the map (T051, User Story 4, FR-020–FR-022, SC-003, quickstart
 * V5), at the 375x667 floor.
 *
 * The proxy is stubbed, matching every other file here — CI runs the production bundle with no
 * FastAPI behind it.
 *
 * ## How an interaction is counted
 *
 * SC-003 fixes this flow at **at most three interactions**, "from selecting or searching a location
 * to choosing its status", and spec.md's own clarification names them: *select or search a
 * location, then choose a status*. `capture.spec.ts` established how this project counts one —
 * `1. Tap capture. 2. Type. 3. Tap save.` — where typing a whole title, however long, is a single
 * interaction. The same reading here gives:
 *
 * 1. **search** — type a place name and submit it (one act; a search cannot be run without typing,
 *    and the submit is that same act's last keystroke),
 * 2. **select** — tap a candidate,
 * 3. **choose a status** — which saves, with nothing after it.
 *
 * The counting test below performs exactly those and nothing else, so a fourth step cannot arrive
 * one reasonable-sounding change at a time.
 */

const SESSION_COOKIE = "ch_session";

const KYOTO = {
  name: "Kyoto",
  address: "Kyoto Prefecture, Japan",
  latitude: 35.0116,
  longitude: 135.7681,
};

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

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: "Japan 2026",
    start_date: "2026-09-01",
    end_date: "2026-09-20",
    status: "planned",
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...overrides,
  };
}

interface Stub {
  readonly created: unknown[];
  readonly destinationRequests: string[];
}

/**
 * Stub the three endpoints this flow touches, and record what the create was sent.
 *
 * `candidates` is what the location search answers with; `createStatus` lets a test make the save
 * fail without touching anything else, which is the branch that decides whether the owner loses
 * the place they just found.
 */
async function stubApi(
  page: Page,
  {
    candidates = [KYOTO],
    trips = [] as unknown[],
    createStatus = 201,
  }: { candidates?: unknown[]; trips?: unknown[]; createStatus?: number } = {},
): Promise<Stub> {
  const created: unknown[] = [];
  const destinationRequests: string[] = [];

  await page.route("**/api/locations/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(candidates),
    });
  });

  await page.route("**/api/trips*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(trips),
    });
  });

  await page.route("**/api/destinations*", async (route) => {
    const request = route.request();
    destinationRequests.push(`${request.method()} ${request.url()}`);

    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    created.push(body);
    await route.fulfill({
      status: createStatus,
      contentType: "application/json",
      body: JSON.stringify(
        createStatus >= 400
          ? { detail: "Could not save that place." }
          : destination({ name: String(body.name), status: String(body.status ?? "wishlist") }),
      ),
    });
  });

  return { created, destinationRequests };
}

async function openMap(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

test("marking a new place costs three interactions, with no page in between (SC-003, FR-022)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page);
  await openMap(page, baseURL);
  const urlBefore = page.url();

  // 1. Search: type a place name and submit it.
  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");

  // 2. Select: tap the candidate.
  await page.getByTestId("quick-add-search-add").first().click();

  // 3. Choose a status — this saves. There is deliberately nothing after it.
  await page.getByTestId("quick-add-status-wishlist").click();

  await expect.poll(() => stub.created.length).toBe(1);
  expect(stub.created[0]).toMatchObject({
    name: "Kyoto",
    latitude: 35.0116,
    longitude: 135.7681,
    status: "wishlist",
  });

  // FR-022 / SC-003's second half: no intermediate page the owner has to navigate back from.
  expect(page.url()).toBe(urlBefore);
  await expect(page.getByTestId("map-canvas")).toBeVisible();
});

test("the new place is created with no Trip unless one is chosen (FR-020)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page, { trips: [trip()] });
  await openMap(page, baseURL);

  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();
  await page.getByTestId("quick-add-status-visited").click();

  await expect.poll(() => stub.created.length).toBe(1);
  // A Destination may exist with no Trip, and the untouched control must not invent one.
  expect(stub.created[0]).not.toHaveProperty("trip_id");
});

test("attaching to an existing Trip is one of the flow's choices (FR-021)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page, { trips: [trip({ id: 7, name: "Japan 2026" })] });
  await openMap(page, baseURL);

  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();

  await page.getByTestId("quick-add-trip").selectOption("7");
  await page.getByTestId("quick-add-status-planned").click();

  await expect.poll(() => stub.created.length).toBe(1);
  expect(stub.created[0]).toMatchObject({ trip_id: 7, status: "planned" });
});

test("every status the contract defines can be chosen from this flow (FR-020)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page);
  await openMap(page, baseURL);

  for (const status of ["visited", "planned", "wishlist"] as const) {
    await page.getByTestId("quick-add-search-input").fill("Kyoto");
    await page.getByTestId("quick-add-search-input").press("Enter");
    await page.getByTestId("quick-add-search-add").first().click();
    await page.getByTestId(`quick-add-status-${status}`).click();
    await expect(page.getByTestId("quick-add-search-input")).toBeVisible();
  }

  await expect.poll(() => stub.created.length).toBe(3);
  expect(stub.created.map((row) => (row as Record<string, unknown>).status)).toEqual([
    "visited",
    "planned",
    "wishlist",
  ]);
});

test("the map reloads so the new pin appears without a page transition (FR-022)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page);
  await openMap(page, baseURL);
  const readsBefore = stub.destinationRequests.filter((entry) => entry.startsWith("GET")).length;

  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();
  await page.getByTestId("quick-add-status-wishlist").click();

  // The saved place has to become a pin, and this surface holds its list in client state — so a
  // re-read is what makes it appear. Asserted as "the list was read again", not as a pin count,
  // because the stub answers with an empty list by design.
  await expect
    .poll(() => stub.destinationRequests.filter((entry) => entry.startsWith("GET")).length)
    .toBeGreaterThan(readsBefore);
});

test("a refused save keeps the place on screen and says why", async ({ page, baseURL }) => {
  await stubApi(page, { createStatus: 422 });
  await openMap(page, baseURL);

  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();
  await page.getByTestId("quick-add-status-wishlist").click();

  // Losing the candidate the owner just found is the worst outcome of a refused save — the same
  // rule the capture sheet follows, and the reason the panel does not close optimistically.
  await expect(page.getByTestId("quick-add-error")).toBeVisible();
  await expect(page.getByTestId("quick-add-name")).toHaveText("Kyoto");
});

test("a search matching nothing is distinguishable from a search that failed (FR-012)", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, { candidates: [] });
  await openMap(page, baseURL);

  await page.getByTestId("quick-add-search-input").fill("Nowhere at all");
  await page.getByTestId("quick-add-search-input").press("Enter");

  await expect(page.getByTestId("quick-add-search-empty")).toBeVisible();
  await expect(page.getByTestId("quick-add-search-error")).toHaveCount(0);
});

test("the quick-add flow sits in thumb reach and inside the 375px viewport", async ({
  page,
  baseURL,
}) => {
  await stubApi(page);
  await openMap(page, baseURL);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  // `.claude/rules/design.md`: a primary action belongs in the bottom half at the 375px floor.
  const panel = await page.getByTestId("quick-add").boundingBox();
  expect(panel).not.toBeNull();
  expect(panel!.y + panel!.height).toBeGreaterThan(viewport!.height / 2);

  // Per-control, not `scrollWidth` — `frontend/AGENTS.md`'s trap: a control pushed off the side of
  // a clipping container never widens the document.
  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();

  for (const testId of [
    "quick-add-status-visited",
    "quick-add-status-planned",
    "quick-add-status-wishlist",
    "quick-add-trip",
  ]) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, `${testId} has no box`).not.toBeNull();
    expect(box!.height, `${testId} is under the 44px floor`).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("the trip control offers every existing Trip, and leaving it unattached is the default (FR-021)", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, {
    trips: [trip({ id: 7, name: "Japan 2026" }), trip({ id: 8, name: "Iceland ring road" })],
  });
  await openMap(page, baseURL);

  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();

  const control = page.getByTestId("quick-add-trip");
  // "No trip" is the selected value before the owner touches anything — FR-020's "a Destination
  // MAY exist with no Trip" as the flow's default rather than a state they have to reach.
  await expect(control).toHaveValue("");
  await expect(control.locator("option")).toHaveText([
    "No trip",
    "Japan 2026",
    "Iceland ring road",
  ]);
});
