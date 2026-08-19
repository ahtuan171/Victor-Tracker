import { expect, test, type Page } from "@playwright/test";

/**
 * The 375px audit (T069, FR-021, SC-003) — every route and every overlay surface in the product.
 *
 * ## Why this file exists when thirteen others already check for overflow
 *
 * They all check the same thing, and **it is weaker than it reads**. The assertion everywhere in
 * `tests/e2e/` is `document.documentElement.scrollWidth > document.documentElement.clientWidth`, and
 * T077 measured `+ CAPTURE` sitting at **x=417 on a 375px viewport — 42px past the right edge — with
 * that check still `false`.** T068 reproduced it on a second control: the export's
 * `+ CAPTURE FIRST IDEA` label ends at **x=411**, again with no overflow reported. The reason is the
 * same in both cases — the action band is a flex row inside an `h-dvh` column, so it **clips** rather
 * than extending the document's scroll width, and the primary action simply leaves the screen with
 * nothing to announce it.
 *
 * FR-021 has two clauses and the scrollWidth check only covers the second: *"Every screen MUST be
 * **fully usable** at 375px width, **and** the page body MUST NOT scroll horizontally."* A control
 * 42px off the side satisfies the second while destroying the first, which is also SC-003's word —
 * "fully usable". So this audit asserts both, and the load-bearing half is the first.
 *
 * ## What is checked, and why it is a category rather than a list of testids
 *
 * Every **visible interactive control** must lie entirely within the viewport's width. The predicate
 * is the one `focus-states.spec.ts` settled on for the same reason it was settled on there: filtering
 * on *what an element is* — a natively interactive tag, or an interactive ARIA role — means a control
 * added next month is audited on the day it lands, where a list of testids covers exactly what its
 * author remembered.
 *
 * Non-controls are deliberately out of scope. Decorative and textual overflow that is *clipped on
 * purpose* is a design decision this product makes in several places (the day cell's titles, the peek
 * strip); a control that cannot be tapped is a broken screen. One clipped control is exempted below,
 * with its reason and its compensation.
 */

const SESSION_COOKIE = "ch_session";

/** Mid-March 2026, far from any boundary, in a zone where the fixed instant is the same day. */
const MARCH_2026 = Date.UTC(2026, 2, 12, 3, 0, 0);

test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

/**
 * A title long enough to push any layout that can be pushed.
 *
 * The audit is only as good as the content it runs against — an empty calendar overflows nothing —
 * so every surface here is loaded with the worst case the product accepts rather than a tidy one.
 */
const LONG_TITLE =
  "A rooftop b-roll cutdown with an absurdly long working title that no layout should widen for";

function item(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Item ${id}`,
    hook: null,
    platform: null,
    scheduled_date: null,
    status: "idea",
    published_url: null,
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-01T09:00:00Z",
    ...overrides,
  };
}

/** A busy month: overdue rows, every platform, every status, and a day holding more than it can show. */
const BUSY = [
  item(1, { title: LONG_TITLE, scheduled_date: "2026-03-11", platform: "tiktok", status: "draft" }),
  item(2, {
    title: LONG_TITLE,
    scheduled_date: "2026-03-11",
    platform: "youtube",
    status: "posted",
    published_url: "https://www.youtube.com/watch?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }),
  item(3, { scheduled_date: "2026-03-11", platform: "instagram" }),
  item(4, { scheduled_date: "2026-03-11" }),
  item(5, { title: LONG_TITLE, scheduled_date: "2026-02-02" }),
  item(6, { title: LONG_TITLE }),
  item(7, { platform: "instagram", status: "draft" }),
];

async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

async function openCalendar(
  page: Page,
  baseURL: string | undefined,
  items: unknown[] = BUSY,
): Promise<void> {
  await signedIn(page, baseURL);
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(items),
    });
  });

  await page.clock.setFixedTime(MARCH_2026);
  await page.goto("/calendar");
  await expect(page.getByTestId("capture-action")).toBeVisible();
}

/**
 * Every visible control whose box escapes the viewport horizontally, as `label@x..right`.
 *
 * Returned rather than asserted inside the page so a failure names the control and its coordinates —
 * "the band clips" is only actionable if you can see which control and by how much.
 */
async function controlsOutsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const INTERACTIVE_TAGS = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"];
    const INTERACTIVE_ROLES = [
      "button",
      "link",
      "radio",
      "checkbox",
      "switch",
      "tab",
      "menuitem",
      "option",
      "combobox",
      "slider",
      "textbox",
    ];

    const width = document.documentElement.clientWidth;
    const escaped: string[] = [];

    for (const el of Array.from(document.querySelectorAll("*"))) {
      const role = el.getAttribute("role");
      const isControl =
        INTERACTIVE_TAGS.includes(el.tagName) ||
        (role !== null && INTERACTIVE_ROLES.includes(role));
      if (!isControl) continue;

      // Hidden from assistive technology is not a control — the same criterion `focus-states.spec.ts`
      // uses to skip a focus trap's 1px sentinels, which would otherwise be audited as buttons.
      if (el.closest('[aria-hidden="true"]') !== null) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;

      /*
       * Three exemptions, each a design decision with a stated compensation rather than a tolerance.
       */

      // The backlog peek strip is a single clipped line by design — `overflow-hidden`, not a
      // scroller — because it is a *glance* and the expanded drawer is how the backlog is browsed
      // (R-003a, and the note in `BacklogDrawer.tsx`). So its last chip can be half off the edge on a
      // full backlog, and every one of them is reachable at full size one tap away in the expanded
      // drawer, which this file audits separately.
      if (el.closest('[data-testid="backlog-peek-list"]') !== null) continue;

      // `DestinationStrip`'s list is the same shape as the peek strip, one layer more forgiving: it
      // is a real `overflow-x-auto` scroller (`DestinationStrip.tsx`'s own docstring — ".claude/
      // rules/design.md`'s prescribed answer for wide content), so a card past the fold is reachable
      // by scrolling the strip itself, not only by a second surface.
      if (el.closest('[data-testid="destination-strip-list"]') !== null) continue;

      // A pin lives inside a pannable, zoomable map canvas — the map *is* its own scrolling
      // container, the same category as the two rows above. Selecting a place eases the camera
      // toward it (`MapView.tsx`'s `easeToDestination`), which is precisely why an *unselected* pin
      // can land far outside 375px once the camera settles at street-level zoom: it is off the
      // visible map area, reachable by panning or zooming back out, not a broken control. Narrowly
      // scoped to the marker itself (`data-testid`, not `closest`) so `map-canvas`'s other children —
      // the attribution control, any zoom UI — stay audited.
      if (el.getAttribute("data-testid") === "destination-pin") continue;

      // Half a pixel of subpixel rounding is not a layout defect. Anything a creator could notice is.
      if (rect.left < -0.5 || rect.right > width + 0.5) {
        const label =
          el.getAttribute("data-testid") ??
          `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 20)}`;
        escaped.push(`${label}@${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }

    return escaped;
  });
}

/**
 * Waits until a locator's own bounding box stops changing between two consecutive reads — a
 * DOM-observable consequence of an animation (a map camera easing, in this file's case) having
 * settled, the same shape `place-selection.spec.ts`'s `waitUntilSeparated` already uses.
 */
async function waitUntilStable(locator: ReturnType<Page["locator"]>): Promise<void> {
  let previous: string | null = null;
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const current = box === null ? null : `${box.x},${box.y},${box.width},${box.height}`;
      const stable = current !== null && current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
}

/** The check every other file in this suite uses. Kept, because it catches the other half. */
async function bodyScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Both halves of FR-021, on whatever is currently on screen. */
async function auditSurface(page: Page, surface: string): Promise<void> {
  expect(await controlsOutsideViewport(page), `${surface}: controls outside the viewport`).toEqual(
    [],
  );
  expect(await bodyScrollsSideways(page), `${surface}: body scrolls horizontally`).toBe(false);
}

/**
 * 002 T028 (Phase 3 checkpoint) ran this sweep against a fabricated light presentation, because the
 * real switch (Phase 5, T032–T037) did not exist yet: `app/layout.tsx` hard-coded `class="dark"` on
 * `<html>` and a `page.evaluate` override forced the light token values in afterward, on every
 * navigation, because hydration silently discarded anything written before it (two dead-end
 * mechanisms tried and rejected — `addInitScript`-based `classList` and `<style>`-element approaches
 * both got reconciled away).
 *
 * **T037 replaces all of that with the real mechanism now that it exists.** `setThemeCookie` below
 * sets `ch_theme` before the test's *first* navigation; `app/layout.tsx` reads it server-side
 * (T033), so light is correct from the very first response and needs no post-navigation correction —
 * unlike the old override, this cookie survives every subsequent `goto`/`reload` in the same test on
 * its own, which is why the per-navigation `applyTheme(page)` calls this replaces are simply gone
 * rather than swapped for an equivalent. This sweep still is not a substitute for `theme.spec.ts`'s
 * own tests (persistence, first-paint correctness, device reconciliation) — it answers one question,
 * "does every surface still fit and show every control", under the real switch instead of a stand-in
 * for it.
 */
async function setThemeCookie(page: Page, baseURL: string | undefined, theme: "dark" | "light"): Promise<void> {
  if (theme !== "light") return;
  await page.context().addCookies([{ name: "ch_theme", value: "light", url: baseURL! }]);
}

for (const theme of ["dark", "light"] as const) {
  test.describe(`[${theme}]`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await setThemeCookie(page, baseURL, theme);
    });

    test.describe("the routes", () => {
      test("/login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await auditSurface(page, "/login");
  });

  test("/login carrying an error message", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Incorrect email or password" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("creator@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator("#login-error")).toBeVisible();
    await auditSurface(page, "/login with an error");
  });

  test("/calendar, month view, busy", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await expect(page.getByTestId("month-grid")).toBeVisible();

    await auditSurface(page, "/calendar month");
  });

  test("/calendar, month view, a day expanded past its cap", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);

    // The `+N more` control is the one place a day cell is allowed to grow, and it grows *inside* a
    // ~53px column — the narrowest place in the product a control can be put.
    await page.getByTestId("day-overflow").first().click();
    await auditSurface(page, "/calendar month, day expanded");
  });

  test("/calendar, week view, busy", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("view-week").click();
    await expect(page.getByTestId("week-list")).toBeVisible();

    await auditSurface(page, "/calendar week");
  });

  test("/calendar, a cross-boundary week title", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("view-week").click();

    // `28 Dec 2026 – 3 Jan 2027` is the longest title this product can produce, and it shares the
    // header row with the nav drawer trigger (T029; it held the sign-out control here until 002
    // T030 moved that into the drawer itself).
    await page.clock.setFixedTime(Date.UTC(2026, 11, 30, 3, 0, 0));
    await page.reload();
    // The view is client state, so a reload lands back on the month grid.
    await page.getByTestId("view-week").click();
    await expect(page.getByTestId("week-list")).toBeVisible();
    await expect(page.getByTestId("calendar-period")).toContainText("Jan");

    await auditSurface(page, "/calendar week, cross-boundary title");
  });

  test("/calendar, the filtered empty state", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [item(1, { platform: "tiktok" })]);
    await page.getByTestId("platform-filter-youtube").click();
    await expect(page.getByTestId("filtered-empty")).toBeVisible();

    await auditSurface(page, "/calendar filtered empty");
  });

  test("/calendar, the first-run state", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, []);
    await expect(page.getByTestId("first-run")).toBeVisible();

    await auditSurface(page, "/calendar first run");
  });

  /**
   * `/` is a server-side redirect and renders no surface of its own, so what is audited is that it
   * arrives somewhere already audited rather than at a screen nothing covers.
   */
  test("/ redirects to a surface this file audits", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await auditSurface(page, "/ after redirect");
  });
});

test.describe("the overlay surfaces", () => {
  test("the capture sheet", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("capture-action").click();

    const field = page.getByPlaceholder("Rooftop b-roll cutdown");
    await expect(field).toBeInViewport();
    await field.fill(LONG_TITLE);

    await auditSurface(page, "capture sheet");
  });

  test("the backlog drawer, expanded", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("backlog-toggle").click();
    await expect(page.getByTestId("backlog-expanded")).toBeVisible();

    await auditSurface(page, "backlog drawer expanded");
  });

  test("the item sheet, every field filled", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-list").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-save")).toBeInViewport();

    // The link row is the widest thing on the sheet, and the column accepts 2048 characters.
    await page.getByTestId("item-link-input").fill(`https://www.tiktok.com/@creator/video/${"9".repeat(64)}`);

    await auditSurface(page, "item sheet");
  });

  test("the item sheet carrying a 409 refusal", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.route("**/api/content-items/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          code: "platform_required",
          detail: "An item cannot leave ideas without a platform. Pick one first.",
        }),
      });
    });

    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-list").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-save")).toBeInViewport();

    await page.getByTestId("status-option-draft").click();
    await page.getByTestId("item-save").click();
    await expect(page.getByTestId("item-sheet-message")).toBeVisible();

    await auditSurface(page, "item sheet with a 409");
  });

  test("the delete confirmation", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-list").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-save")).toBeInViewport();

    await page.getByTestId("item-delete").click();
    await expect(page.getByTestId("delete-confirm")).toBeVisible();

    await auditSurface(page, "delete confirmation");
  });
});

/**
 * `/map` and its overlays (T029, FR-021, SC-005) — found missing by this iteration's own
 * `/speckit-analyze` pass: this whole file is hand-maintained per-surface, not an automatic sweep,
 * and `/map` was never added even before `004`, so `MapView`, `DestinationStrip`, `TripPanel`,
 * `QuickAdd`, `StatusFilter` and `LocationSearch` (`003`) carried no viewport-audit coverage at
 * all — and `004`'s own four new surfaces (`PlaceConfirm`, `VisitedPanel`, `PlannedPanel`,
 * `WishlistPanel`) would have shipped the same way if this gap had not been caught first.
 */
test.describe("/map", () => {
  const KYOTO = { name: "Kyoto", address: "Kyoto Prefecture, Japan", latitude: 35.0116, longitude: 135.7681 };

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

  function trip(overrides: Record<string, unknown> = {}) {
    return {
      id: 10,
      name: "A rather long trip name that pushes the panel's width to its limit",
      start_date: "2026-09-01",
      end_date: "2026-09-14",
      status: "planned",
      created_at: "2026-08-01T09:00:00Z",
      updated_at: "2026-08-01T09:00:00Z",
      ...overrides,
    };
  }

  const VISITED = destination({
    id: 1,
    name: "Porto",
    status: "visited",
    note: "Rain the whole time, worth it for the bookshop.",
    photographs: [
      { id: 1, url: "https://stub-r2.example.com/photo-1.jpg", created_at: "2026-08-01T09:00:00Z" },
    ],
  });
  const PLANNED = destination({
    id: 2,
    name: "Kyoto",
    latitude: 35.0116,
    longitude: 135.7681,
    status: "planned",
    trip_id: 10,
    start_date: "2026-09-05",
    end_date: "2026-09-08",
  });
  const WISHLIST = destination({ id: 3, name: "Reykjavik", latitude: 64.1466, longitude: -21.9426 });
  const LIST = [VISITED, PLANNED, WISHLIST].map((d) => ({ ...d, note: undefined, photographs: undefined }));
  const TRIP = trip();

  async function openMap(page: Page, baseURL: string | undefined): Promise<void> {
    await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
    await page.route("**/api/destinations", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LIST) });
    });
    for (const detail of [VISITED, PLANNED, WISHLIST]) {
      await page.route(new RegExp(`/api/destinations/${detail.id}$`), async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) });
      });
    }
    await page.route("**/api/trips", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([TRIP]) });
    });
    await page.route(new RegExp(`/api/trips/${TRIP.id}$`), async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TRIP) });
    });
    await page.route("**/api/locations/search*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([KYOTO]) });
    });

    await page.goto("/map");
    await page.getByTestId("map-canvas").waitFor();
  }

  test("the map, populated — MapView, DestinationStrip, StatusFilter, QuickAdd", async ({
    page,
    baseURL,
  }) => {
    await openMap(page, baseURL);
    await expect(page.getByTestId("destination-strip-list")).toBeVisible();
    await expect(page.getByTestId("status-filter")).toBeVisible();

    await auditSurface(page, "/map populated");
  });

  test("QuickAdd's LocationSearch, results", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId("quick-add-search-input").fill("Kyoto");
    await page.getByTestId("quick-add-search-input").press("Enter");
    await expect(page.getByTestId("quick-add-search-results")).toBeVisible();

    await auditSurface(page, "QuickAdd search results");
  });

  test("QuickAdd's status step", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId("quick-add-search-input").fill("Kyoto");
    await page.getByTestId("quick-add-search-input").press("Enter");
    await page.getByTestId("quick-add-search-add").first().click();
    await expect(page.getByTestId("quick-add-status-step")).toBeVisible();

    await auditSurface(page, "QuickAdd status step");
  });

  test("TripPanel, open", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId("open-trips").click();
    await expect(page.getByTestId("trip-panel")).toBeVisible();

    await auditSurface(page, "TripPanel");
  });

  test("PlaceConfirm", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.locator('[data-testid="destination-pin"][aria-label*="Porto"]').click();
    const dismiss = page.getByTestId("place-confirm-dismiss");
    await expect(dismiss).toBeVisible();

    // `PlaceConfirm` is a MapLibre popup anchored to the selected pin, and selecting a place eases
    // the camera toward it (`MapView.tsx`'s `easeToDestination`) — so the popup keeps repositioning
    // itself, mid-animation, until the camera settles. Auditing before then reads a transient
    // in-flight position, not the one the owner would ever actually see. `waitUntilStable` is the
    // same "poll a DOM-observable consequence of the camera settling" shape `place-selection.spec.ts`
    // already uses for the same reason.
    await waitUntilStable(dismiss);

    await auditSurface(page, "PlaceConfirm");
  });

  test("DestinationSheet — VisitedPanel", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId(`destination-card-${VISITED.id}`).click();
    await expect(page.getByTestId("destination-sheet-close")).toBeVisible();
    await expect(page.getByTestId("destination-photo")).toBeVisible();

    await auditSurface(page, "DestinationSheet, VisitedPanel");
  });

  test("DestinationSheet — PlannedPanel", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId(`destination-card-${PLANNED.id}`).click();
    await expect(page.getByTestId("destination-sheet-close")).toBeVisible();
    await expect(page.getByTestId("destination-planned-trip-name")).toBeVisible();

    await auditSurface(page, "DestinationSheet, PlannedPanel");
  });

  test("DestinationSheet — WishlistPanel", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId(`destination-card-${WISHLIST.id}`).click();
    await expect(page.getByTestId("destination-sheet-close")).toBeVisible();
    await expect(page.getByTestId("destination-wishlist-empty")).toBeVisible();

    await auditSurface(page, "DestinationSheet, WishlistPanel");
  });

  test("TravelLogDrawer", async ({ page, baseURL }) => {
    await openMap(page, baseURL);

    await page.getByTestId("open-travel-log").click();
    await expect(page.getByTestId("travel-log-drawer")).toBeVisible();

    await auditSurface(page, "TravelLogDrawer");
  });
});
  });
}
