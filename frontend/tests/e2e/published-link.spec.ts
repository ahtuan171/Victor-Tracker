import { expect, test, type Page } from "@playwright/test";

/**
 * Opening the published post from the calendar (T065, FR-019, US5 scenario 3, constitution II).
 *
 * Two separable subjects, and the second is the reason this task cites the constitution rather than
 * only a functional requirement:
 *
 * 1. **The link is reachable without opening a form.** A `full` chip's row carries an open control
 *    beside it — in the week list and in the expanded backlog drawer — and the item sheet carries one
 *    beside the field, which is how the *month* grid reaches it (its chips are `micro`, in a ~53px
 *    cell where a 44px control does not fit).
 * 2. **Opening it leaks nothing.** `rel="noopener noreferrer"` is asserted verbatim rather than
 *    approximately: without `noreferrer` the browser hands TikTok, Instagram or YouTube the calendar's
 *    own URL as a `Referer` on every tap — a third party given the address of a private planning
 *    surface as a side effect of an ordinary link, which is what constitution II forbids.
 *
 * Nothing here clicks through to a real destination: `target="_blank"` plus a live host would open a
 * second tab against the network from CI. The attributes *are* the behaviour — a browser's decision
 * to withhold the referrer is made from them — so they are what is asserted.
 *
 * The clock and the timezone are both pinned, for the reason recorded in `frontend/AGENTS.md`: fixing
 * the instant alone encodes the author's location and goes red on GitLab's UTC runner.
 */

const SESSION_COOKIE = "ch_session";

/** Thursday 12 March 2026, 10:00 local — mid-week, so the week is 9-15 March. */
const MARCH_2026 = Date.UTC(2026, 2, 12, 3, 0, 0);

test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

const LIVE_POST = "https://www.tiktok.com/@creator/video/7401234567890123456";

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

/** A posted item on the 12th, carrying a link — the ordinary subject of every test below. */
const POSTED_WITH_LINK = item(1, {
  title: "Ring light teardown",
  platform: "tiktok",
  scheduled_date: "2026-03-12",
  status: "posted",
  published_url: LIVE_POST,
});

async function openCalendar(
  page: Page,
  baseURL: string | undefined,
  items: unknown[],
): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) }),
  );

  await page.clock.setFixedTime(MARCH_2026);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();
}

async function openWeek(page: Page, baseURL: string | undefined, items: unknown[]): Promise<void> {
  await openCalendar(page, baseURL, items);
  await page.getByTestId("view-week").click();
  await expect(page.getByTestId("week-list")).toBeVisible();
}

const link = (page: Page) => page.getByTestId("item-published-link");

test.describe("in the week list", () => {
  test("a stored link is one tap from the calendar, and opens outside the app", async ({
    page,
    baseURL,
  }) => {
    await openWeek(page, baseURL, [POSTED_WITH_LINK]);

    const control = page.getByTestId("week-list").getByTestId("item-published-link");
    await expect(control).toHaveCount(1);
    await expect(control).toHaveAttribute("href", LIVE_POST);
    // US5 scenario 3: "it opens the live post *outside the app*".
    await expect(control).toHaveAttribute("target", "_blank");
  });

  test("the referrer is withheld, which is the whole of constitution II here", async ({
    page,
    baseURL,
  }) => {
    await openWeek(page, baseURL, [POSTED_WITH_LINK]);

    /*
     * Asserted as an exact string, both tokens, in order. `noreferrer` is the half that stops the
     * calendar's URL reaching the platform; `noopener` denies the opened tab a handle back. Modern
     * browsers imply the second from the first, so a partial match here would pass on a `rel` that
     * had lost `noreferrer` — the token that actually matters — which is why this is not a regex.
     */
    await expect(link(page).first()).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("the control is a sibling of the chip, never nested inside it", async ({ page, baseURL }) => {
    await openWeek(page, baseURL, [POSTED_WITH_LINK]);

    // `ItemChip` is a `<button>`, and an `<a>` inside a button is invalid HTML — the parser hoists
    // it out and what gets tapped is undefined. The two also go to different places: the sheet and
    // the live post. This assertion is what stops a later "tidy" from moving it in.
    const chip = page.getByTestId("week-list").getByTestId("item-chip").first();
    await expect(chip).toHaveJSProperty("tagName", "BUTTON");
    await expect(chip.locator("a")).toHaveCount(0);

    // Two children of one row, side by side and vertically aligned.
    const chipBox = (await chip.boundingBox())!;
    const linkBox = (await link(page).first().boundingBox())!;
    expect(linkBox.x).toBeGreaterThan(chipBox.x + chipBox.width - 1);
  });

  test("it meets the 44px tap floor", async ({ page, baseURL }) => {
    await openWeek(page, baseURL, [POSTED_WITH_LINK]);

    const box = (await link(page).first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("an item with no link carries no control", async ({ page, baseURL }) => {
    await openWeek(page, baseURL, [
      item(2, { title: "Not posted yet", scheduled_date: "2026-03-12" }),
    ]);

    await expect(page.getByTestId("week-list").getByTestId("item-chip")).toHaveCount(1);
    await expect(link(page)).toHaveCount(0);
  });

  test("a link retained after leaving posted is still openable", async ({ page, baseURL }) => {
    /*
     * The condition is the **presence of a link**, not `status === "posted"` — T065's task line was
     * amended to say so. FR-008a retains the link when an item moves back out of `posted`, and the
     * post it points at is still live, so gating on status would take a working link off the calendar
     * the moment the creator reversed a status. US5 scenario 3 states the condition without
     * mentioning status: "Given a stored published link, when the creator opens it...".
     */
    await openWeek(page, baseURL, [
      item(3, {
        title: "Reversed to draft",
        platform: "youtube",
        scheduled_date: "2026-03-12",
        status: "draft",
        published_url: LIVE_POST,
      }),
    ]);

    await expect(link(page)).toHaveCount(1);
    await expect(link(page)).toHaveAttribute("href", LIVE_POST);
  });
});

test.describe("in the backlog drawer", () => {
  /** Posted, with a link, and no scheduled date — so it lives in the backlog rather than the grid. */
  const UNDATED_POSTED = item(4, {
    title: "Posted but never dated",
    platform: "instagram",
    status: "posted",
    published_url: LIVE_POST,
  });

  test("an expanded row carries the control", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [UNDATED_POSTED]);
    await page.getByTestId("backlog-toggle").click();

    const row = page.getByTestId("backlog-row").first();
    await expect(row.getByTestId("item-published-link")).toHaveAttribute("href", LIVE_POST);
    await expect(row.getByTestId("item-published-link")).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  test("the collapsed peek strip does not, and that is the same budget the title has", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, [UNDATED_POSTED]);

    // The strip is one clipped line showing at most four items — a glance, `overflow-hidden`, where a
    // 44px control per row would halve how many are visible. One tap expands it, and the expanded
    // row above has the control. Pinned so the exclusion stays a decision rather than an oversight.
    await expect(page.getByTestId("backlog-peek-list").getByTestId("item-chip")).toHaveCount(1);
    await expect(page.getByTestId("backlog-peek-list").getByTestId("item-published-link")).toHaveCount(
      0,
    );
  });
});

test("the month grid's micro chips carry no control, because 44px does not fit a 53px cell", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [POSTED_WITH_LINK]);

  /*
   * The stated exclusion, asserted so it cannot be quietly "fixed" into a sub-44px tap target.
   * A day cell is ~53px wide at the 375px floor — the width at which the micro chip already drops the
   * title entirely — and `.claude/rules/design.md` makes 44px a hard floor rather than a preference.
   * The month grid reaches the link through the item sheet instead; the test below is that path.
   */
  await expect(page.getByTestId("month-grid").getByTestId("item-chip")).toHaveCount(1);
  await expect(page.getByTestId("month-grid").getByTestId("item-published-link")).toHaveCount(0);
});

test.describe("on the item sheet", () => {
  test("the month grid reaches the link here, beside the field", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [POSTED_WITH_LINK]);
    await page.getByTestId("month-grid").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-link-input")).toBeVisible();

    // The sheet's body scrolls, so the link field can be below the fold — see `frontend/AGENTS.md`.
    await page.getByTestId("item-link-input").scrollIntoViewIfNeeded();

    await expect(link(page)).toHaveAttribute("href", LIVE_POST);
    await expect(link(page)).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link(page)).toHaveAttribute("target", "_blank");
  });

  test("it follows the draft, so a pasted link can be checked before saving", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, [
      item(5, { title: "Just posted", platform: "tiktok", scheduled_date: "2026-03-12" }),
    ]);
    await page.getByTestId("month-grid").getByTestId("item-chip").first().click();
    await page.getByTestId("item-link-input").scrollIntoViewIfNeeded();

    // Nothing stored yet, so nothing to open.
    await expect(link(page)).toHaveCount(0);

    await page.getByTestId("item-link-input").fill(LIVE_POST);
    await expect(link(page)).toHaveAttribute("href", LIVE_POST);
  });

  test("a draft that is not http(s) never becomes an href", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [
      item(6, { title: "Careful", platform: "tiktok", scheduled_date: "2026-03-12" }),
    ]);
    await page.getByTestId("month-grid").getByTestId("item-chip").first().click();
    await page.getByTestId("item-link-input").scrollIntoViewIfNeeded();

    /*
     * The sheet is the only surface where the value is the creator's live draft rather than a row the
     * backend has already refused anything but `http(s)` for (T030's `PublishedUrl`, tested at T063).
     * So it is the only place a `javascript:` string could reach an `href`, and the control gates on
     * the **contract's own** pattern — never a stricter one, which would refuse links the API stores.
     */
    await page.getByTestId("item-link-input").fill("javascript:alert(1)");
    await expect(link(page)).toHaveCount(0);

    // And the contract's pattern is genuinely the rule: T063 characterised a bare scheme as accepted,
    // so the client must not be the stricter of the two.
    await page.getByTestId("item-link-input").fill("https://");
    await expect(link(page)).toHaveCount(1);
  });
});
