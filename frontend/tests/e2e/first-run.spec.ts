import { expect, test, type Page } from "@playwright/test";

/**
 * The first-run empty state (T068, spec Edge Cases), at the 375x667 floor.
 *
 * The spec's edge case is one sentence and it carries two requirements: *"First run with no items at
 * all — the calendar and backlog show an empty state that points at the capture action, rather than
 * an empty grid with no explanation."* Both surfaces, and the state must **point at the capture
 * action** rather than merely say the word "empty".
 *
 * ## The condition is the account, not the period
 *
 * `items.length === 0` over the whole loaded list — the calendar's read is unparameterised (R-007),
 * so an empty list means the creator has captured nothing at all. A month with nothing planned is a
 * different thing and gets no panel: the items exist, and the period arrows already answer it. This
 * is the same three-way split `FilteredEmpty` records, and the third case — the filter hiding
 * everything — is asserted here too, because a creator with nothing captured must not be told a
 * filter is the reason.
 *
 * ## Why the grid stays underneath
 *
 * The panel **accompanies** the calendar rather than replacing it, which is what the export's `1k`
 * draws (an empty six-week grid with the message over it) and what "drag it onto a day" needs to
 * mean anything. It is also what keeps the structural tests honest: `month-grid.spec.ts` and
 * `week-list.spec.ts` assert the 42-cell span and the seven sections **against an empty list**,
 * because that is the cleanest fixture for a question about structure. A first-run state that
 * removed the grid would force a decoy item into every one of those tests.
 *
 * The proxy is stubbed, as in every other file here — CI runs the production bundle with no FastAPI
 * behind it.
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
): Promise<void> {
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
  await expect(page.getByTestId("month-grid")).toBeVisible();
}

test.describe("the calendar", () => {
  test("explains itself to an account with nothing captured", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, []);

    const panel = page.getByTestId("first-run");
    await expect(panel).toBeVisible();

    // "points at the capture action" is the half of the edge case that a bare "No items" would miss,
    // and naming the control is how this panel does it. The export pointed at capture by *renaming*
    // the band's button to `+ CAPTURE FIRST IDEA`; that button is measured below and does not fit.
    await expect(panel).toContainText("+ Capture");
  });

  test("keeps the grid underneath, so the days are still there to drag onto", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, []);

    await expect(page.getByTestId("month-grid")).toBeVisible();
    await expect(page.getByTestId("day-cell")).toHaveCount(42);
  });

  test("says the same thing in the week view", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, []);

    await page.getByTestId("view-week").click();
    await expect(page.getByTestId("week-list")).toBeVisible();
    await expect(page.getByTestId("first-run")).toBeVisible();
  });

  test("retires as soon as one item exists, dated or not", async ({ page, baseURL }) => {
    // An undated idea is still an item, so this is not "nothing scheduled yet" — it is an account
    // that has started. The backlog is where it lives and the drawer says so.
    await openCalendar(page, baseURL, [item(1)]);
    await expect(page.getByTestId("first-run")).toHaveCount(0);
  });

  test("retires for a dated item in a month the creator is not looking at", async ({
    page,
    baseURL,
  }) => {
    // The condition is the *account*, not the period. An empty March with an item in April is an
    // ordinary calendar showing nothing planned, and the period arrows are the answer to it — the
    // same rule `FilteredEmpty` follows, and the reason both are stated rather than assumed.
    await openCalendar(page, baseURL, [item(1, { scheduled_date: "2026-04-20" })]);

    await expect(page.getByTestId("first-run")).toHaveCount(0);
    await expect(page.getByTestId("month-grid")).toBeVisible();
  });

  test("does not flash while the first read is still in flight", async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);

    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/content-items*", async (route) => {
      await held;
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.clock.setFixedTime(MARCH_2026);
    await page.goto("/calendar");
    await expect(page.getByTestId("month-grid")).toBeVisible();

    // `items` is empty before the answer arrives too, so a condition of `items.length === 0` alone
    // tells every creator they have captured nothing while their calendar is loading.
    await expect(page.getByTestId("first-run")).toHaveCount(0);

    release!();
    await expect(page.getByTestId("first-run")).toBeVisible();
  });

  test("is not replaced by the filter's empty state", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, []);

    await page.getByTestId("platform-filter-tiktok").click();

    // Three states, not two: nothing captured, the filter hid everything, and this period is empty.
    // A filter is not why *this* calendar is empty, so blaming it would send the creator to clear a
    // filter that would change nothing.
    await expect(page.getByTestId("filtered-empty")).toHaveCount(0);
    await expect(page.getByTestId("first-run")).toBeVisible();
  });
});

test.describe("the backlog drawer", () => {
  // Built at T035 from the same export panel (`1k`), and it is the half of this edge case that was
  // already standing. Asserted here rather than taken on trust, because the edge case names both
  // surfaces and a requirement covered by another task's tests is a requirement nothing pins if
  // that task's subject changes.
  test("points at the capture action in both of its states", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, []);

    await expect(page.getByTestId("backlog-empty-peek")).toContainText("+ Capture");

    await page.getByTestId("backlog-toggle").click();
    await expect(page.getByTestId("backlog-empty")).toContainText("Capture an idea");
  });
});

test("nothing on the first-run screen leaves the 375px viewport", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL, []);

  const viewport = page.viewportSize()!;

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);

  /**
   * The stronger half, and the reason it is here rather than left to the check above.
   *
   * `scrollWidth > clientWidth` is **weaker than it reads**: T077 measured `+ CAPTURE` sitting at
   * x=417 on a 375px viewport with that check still `false`, because the action band clips instead
   * of extending the document. The export's `1k` renames that button to `+ CAPTURE FIRST IDEA` —
   * roughly twice the width, into a band the T077 amendment measured at 356px of the 375px floor —
   * so this is exactly the row where a copy change would leave the screen without announcing it.
   */
  for (const id of ["capture-action", "view-month", "view-week", "period-next", "first-run"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x, id).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(viewport.width);
  }
});
