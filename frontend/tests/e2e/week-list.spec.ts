import { expect, test, type Page } from "@playwright/test";

/**
 * The week view (T043, FR-013, FR-021, research.md R-004), at the 375x667 floor.
 *
 * The proxy is stubbed for the reason every e2e file here stubs it: CI runs the production bundle
 * with no FastAPI behind it. What is asserted is the shape R-004 chose — **seven vertical sections,
 * never seven columns** — and the two things that follow from it: full-size chips with readable
 * titles, and no chip cap.
 *
 * **The clock and the timezone are both pinned.** `page.clock.setFixedTime` fixes the instant; the
 * zone that turns it into a calendar day comes from the machine running the browser, so a test that
 * pins only the first encodes its author's location — green in UTC+7, red on GitLab's UTC runner.
 * That has happened in this repo before (see `frontend/AGENTS.md`).
 */

const SESSION_COOKIE = "ch_session";

/** Thursday 12 March 2026, 10:00 local — mid-week, so the week is 9–15 March. */
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

async function openWeek(page: Page, baseURL: string | undefined, items: unknown[]): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(items),
    });
  });

  await page.clock.setFixedTime(MARCH_2026);
  await page.goto("/calendar");
  await page.getByTestId("view-week").click();
  await expect(page.getByTestId("week-list")).toBeVisible();
}

const sections = (page: Page) => page.getByTestId("day-section");
const section = (page: Page, date: string) =>
  page.locator(`[data-testid="day-section"][data-date="${date}"]`);

test("is seven vertical sections, Monday to Sunday", async ({ page, baseURL }) => {
  await openWeek(page, baseURL, []);

  await expect(sections(page)).toHaveCount(7);
  await expect(sections(page).first()).toHaveAttribute("data-date", "2026-03-09");
  await expect(sections(page).last()).toHaveAttribute("data-date", "2026-03-15");

  // The shape R-004 chose, asserted rather than assumed: sections stack, so each one starts below the
  // last. Seven *columns* at 375px is ~53px each — the width at which the month grid already has to
  // drop the title — and FR-021 forbids the horizontal scroll that would buy the room back.
  const first = await sections(page).first().boundingBox();
  const second = await sections(page).nth(1).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
  expect(second!.x).toBe(first!.x);
  expect(second!.width).toBeGreaterThan(300);
});

test("chips are full size, so the title is readable without opening the item", async ({
  page,
  baseURL,
}) => {
  await openWeek(page, baseURL, [
    item(1, {
      title: "Three-lens kit rundown",
      scheduled_date: "2026-03-09",
      platform: "instagram",
      status: "draft",
    }),
  ]);

  // This is the whole reason the week view exists as a separate shape: the month grid's micro chip
  // drops the title, and a creator opening the week wants to read what is actually planned.
  const chip = section(page, "2026-03-09").getByTestId("item-chip");
  await expect(chip).toHaveAttribute("data-size", "full");
  await expect(chip.getByTestId("item-title")).toBeVisible();
  await expect(chip.getByTestId("item-title")).toHaveText("Three-lens kit rundown");
  await expect(chip.getByTestId("platform-cue")).toHaveText("I");
});

test("a day with several items shows all of them — no cap, unlike the day cell", async ({
  page,
  baseURL,
}) => {
  await openWeek(
    page,
    baseURL,
    [1, 2, 3, 4].map((id) => item(id, { title: `Item ${id}`, scheduled_date: "2026-03-12" })),
  );

  // `DayCell` caps at two and offers `+N more` because 42 cells share one screen. Seven sections in a
  // scrolling container have no such budget, so nothing is hidden and there is no overflow control.
  await expect(section(page, "2026-03-12").getByTestId("item-chip")).toHaveCount(4);
  await expect(page.getByTestId("week-list").getByTestId("day-overflow")).toHaveCount(0);
});

test("an empty day is named as empty and still offers somewhere to land", async ({
  page,
  baseURL,
}) => {
  await openWeek(page, baseURL, [item(1, { scheduled_date: "2026-03-12" })]);

  const tuesday = section(page, "2026-03-10");
  await expect(tuesday.getByTestId("day-meta")).toHaveText("empty");
  // The dashed placeholder is T054's drop target: a day with no items still has to be a place a chip
  // can be dragged onto.
  await expect(tuesday.getByTestId("day-empty")).toBeVisible();
});

test("today's section is marked, and the mark comes from the browser's clock", async ({
  page,
  baseURL,
}) => {
  await openWeek(page, baseURL, [item(1, { title: "On today", scheduled_date: "2026-03-12" })]);

  // 12 March is the fixed instant's calendar day in this timezone. The marker is plain text, not a
  // colour, so it survives the greyscale check SC-004 sets for the status cues (quickstart V3).
  const today = section(page, "2026-03-12");
  await expect(today).toHaveAttribute("data-today", "");
  await expect(today.getByTestId("day-meta")).toHaveText("today");
  await expect(page.locator('[data-testid="day-section"][data-today]')).toHaveCount(1);
});

test("undated items stay out of the week and in the backlog", async ({ page, baseURL }) => {
  await openWeek(page, baseURL, [
    item(2, { title: "Undated idea" }),
    item(1, { title: "Dated", scheduled_date: "2026-03-12" }),
  ]);

  // US2 scenario 4 — "no item appears in both". The week list and the drawer narrow the same loaded
  // state, which is what the Phase 3 amendment to T042 protects.
  await expect(page.getByTestId("week-list").getByTestId("item-chip")).toHaveCount(1);
  await expect(page.getByTestId("backlog-count").first()).toHaveText("1");
});

test("the page body does not scroll horizontally with long titles", async ({ page, baseURL }) => {
  await openWeek(
    page,
    baseURL,
    Array.from({ length: 7 }, (_, index) =>
      item(index + 1, {
        title: "An unusually long content title that would push a narrow column sideways",
        scheduled_date: `2026-03-${String(index + 9).padStart(2, "0")}`,
        platform: "youtube",
      }),
    ),
  );

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
