import { expect, test, type Page } from "@playwright/test";

/**
 * Period navigation (T044, FR-013, FR-022), at the 375x667 floor.
 *
 * FR-013 asks for two views **and** for adjacent-period navigation in both, so both halves are
 * asserted in both views. FR-022 asks for the controls to be in thumb reach, which is geometry and is
 * asserted as geometry rather than left to review.
 *
 * The last test here is the regression guard that matters most: navigating a period must issue **no
 * request**. The Phase 3 checkpoint's amendment fixed that the calendar reads the whole list once and
 * narrows client-side (R-007), because a `date_from`/`date_to` read returns no undated rows and would
 * empty the backlog drawer, which narrows the same state.
 *
 * **The clock and the timezone are both pinned** — see `frontend/AGENTS.md` for why pinning only the
 * instant encodes the author's location.
 */

const SESSION_COOKIE = "ch_session";

/** Thursday 12 March 2026, 10:00 local. March 2026 opens on a Sunday and the week is 9–15 March. */
const MARCH_2026 = Date.UTC(2026, 2, 12, 3, 0, 0);

test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

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

async function openCalendar(
  page: Page,
  baseURL: string | undefined,
  items: unknown[] = [],
): Promise<{ readonly calls: string[] }> {
  const calls: string[] = [];
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items*", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(items),
    });
  });

  await page.clock.setFixedTime(MARCH_2026);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  return { calls };
}

const title = (page: Page) => page.getByTestId("calendar-period");
const eyebrow = (page: Page) => page.getByTestId("calendar-eyebrow");

test("opens on the current month, and the toggle switches to the current week", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);

  await expect(title(page)).toHaveText("March 2026");
  // T049: the month view's eyebrow is the product mark plus the month-as-issue-number.
  await expect(eyebrow(page)).toHaveText("Victor Tracker · Issue #03");
  await expect(page.getByTestId("view-month")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("view-week").click();

  // The week containing today, not the first week of the month — the toggle changes the shape, not
  // where the creator is.
  await expect(page.getByTestId("week-list")).toBeVisible();
  await expect(page.getByTestId("month-grid")).toHaveCount(0);
  await expect(title(page)).toHaveText("9 – 15 March");
  await expect(eyebrow(page)).toHaveText("Week 11");
  await expect(page.getByTestId("view-week")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("view-month")).toHaveAttribute("aria-checked", "false");
});

test("steps to the adjacent month and back", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  await page.getByTestId("period-next").click();
  await expect(title(page)).toHaveText("April 2026");
  await expect(page.getByTestId("day-cell").first()).toHaveAttribute("data-date", "2026-03-30");

  await page.getByTestId("period-previous").click();
  await expect(title(page)).toHaveText("March 2026");

  // Back past where it started, which is the direction a creator uses to find what they missed.
  await page.getByTestId("period-previous").click();
  await expect(title(page)).toHaveText("February 2026");
});

test("steps to the adjacent week and back", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);
  await page.getByTestId("view-week").click();

  await page.getByTestId("period-next").click();
  await expect(title(page)).toHaveText("16 – 22 March");
  await expect(page.getByTestId("day-section").first()).toHaveAttribute("data-date", "2026-03-16");

  await page.getByTestId("period-previous").click();
  await expect(title(page)).toHaveText("9 – 15 March");
});

test("the arrows step whichever period the toggle is showing", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  // The same two buttons mean different things in the two views, which is why their accessible names
  // are built from the view rather than being a static "Previous".
  await expect(page.getByTestId("period-next")).toHaveAttribute("aria-label", "Next month");
  await page.getByTestId("view-week").click();
  await expect(page.getByTestId("period-next")).toHaveAttribute("aria-label", "Next week");
});

test("a navigated period survives the view toggle", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  await page.getByTestId("period-next").click();
  await expect(title(page)).toHaveText("April 2026");

  // April 2026 opens on a Wednesday, so the week containing the 1st runs from 30 March. Switching
  // view must not silently return the creator to today.
  await page.getByTestId("view-week").click();
  await expect(title(page)).toHaveText("30 Mar – 5 Apr");
});

test("today's items move out of view with the period, and the backlog does not", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [
    item(2, { title: "Undated idea" }),
    item(1, { title: "Dated in March", scheduled_date: "2026-03-12" }),
  ]);

  await expect(page.getByTestId("month-grid").getByTestId("item-chip")).toHaveCount(1);

  // Two months on, neither the March item nor any adjacent-month day carries it — and the backlog is
  // untouched, because it narrows the same loaded state and has nothing to do with the period.
  await page.getByTestId("period-next").click();
  await page.getByTestId("period-next").click();
  await expect(title(page)).toHaveText("May 2026");
  await expect(page.getByTestId("month-grid").getByTestId("item-chip")).toHaveCount(0);
  await expect(page.getByTestId("backlog-count").first()).toHaveText("1");
});

test("navigating issues no request at all", async ({ page, baseURL }) => {
  const { calls } = await openCalendar(page, baseURL, [item(1, { title: "Undated" })]);
  expect(calls).toHaveLength(1);

  await page.getByTestId("period-next").click();
  await page.getByTestId("view-week").click();
  await page.getByTestId("period-previous").click();
  await expect(title(page)).toHaveText("23 – 29 March");

  // R-007: the period is loaded once and every surface narrows it. A round trip behind every arrow
  // tap is what that rejects, and on Render's free tier the first one of the day can take tens of
  // seconds. A ranged read would additionally return no undated rows and empty the backlog.
  expect(calls).toHaveLength(1);
  await expect(page.getByTestId("backlog-count").first()).toHaveText("1");
});

test("the longest period title still does not push the body sideways", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub", url: baseURL! }]);
  await page.route("**/api/content-items*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  // 31 December 2026 is a Thursday, so its week is `28 Dec 2026 – 3 Jan 2027` — the longest title
  // this product can produce, in a skewed uppercase display face beside the item count. FR-021 gives
  // no allowance for a date the calendar happens to land on.
  await page.clock.setFixedTime(Date.UTC(2026, 11, 31, 3, 0, 0));
  await page.goto("/calendar");
  await page.getByTestId("view-week").click();
  await expect(title(page)).toHaveText("28 Dec 2026 – 3 Jan 2027");

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the controls are in thumb reach and meet the 44px tap floor", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  const viewport = page.viewportSize()!;
  for (const id of ["view-month", "view-week", "period-previous", "period-next"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    // FR-022 and `.claude/rules/design.md`: bottom half of the screen, not a top-right toolbar. The
    // period title these controls change is at the top — which is exactly the layout that tempts a
    // `‹ March 2026 ›` header 700px from a one-handed thumb.
    expect(box.y).toBeGreaterThan(viewport.height / 2);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // The tightest row in the product: toggle, two arrows and + CAPTURE inside 375px. Capture must not
  // be pushed off the edge by the controls that arrived beside it.
  const capture = (await page.getByTestId("capture-action").boundingBox())!;
  expect(capture.x + capture.width).toBeLessThanOrEqual(viewport.width);
});
