import { expect, test, type Page } from "@playwright/test";

/**
 * The month grid (T042, FR-012, FR-013, FR-021, research.md R-004), at the 375x667 floor.
 *
 * The proxy is stubbed for the reason every e2e file here stubs it: CI runs the production bundle
 * with no FastAPI behind it. What is asserted is the grid — its span, which day an item lands on,
 * what happens when a day holds more than it can show, and the one thing the Phase 3 checkpoint said
 * this task must **not** do.
 *
 * **The clock and the timezone are both pinned.** `page.clock.setFixedTime` fixes the instant; the
 * zone that turns it into a calendar day comes from the machine running the browser, so a test that
 * pins only the first encodes its author's location — green in UTC+7, red on GitLab's UTC runner.
 * That has happened in this repo before (see `frontend/AGENTS.md`).
 */

const SESSION_COOKIE = "ch_session";

/** Mid-March 2026, far from any boundary, in a zone where the fixed instant is the same day. */
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
  items: unknown[],
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

const cells = (page: Page) => page.getByTestId("day-cell");
const cell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`);

test("the grid is a fixed six-week span, Monday first", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL, []);

  // 42 cells in every month, so the drawer and the action band below do not move up and down as the
  // creator navigates at T044 — on a 375px screen that is a thumb target that stays put.
  await expect(cells(page)).toHaveCount(42);
  await expect(page.getByTestId("month-weekdays")).toHaveText("MTWTFSS");

  // March 2026 begins on a Sunday, so a Monday-first six-week span opens on 23 February and closes on
  // 5 April. Both are adjacent-month days, which is what makes the fixed span visible.
  await expect(cells(page).first()).toHaveAttribute("data-date", "2026-02-23");
  await expect(cells(page).last()).toHaveAttribute("data-date", "2026-04-05");
});

test("a dated item lands on its own day", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL, [
    item(1, { title: "Rooftop b-roll cutdown", scheduled_date: "2026-03-17", platform: "tiktok" }),
  ]);

  // FR-012. The chip is the micro one — cue and monogram, title only in the accessible name, because
  // a ~53px cell renders two characters of a title and that reads as a bug rather than a title.
  const chip = cell(page, "2026-03-17").getByTestId("item-chip");
  await expect(chip).toHaveAttribute("data-size", "micro");
  await expect(chip.getByTestId("item-title")).toHaveText("Rooftop b-roll cutdown");
  await expect(chip.getByTestId("platform-cue")).toHaveText("T");

  // And nowhere else. A grid that rendered every item in every cell would still pass an assertion
  // that only looked at the right day.
  await expect(page.getByTestId("month-grid").getByTestId("item-chip")).toHaveCount(1);
});

test("an undated item is on no day at all, and is still in the backlog", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [
    item(2, { title: "Undated idea" }),
    item(1, { title: "Dated", scheduled_date: "2026-03-10" }),
  ]);

  // FR-011 and US2 scenario 4 — "no item appears in both". This is the assertion the Phase 3
  // checkpoint's amendment exists to protect: the grid and the drawer read the same loaded state, so
  // a grid that fetched its own date range would take the backlog's rows away with it.
  await expect(page.getByTestId("month-grid").getByTestId("item-chip")).toHaveCount(1);
  await expect(page.getByTestId("backlog-count").first()).toHaveText("1");

  await page.getByTestId("backlog-toggle").click();
  await expect(page.getByTestId("backlog-row").getByTestId("item-title")).toHaveText([
    "Undated idea",
  ]);
});

test("the calendar's read carries no date range", async ({ page, baseURL }) => {
  const { calls } = await openCalendar(page, baseURL, [item(1, { title: "Undated" })]);

  // The regression guard for the T042 amendment. `date_from`/`date_to` bound `scheduled_date`, so a
  // ranged read returns no undated rows — and the drawer narrows the same state, so the backlog would
  // silently empty. The stub would happily answer a ranged request with everything, which is exactly
  // why this asserts the *request* rather than the rendered result.
  expect(calls).toHaveLength(1);
  expect(calls[0]).not.toContain("date_from");
  expect(calls[0]).not.toContain("date_to");
});

test("items on adjacent-month days are drawn, not hidden", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL, [
    item(1, { title: "Last Friday of February", scheduled_date: "2026-02-27" }),
  ]);

  const february = cell(page, "2026-02-27");
  await expect(february).not.toHaveAttribute("data-in-period", "");
  // Dimmer, but real: the item genuinely falls in the week the creator is looking at, and dropping it
  // would put it on no visible day while its week is on screen.
  await expect(february.getByTestId("item-chip")).toHaveCount(1);
});

test("a busy day shows a bounded number of chips and a reachable remainder", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [
    item(4, { title: "Fourth", scheduled_date: "2026-03-17" }),
    item(3, { title: "Third", scheduled_date: "2026-03-17" }),
    item(2, { title: "Second", scheduled_date: "2026-03-17" }),
    item(1, { title: "First", scheduled_date: "2026-03-17" }),
  ]);

  const busy = cell(page, "2026-03-17");
  await expect(busy.getByTestId("item-chip")).toHaveCount(2);

  const overflow = busy.getByTestId("day-overflow");
  await expect(overflow).toHaveText("+2 more");

  // The spec's edge case requires the remainder to be *reachable*, not merely counted. It expands in
  // place: no navigation, no second surface, and the grid grows inside its own scroll container.
  await overflow.click();
  await expect(busy.getByTestId("item-chip")).toHaveCount(4);
  await expect(overflow).toBeHidden();
});

test("the page body does not scroll horizontally with a full month", async ({ page, baseURL }) => {
  // Seven columns of chips at 375px is the likeliest thing in this product to push the body sideways,
  // and FR-021 forbids exactly that — wide content scrolls inside its own container.
  const busyMonth = Array.from({ length: 28 }, (_, index) =>
    item(index + 1, {
      title: `A rather long content title number ${index + 1}`,
      scheduled_date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      platform: "instagram",
    }),
  );
  await openCalendar(page, baseURL, busyMonth);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the backlog drawer keeps its ~64px, and the action band stays in thumb reach", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [
    item(2, { title: "Undated" }),
    item(1, { title: "Dated", scheduled_date: "2026-03-17" }),
  ]);

  // R-003a accepted the peek strip's cost in grid height, so T042 must not reclaim it — the strip is
  // what makes T054's drag a short distance rather than a route change.
  await expect(page.getByTestId("backlog-peek")).toBeVisible();

  const band = await page.getByTestId("capture-action").boundingBox();
  const viewport = page.viewportSize();
  expect(band!.y).toBeGreaterThan(viewport!.height / 2);
  expect(band!.height).toBeGreaterThanOrEqual(44);
});
