import { expect, test, type Page } from "@playwright/test";

/**
 * The platform filter (T061, FR-016, FR-022, SC-005, US4), at the 375x667 floor.
 *
 * US4's four acceptance scenarios drive most of this file, and two tests here are regression guards
 * rather than scenarios:
 *
 * * **Filtering issues no request.** The sibling of `period-nav.spec.ts`'s "navigating issues no
 *   request at all", and the same amendment is behind both: the calendar reads the whole list once
 *   and every surface narrows it client-side (R-007). Sending `platform` to `GET /content-items`
 *   would bound the server's answer for the drawer as well as the grid, and cost a round trip per
 *   toggle against SC-005's one-second budget. `contracts/openapi.yaml` once asserted the opposite
 *   about the date range and that was the Phase 4 CRITICAL — this test is what makes the platform
 *   version of that mistake fail loudly instead of quietly emptying the backlog.
 * * **The row is in thumb reach.** The export draws this row directly under the period header, and
 *   it is deliberately built at the bottom instead (see `PlatformFilter.tsx`). A test asserting the
 *   position is what stops a later restyle "correcting" it back to the export.
 *
 * The clock and the timezone are both pinned — `frontend/AGENTS.md` records that pinning only the
 * instant encodes the author's location, which has turned CI red four times.
 */

const SESSION_COOKIE = "ch_session";

/** Thursday 12 March 2026, 10:00 local. */
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

/**
 * Three dated items, one per platform, plus one dated and one undated with no platform at all.
 *
 * The unplatformed pair is what makes US4 scenario 4 assertable on both surfaces at once: the dated
 * one must leave the grid under any filter, and the undated one must leave the drawer.
 */
const ITEMS = [
  item(5, { title: "TikTok item", platform: "tiktok", scheduled_date: "2026-03-10" }),
  item(4, { title: "Instagram item", platform: "instagram", scheduled_date: "2026-03-11" }),
  item(3, { title: "YouTube item", platform: "youtube", scheduled_date: "2026-03-12" }),
  item(2, { title: "Undecided dated", scheduled_date: "2026-03-13" }),
  item(1, { title: "Undecided idea" }),
];

async function openCalendar(
  page: Page,
  baseURL: string | undefined,
  items: unknown[] = ITEMS,
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

const gridChips = (page: Page) => page.getByTestId("month-grid").getByTestId("item-chip");
const backlogCount = (page: Page) => page.getByTestId("backlog-count").first();
const counts = (page: Page) => page.getByTestId("calendar-counts");

test("filtering to one platform narrows the grid and the backlog together", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);

  // US4 scenario 1 names both surfaces, and they read from one loaded state precisely so they cannot
  // disagree about what a filter means.
  await expect(gridChips(page)).toHaveCount(4);
  await expect(backlogCount(page)).toHaveText("1");

  await page.getByTestId("platform-filter-tiktok").click();

  await expect(gridChips(page)).toHaveCount(1);
  await expect(gridChips(page)).toHaveText(/TikTok item/);
  // The undated unplatformed idea is gone from the drawer for the same reason it would be gone from
  // the grid: no platform matches a platform filter.
  await expect(backlogCount(page)).toHaveText("0");
});

test("each platform in turn shows only its own items", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  // US4's Independent Test, walked exactly as written. Asserting the *title* rather than the count
  // is what distinguishes "one item is showing" from "the right item is showing" — a filter wired to
  // the wrong platform passes a count check three times out of three.
  for (const [platform, title] of [
    ["tiktok", "TikTok item"],
    ["instagram", "Instagram item"],
    ["youtube", "YouTube item"],
  ] as const) {
    await page.getByTestId(`platform-filter-${platform}`).click();
    await expect(gridChips(page)).toHaveCount(1);
    await expect(gridChips(page)).toHaveText(new RegExp(title));
  }
});

test("clearing the filter brings every item back", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  await page.getByTestId("platform-filter-youtube").click();
  await expect(gridChips(page)).toHaveCount(1);

  // US4 scenario 2, and the only way back to an unplatformed idea (scenario 4). If ALL did not
  // restore them, a title-only capture made under an active filter would be unreachable.
  await page.getByTestId("platform-filter-all").click();

  await expect(gridChips(page)).toHaveCount(4);
  await expect(backlogCount(page)).toHaveText("1");
});

test("an unplatformed item is hidden by every filter and reachable by clearing", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);

  // US4 scenario 4 on the grid, for all three platforms rather than a representative one.
  for (const platform of ["tiktok", "instagram", "youtube"] as const) {
    await page.getByTestId(`platform-filter-${platform}`).click();
    await expect(gridChips(page)).not.toHaveText(/Undecided dated/);
  }

  await page.getByTestId("platform-filter-all").click();
  await expect(gridChips(page)).toHaveText([
    /TikTok item/,
    /Instagram item/,
    /YouTube item/,
    /Undecided dated/,
  ]);
});

test("the filter narrows the week list too", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);
  await page.getByTestId("view-week").click();
  await expect(page.getByTestId("week-list")).toBeVisible();

  // The week of 9–15 March holds all four dated items. FR-016 says "the calendar", not "the month
  // grid" — a filter that worked in one view and not the other would be the same class of defect as
  // an `.order_by()` applied inside one branch of the backend's list query.
  const weekChips = page.getByTestId("week-list").getByTestId("item-chip");
  await expect(weekChips).toHaveCount(4);

  await page.getByTestId("platform-filter-instagram").click();
  await expect(weekChips).toHaveCount(1);
  await expect(weekChips).toHaveText(/Instagram item/);
});

test("filtering issues no request at all", async ({ page, baseURL }) => {
  const { calls } = await openCalendar(page, baseURL);
  expect(calls).toHaveLength(1);
  expect(calls[0]).not.toContain("platform=");

  await page.getByTestId("platform-filter-tiktok").click();
  await expect(gridChips(page)).toHaveCount(1);
  await page.getByTestId("platform-filter-youtube").click();
  await page.getByTestId("platform-filter-all").click();
  await expect(gridChips(page)).toHaveCount(4);

  // R-007, and the guard against the Phase 4 CRITICAL happening one column over. The endpoint's
  // `platform` parameter exists (T060) and this surface must not send it: every parameter there
  // bounds what the *server* returns, and the drawer narrows the same state the grid does.
  expect(calls).toHaveLength(1);
  expect(calls.join(" ")).not.toContain("platform=");
});

test("the filtered view lands well inside SC-005's one-second budget", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  // SC-005 gives the filter under a second. It is met by construction — the narrowing is a `filter`
  // over a list already in memory — so this asserts the *consequence* of that architecture rather
  // than a rendering speed. It would fail if someone made the filter fetch, which is the only way
  // this budget can realistically be blown (Render's free tier spins down).
  const started = Date.now();
  await page.getByTestId("platform-filter-tiktok").click();
  await expect(gridChips(page)).toHaveCount(1);
  expect(Date.now() - started).toBeLessThan(1000);
});

test("the header counts describe what is on screen", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL, [
    item(3, { title: "Overdue TikTok", platform: "tiktok", scheduled_date: "2026-03-01" }),
    item(2, { title: "Overdue YouTube", platform: "youtube", scheduled_date: "2026-03-02" }),
    item(1, { title: "Upcoming TikTok", platform: "tiktok", scheduled_date: "2026-03-20" }),
  ]);

  await expect(counts(page)).toContainText("3 items");
  await expect(page.getByTestId("calendar-overdue-count")).toHaveText("2 overdue");

  // Both counts narrow with the filter, because the header describes what is drawn beneath it.
  // Deliberately *unlike* period navigation, where `countOverdue` spans every loaded item — moving
  // to another month does not change which items exist to the creator, and a filter does.
  await page.getByTestId("platform-filter-tiktok").click();

  await expect(counts(page)).toContainText("2 items");
  await expect(page.getByTestId("calendar-overdue-count")).toHaveText("1 overdue");
});

test("the filter survives navigating to another period and back", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);
  await page.getByTestId("platform-filter-tiktok").click();
  await expect(gridChips(page)).toHaveCount(1);

  // A filter the creator set before a batch of TikTok filming is not something a month arrow should
  // silently undo — and the visible state of the control has to keep matching what is drawn.
  await page.getByTestId("period-next").click();
  await expect(gridChips(page)).toHaveCount(0);
  await page.getByTestId("period-previous").click();

  await expect(gridChips(page)).toHaveCount(1);
  await expect(page.getByTestId("platform-filter-tiktok")).toHaveAttribute("aria-checked", "true");
});

test("it is a radio group with exactly one option selected", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  // `ALL` is a real choice rather than the state of having deselected everything, which is the whole
  // reason this is a radio group where the item sheet's platform control is a toggle group: there,
  // `null` means "no platform"; here it means "all platforms".
  const group = page.getByRole("radiogroup", { name: "Filter by platform" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio")).toHaveCount(4);
  await expect(page.getByTestId("platform-filter-all")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("platform-filter-youtube").click();

  await expect(page.getByTestId("platform-filter-all")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("platform-filter-youtube")).toHaveAttribute("aria-checked", "true");
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
});

test("the filter is reachable by keyboard", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  // SC-011 asks for a journey completable without a pointer drag, and `research.md` R-003's
  // amendment leans on the keyboard being a real path through this product rather than a claim.
  await page.getByTestId("platform-filter-instagram").focus();
  await page.keyboard.press("Enter");

  await expect(gridChips(page)).toHaveCount(1);
  await expect(gridChips(page)).toHaveText(/Instagram item/);
});

test("the row is in thumb reach and meets the 44px tap floor", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  const viewport = page.viewportSize()!;
  for (const platform of ["all", "tiktok", "instagram", "youtube"] as const) {
    const box = (await page.getByTestId(`platform-filter-${platform}`).boundingBox())!;

    // FR-022 and `.claude/rules/design.md`: bottom half of the screen, not a top-right toolbar. The
    // export draws this row under the period header — around y=100 at this height — so this
    // assertion is the thing standing between the built surface and a restyle that "fixes" it back.
    expect(box.y).toBeGreaterThan(viewport.height / 2);
    // 44px, the tap floor. The export draws these at 26px, which is the third place this project
    // knowingly departs from the design for a reachability constraint.
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});

test.describe("the filtered empty state (T062)", () => {
  test("names the filter instead of showing a blank calendar", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [
      item(2, { title: "TikTok item", platform: "tiktok", scheduled_date: "2026-03-10" }),
      item(1, { title: "Undecided idea" }),
    ]);

    await page.getByTestId("platform-filter-youtube").click();

    // The spec's edge case: "the view shows an explicit empty state naming the active filter, not a
    // blank screen". Asserting the platform *name* appears is the whole point — a generic "nothing
    // here" would satisfy a count assertion and fail the requirement.
    const empty = page.getByTestId("filtered-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("No YouTube items");
    await expect(empty).toContainText("The YouTube filter is on");

    // It replaces the grid rather than sitting above it — an empty six-week grid under an
    // explanation is still a blank screen.
    await expect(page.getByTestId("month-grid")).toHaveCount(0);
  });

  test("its button clears the filter and brings the calendar back", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);

    await page.getByTestId("platform-filter-youtube").click();
    await expect(gridChips(page)).toHaveCount(1);

    // With items on every platform the empty state does not appear — the guard against it showing up
    // whenever a filter is merely *active*.
    await expect(page.getByTestId("filtered-empty")).toHaveCount(0);

    await openCalendar(page, baseURL, [item(1, { title: "Only TikTok", platform: "tiktok" })]);
    await page.getByTestId("platform-filter-youtube").click();
    await page.getByTestId("filtered-empty-clear").click();

    await expect(page.getByTestId("filtered-empty")).toHaveCount(0);
    await expect(page.getByTestId("month-grid")).toBeVisible();
    await expect(page.getByTestId("platform-filter-all")).toHaveAttribute("aria-checked", "true");
  });

  test("an empty period is not treated as an emptied filter", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [
      item(1, { title: "TikTok in April", platform: "tiktok", scheduled_date: "2026-04-20" }),
    ]);

    await page.getByTestId("platform-filter-tiktok").click();
    // The item matches the filter, so nothing is filtered *out* — March simply has nothing planned,
    // which is a normal thing for a calendar to show and which the period arrows already answer.
    // Drawing the filter's empty state here would blame the filter for the creator's own navigation.
    await expect(page.getByTestId("filtered-empty")).toHaveCount(0);
    await expect(page.getByTestId("month-grid")).toBeVisible();

    await page.getByTestId("period-next").click();
    await expect(gridChips(page)).toHaveCount(1);
  });

  test("an account with no items at all still gets the first-run copy", async ({
    page,
    baseURL,
  }) => {
    await openCalendar(page, baseURL, []);

    await page.getByTestId("platform-filter-tiktok").click();

    // A creator with nothing captured should meet the drawer's "tap + Capture", not a message about
    // a filter that is not the reason their calendar is empty.
    await expect(page.getByTestId("filtered-empty")).toHaveCount(0);
    // T051 reworded the default peek copy; "Nothing captured yet" is still the substring unique to it.
    await expect(page.getByTestId("backlog-empty-peek")).toContainText("Nothing captured yet");
  });

  test("the backlog names the filter too, in both drawer states", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);

    await page.getByTestId("platform-filter-youtube").click();

    // T062 asks for this on the drawer as well as the grid, and the peek strip is the backlog view a
    // creator sees most. Without it the strip reads the default "nothing captured" copy (reworded at
    // T051) to someone whose backlog is full — telling them to capture something they already have.
    await expect(page.getByTestId("backlog-empty-peek")).toContainText("No undated YouTube ideas");
    await expect(page.getByTestId("backlog-empty-peek")).not.toContainText("Nothing captured yet");

    await page.getByTestId("backlog-toggle").click();
    await expect(page.getByTestId("backlog-empty")).toContainText("No undated YouTube ideas");
  });

  test("and the unfiltered backlog keeps its first-run copy", async ({ page, baseURL }) => {
    // The control. Without it, "names the filter" would pass just as well against a drawer that had
    // lost the first-run copy entirely.
    await openCalendar(page, baseURL, [
      item(1, { title: "Dated", platform: "tiktok", scheduled_date: "2026-03-10" }),
    ]);

    // T051 reworded the default peek copy; "Nothing captured yet" is still the substring unique to it.
    await expect(page.getByTestId("backlog-empty-peek")).toContainText("Nothing captured yet");
  });
});

test("the filter row does not push the body sideways at 375px", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  // Four tap targets plus a label inside 375px, on the second-tightest row in the product. The
  // action band below it is the tightest, and `viewport.spec.ts` guards that one.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
