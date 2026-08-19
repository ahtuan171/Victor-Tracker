import { expect, test, type Page } from "@playwright/test";

/**
 * A place's detail is content determined by its status (004, T015/T022/T025, User Stories 3, 4
 * and 5, V3/V4/V5 in quickstart.md) — FR-009, FR-010, FR-011–FR-016.
 *
 * `photo-upload.spec.ts` already proves the gallery/note render and that a non-Visited place gets
 * neither (carried over from `003`'s T035) — this file is `004`'s own coverage, added by the
 * `VisitedPanel`/`PlannedPanel`/`WishlistPanel` restructuring: the empty-state invitation (FR-010
 * scenario 2), everything about a Planned place's Trip context, and a Wishlist place's own honest
 * empty state have no coverage anywhere else.
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
    outside_trip_range: false,
    ...overrides,
  };
}

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: "Japan 2026",
    start_date: "2026-09-01",
    end_date: "2026-09-14",
    status: "planned",
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
  trips: unknown[] = [],
): Promise<void> {
  await page.route("**/api/destinations", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) });
  });
  await page.route(new RegExp(`/api/destinations/${detail["id"]}$`), async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) });
  });
  await page.route("**/api/trips", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(trips) });
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

test("a Planned place with a Trip shows its own dates, the Trip's name/range, and the sibling place — with no extra navigation (V4 scenario 1)", async ({
  page,
  baseURL,
}) => {
  const japanTrip = trip({ id: 10, name: "Japan 2026", start_date: "2026-09-01", end_date: "2026-09-14" });
  const kyoto = destination({
    id: 1,
    name: "Kyoto",
    trip_id: 10,
    status: "planned",
    start_date: "2026-09-05",
    end_date: "2026-09-08",
    note: null,
    photographs: [],
  });
  const osaka = destination({
    id: 2,
    name: "Osaka",
    latitude: 34.6937,
    longitude: 135.5023,
    trip_id: 10,
    status: "planned",
    start_date: "2026-09-09",
    end_date: "2026-09-10",
  });

  await openMapWithDetail(
    page,
    baseURL,
    [destination({ id: 1, name: "Kyoto", trip_id: 10, status: "planned" }), osaka],
    kyoto,
    [japanTrip],
  );

  await page.locator('[data-testid="destination-pin"][aria-label*="Kyoto"]').click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-planned-dates")).toContainText("2026-09-05");
  await expect(page.getByTestId("destination-planned-dates")).toContainText("2026-09-08");
  await expect(page.getByTestId("destination-planned-trip-name")).toHaveText("Japan 2026");
  await expect(page.getByTestId("destination-planned-trip-range")).toContainText("2026-09-01");
  await expect(page.getByTestId("destination-planned-trip-range")).toContainText("2026-09-14");
  await expect(page.getByTestId("destination-planned-sibling-2")).toHaveText("Osaka");
  await expect(page.getByTestId("destination-planned-outside-range")).toHaveCount(0);
  // FR-016: a Planned place gets no gallery or note section — `VisitedPanel`'s own testids,
  // never rendered here.
  await expect(page.getByTestId("destination-photo-attach")).toHaveCount(0);
  await expect(page.getByTestId("destination-note-input")).toHaveCount(0);
});

test("a Planned place dated outside its Trip's range states the mismatch plainly (V4 scenario 2, FR-012)", async ({
  page,
  baseURL,
}) => {
  const japanTrip = trip({ id: 10, start_date: "2026-09-01", end_date: "2026-09-14" });
  const fukuoka = destination({
    id: 1,
    name: "Fukuoka",
    trip_id: 10,
    status: "planned",
    start_date: "2026-08-20",
    end_date: "2026-08-25",
    outside_trip_range: true,
    note: null,
    photographs: [],
  });

  await openMapWithDetail(
    page,
    baseURL,
    [destination({ id: 1, name: "Fukuoka", trip_id: 10, status: "planned", outside_trip_range: true })],
    fukuoka,
    [japanTrip],
  );

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-planned-outside-range")).toBeVisible();
});

test("a Planned place whose range contains today says so, matching the pin's own Currently-Traveling treatment (V4 scenario 3, FR-013)", async ({
  page,
  baseURL,
}) => {
  // Noon UTC — inside the range in every real-world timezone, so no `test.use({ timezoneId })`
  // is needed for this assertion (`frontend/AGENTS.md`'s clock-plus-timezone rule concerns dates
  // near midnight, not this).
  await page.clock.setFixedTime(Date.UTC(2026, 8, 5, 12, 0, 0));

  const japanTrip = trip({ id: 10, start_date: "2026-09-01", end_date: "2026-09-14" });
  const kyoto = destination({
    id: 1,
    name: "Kyoto",
    trip_id: 10,
    status: "planned",
    start_date: "2026-09-01",
    end_date: "2026-09-14",
    note: null,
    photographs: [],
  });

  await openMapWithDetail(
    page,
    baseURL,
    // The pin reads the **list** response, not `detail` — its own dates have to be repeated here
    // for `isCurrentlyTraveling` to see them, the same trap `map.spec.ts`'s own version of this
    // test exists to get right.
    [
      destination({
        id: 1,
        name: "Kyoto",
        trip_id: 10,
        status: "planned",
        start_date: "2026-09-01",
        end_date: "2026-09-14",
      }),
    ],
    kyoto,
    [japanTrip],
  );

  // The pin's own overlay (FR-002, R-004, `map.spec.ts`'s own coverage) — asserted here too so
  // this test proves the panel's message actually *matches* the pin, not just that it exists.
  await expect(page.locator('[data-testid="destination-pin"][data-traveling="true"]')).toHaveCount(1);

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-planned-traveling")).toBeVisible();
});

test("a Planned place with no Trip offers to attach one, and choosing a Trip actually attaches it (V4 scenario 4, FR-014, R-004)", async ({
  page,
  baseURL,
}) => {
  const japanTrip = trip({ id: 10, name: "Japan 2026" });
  const lisbon = destination({
    id: 1,
    name: "Lisbon",
    trip_id: null,
    status: "planned",
    note: null,
    photographs: [],
  });

  await openMapWithDetail(
    page,
    baseURL,
    [destination({ id: 1, name: "Lisbon", trip_id: null, status: "planned" })],
    lisbon,
    [japanTrip],
  );

  // R-004: the existing `PATCH /destinations/{id}`, no new endpoint — stubbed here rather than in
  // the shared `openMapWithDetail` helper, since only this test performs a write.
  let patchedTripId: number | undefined;
  await page.route("**/api/destinations/1", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { trip_id: number };
    patchedTripId = body.trip_id;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...lisbon, trip_id: body.trip_id, outside_trip_range: false }),
    });
  });

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-planned-no-trip")).toBeVisible();
  await expect(page.getByTestId("destination-planned-trip-name")).toHaveCount(0);

  await page.getByTestId("destination-planned-attach-trip").selectOption("10");

  await expect(page.getByTestId("destination-planned-trip-name")).toHaveText("Japan 2026");
  await expect(page.getByTestId("destination-planned-no-trip")).toHaveCount(0);
  expect(patchedTripId).toBe(10);
});

test("a Wishlist place is an honest empty state, with no blank fields presented as content (V5, FR-015, FR-016)", async ({
  page,
  baseURL,
}) => {
  const wishlist = destination({ id: 1, name: "Reykjavik", status: "wishlist" });
  await openMapWithDetail(
    page,
    baseURL,
    [destination({ id: 1, name: "Reykjavik", status: "wishlist" })],
    wishlist,
  );

  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();

  await expect(page.getByTestId("destination-wishlist-empty")).toBeVisible();
  await expect(page.getByTestId("destination-wishlist-empty")).toContainText("Nothing planned yet");

  // FR-016: no photograph gallery, no note section, on a place that is not Visited.
  await expect(page.getByTestId("destination-photo")).toHaveCount(0);
  await expect(page.getByTestId("destination-note-input")).toHaveCount(0);
  await expect(page.getByTestId("destination-photo-attach")).toHaveCount(0);
  // FR-015: no blank date fields presented as this panel's content (the shell's own editable date
  // inputs above are a separate concern — T012's structure note — and are unaffected by this test).
  await expect(page.getByTestId("destination-planned-dates")).toHaveCount(0);
});
