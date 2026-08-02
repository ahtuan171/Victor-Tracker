import { expect, test, type Page } from "@playwright/test";

/**
 * The overdue treatment (T045, spec Edge Cases and Overdue items, research.md R-006 addendum).
 *
 * Two things are being asserted here, and the second is the reason this task was left last in the
 * phase. The first is ordinary: an item whose day has passed while it is still unpublished carries a
 * dashed left border and the word OVERDUE, in the grid, in the week list, and at every chip size.
 *
 * The second is that **the treatment is derived from the creator's own clock and never from the
 * server's**. Vercel runs in UTC, so a creator in UTC+7 opening the app at 06:00 on the 5th is at
 * 23:00 UTC on the 4th — an item dated the 4th would render *not overdue* in the server HTML and
 * overdue a moment later on hydration. `overdueAcrossTheDateline` below is the test for that: the
 * same instant, the same fixture, two timezones, two different answers. Only the browser's clock can
 * produce that, which is what makes the assertion meaningful rather than decorative.
 */

const SESSION_COOKIE = "ch_session";

/** Thursday 12 March 2026, 10:00 in Asia/Ho_Chi_Minh (UTC+7). */
const MARCH_2026 = Date.UTC(2026, 2, 12, 3, 0, 0);

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
  at = MARCH_2026,
): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) }),
  );

  await page.clock.setFixedTime(at);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();
}

const chipOn = (page: Page, date: string) =>
  page.locator(`[data-date="${date}"]`).getByTestId("item-chip");

test.describe("in the creator's own timezone", () => {
  test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

  test("a passed day with the item unpublished is marked, in the grid", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "Rooftop b-roll cutdown", scheduled_date: "2026-03-10", status: "draft" }),
    ]);

    const chip = chipOn(page, "2026-03-10");
    await expect(chip).toHaveAttribute("data-overdue", "");
    // Said as well as drawn: a dashed border is nothing at all to a screen reader, and FR-017's
    // "without opening the item" has to hold for one too. At `micro` the word is `sr-only`.
    await expect(chip.getByTestId("item-overdue")).toHaveText("Overdue");

    // The treatment is a border, not a fourth status. The status cue underneath is untouched.
    await expect(chip.getByTestId("status-cue")).toHaveAttribute("data-status", "draft");
  });

  test("today and the future are not overdue", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "Due today", scheduled_date: "2026-03-12" }),
      item(2, { title: "Due next week", scheduled_date: "2026-03-19" }),
    ]);

    // Strictly before: the day itself is still the creator's to use, and an item due today reading as
    // overdue at 00:01 would be a nag rather than a signal.
    await expect(chipOn(page, "2026-03-12")).not.toHaveAttribute("data-overdue", "");
    await expect(chipOn(page, "2026-03-19")).not.toHaveAttribute("data-overdue", "");
    await expect(page.getByTestId("item-overdue")).toHaveCount(0);
  });

  test("a posted item is never overdue, however old", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "Long since out", scheduled_date: "2026-03-02", status: "posted" }),
    ]);

    await expect(chipOn(page, "2026-03-02")).not.toHaveAttribute("data-overdue", "");
  });

  test("the week list carries the same treatment, with the word visible", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "Rooftop b-roll cutdown", scheduled_date: "2026-03-10", status: "draft" }),
    ]);
    await page.getByTestId("view-week").click();

    const chip = page
      .locator('[data-testid="day-section"][data-date="2026-03-10"]')
      .getByTestId("item-chip");
    await expect(chip).toHaveAttribute("data-overdue", "");
    // `full` has room for the word, so it is drawn rather than only announced — the export's `1b`.
    await expect(chip.getByTestId("item-overdue")).toBeVisible();
  });

  test("the border is dashed and on the left only", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "Overdue", scheduled_date: "2026-03-10", status: "draft" }),
    ]);
    await page.getByTestId("view-week").click();

    // A misspelled Tailwind class renders nothing and fails no other check (see frontend/AGENTS.md),
    // and `border-l-dashed` is not a real utility — the chip uses an arbitrary property for it. This
    // is the assertion that the computed style actually arrived.
    const style = await page
      .locator('[data-testid="day-section"][data-date="2026-03-10"]')
      .getByTestId("item-chip")
      .evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          left: computed.borderLeftStyle,
          top: computed.borderTopStyle,
          width: computed.borderLeftWidth,
        };
      });

    // Dashed on the left only: dashing all four sides is how the export draws the *drag ghost*, so
    // the two treatments must not collapse into each other.
    expect(style.left).toBe("dashed");
    expect(style.top).toBe("solid");
    expect(parseFloat(style.width)).toBeGreaterThanOrEqual(3);
  });

  test("the header counts overdue items across every period, not the visible one", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "Overdue in March", scheduled_date: "2026-03-02", status: "draft" }),
      item(2, { title: "Overdue in January", scheduled_date: "2026-01-15", status: "idea" }),
      item(3, { title: "Posted in January", scheduled_date: "2026-01-16", status: "posted" }),
      item(4, { title: "Undated" }),
    ]);

    // Two of the four. The January item is the one the creator has lost track of, which is exactly
    // why the count must not narrow with the period.
    await expect(page.getByTestId("calendar-overdue-count")).toHaveText("2 overdue");

    await page.getByTestId("period-next").click();
    await expect(page.getByTestId("calendar-period")).toHaveText("April 2026");
    await expect(page.getByTestId("calendar-overdue-count")).toHaveText("2 overdue");
  });

  test("nothing overdue prints no count at all", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [item(1, { scheduled_date: "2026-03-19" })]);

    // A standing line that usually reads "0 overdue" is one the creator stops seeing.
    await expect(page.getByTestId("calendar-overdue-count")).toHaveCount(0);
    await expect(page.getByTestId("calendar-counts")).toContainText("1 item");
  });

  test("an undated item in the backlog is never overdue", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [item(1, { title: "Undated idea", status: "draft" })]);

    await page.getByTestId("backlog-toggle").click();
    await expect(page.getByTestId("backlog-row").getByTestId("item-chip")).not.toHaveAttribute(
      "data-overdue",
      "",
    );
  });
});

/**
 * The same instant and the same item, read in two zones either side of Greenwich.
 *
 * `2026-03-12T00:30:00Z` is **12 March** in UTC+7 (07:30) and still **11 March** in UTC-7 (17:30), so
 * an item dated 11 March is overdue in one and due today in the other. Two different answers from one
 * timestamp is the only thing that proves the *browser's* clock produced them rather than the
 * server's — which is the whole of research.md R-006's addendum, and the reason `dates.today()`
 * throws outside the browser.
 */
const AROUND_THE_DATELINE = Date.UTC(2026, 2, 12, 0, 30, 0);
const DATED_11_MARCH = [{ ...item(1, { title: "Rooftop b-roll", scheduled_date: "2026-03-11" }) }];

test.describe("east of Greenwich the day has turned over", () => {
  test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

  test("an item dated the 11th is overdue on the 12th", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, DATED_11_MARCH, AROUND_THE_DATELINE);
    await expect(chipOn(page, "2026-03-11")).toHaveAttribute("data-overdue", "");
  });
});

test.describe("west of Greenwich it is still the same day", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("the same item at the same instant is not overdue", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, DATED_11_MARCH, AROUND_THE_DATELINE);
    await expect(chipOn(page, "2026-03-11")).not.toHaveAttribute("data-overdue", "");
    await expect(page.getByTestId("calendar-overdue-count")).toHaveCount(0);
  });
});
