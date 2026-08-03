import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * **The** end-to-end flow (T057, T058) — US3, FR-015b, SC-002, SC-011, research.md R-003.
 *
 * `tech-defaults.md` budgets exactly one E2E flow for v0.1, and this is it: capture an idea with only
 * a title, give it a platform, give it a date, advance it to `posted`, and find it on the calendar.
 * Every other spec file in `tests/e2e/` covers one surface; this one is the only thing that asserts
 * the surfaces *compose*.
 *
 * ## Driven through taps, and that is a decision rather than convenience
 *
 * R-003: *"Making the tap path the primary one also means the Playwright E2E flow drives taps. Drag
 * automation is the flakiest thing in a browser suite, and `workflow.md` requires the E2E flow to gate
 * merges — a flaky gate gets disabled, and a disabled gate violates principle VI."* The drag path has
 * its own wiring tests in `drag-schedule.spec.ts`, and quickstart V4 walks it by hand.
 *
 * ## The stub is a small server, not a fixture
 *
 * Every other file here answers with a canned body, which is right for asserting one surface. This
 * flow **mutates**: the item it creates is the item it later schedules and advances, and an assertion
 * that the calendar shows a `posted` item is worth nothing if the stub would have said `posted` to
 * anything. So the route handler keeps a row and applies `PATCH` bodies to it the way the backend
 * does — `exclude_unset` semantics included, which is what makes the "only what changed was sent"
 * property observable from the other end.
 *
 * What it deliberately does **not** do is enforce INV-1. The backend's own tests cover the invariant
 * in both directions; a second implementation of it here would test the stub.
 */

const SESSION_COOKIE = "ch_session";

/** 4 August 2026, 09:00 UTC. Pinned with a timezone — see `test.use` below. */
const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);
const TARGET_DAY = "2026-08-12";

/**
 * Pinned, because `page.clock.setFixedTime` fixes the *instant* and the zone that turns it into a
 * calendar day still comes from the machine running the browser. Green locally and red on GitLab's
 * UTC runner has happened four times in this project.
 */
test.use({ timezoneId: "Asia/Bangkok" });

interface Row {
  id: number;
  title: string;
  hook: string | null;
  platform: string | null;
  scheduled_date: string | null;
  status: string;
  published_url: string | null;
  created_at: string;
  updated_at: string;
}

interface Api {
  /** Every request the page made, as `METHOD /path`. The shape of the journey, not just its end. */
  readonly calls: string[];
  rows(): Row[];
}

/** A tiny in-memory content-items API: create, list, patch, delete. */
async function stubApi(page: Page): Promise<Api> {
  const calls: string[] = [];
  const rows: Row[] = [];
  let nextId = 1;

  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${path}`);

    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
      return;
    }

    if (request.method() === "POST") {
      const body = request.postDataJSON() as Partial<Row>;
      const row: Row = {
        id: nextId++,
        title: body.title!,
        hook: body.hook ?? null,
        platform: body.platform ?? null,
        scheduled_date: body.scheduled_date ?? null,
        status: body.status ?? "idea",
        published_url: body.published_url ?? null,
        created_at: "2026-08-04T09:00:00Z",
        updated_at: "2026-08-04T09:00:00Z",
      };
      // Newest first, which is the ordering the endpoint documents and every surface relies on.
      rows.unshift(row);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(row),
      });
      return;
    }

    const id = Number(path.split("/").pop());
    const row = rows.find((each) => each.id === id);
    if (row === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Content item not found." }),
      });
      return;
    }

    if (request.method() === "DELETE") {
      rows.splice(rows.indexOf(row), 1);
      await route.fulfill({ status: 204 });
      return;
    }

    // `PATCH`, with the backend's `exclude_unset` semantics: keys present are written, keys absent
    // are untouched, and an explicit null clears. Assigning the parsed body does exactly that,
    // because `JSON.parse` produces only the keys that were sent.
    Object.assign(row, request.postDataJSON() as Partial<Row>);
    row.updated_at = "2026-08-04T09:00:05Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(row),
    });
  };

  await page.route("**/api/content-items", handle);
  await page.route("**/api/content-items/*", handle);

  return { calls, rows: () => rows };
}

test("a creator takes an idea to posted without leaving the calendar", async ({
  page,
  baseURL,
}) => {
  const api = await stubApi(page);

  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  /** T058: the address at the start. Nothing in the journey may change it (SC-002). */
  const startUrl = page.url();

  // --- 1. Capture, with only a title (FR-005, SC-001) -----------------------------------------
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Rooftop b-roll cutdown");
  await page.getByTestId("capture-save").click();

  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  // It lands in the backlog, because a title-only idea has no date. US1's whole promise.
  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await expect(chip).toBeVisible();
  await expect(chip.getByTestId("status-cue")).toHaveAttribute("aria-label", "Idea");

  // --- 2. Open it, and give it a platform, a date and a status (FR-006a, SC-012) ---------------
  await chip.click();
  await expect(page.getByTestId("item-save")).toBeVisible();

  await page.getByTestId("platform-option-tiktok").click();
  await page.getByTestId("item-date-input").fill(TARGET_DAY);
  await page.getByTestId("status-option-posted").click();

  // One request carrying all three. Written as three per-tap saves, the first would be a guaranteed
  // 409 — `check_invariant_1` validates the item as it would be *after* the change precisely so this
  // single request exists, and SC-012 asks that the creator never meet a refusal they cannot resolve
  // where they are. The cheapest way to honour that is to not produce it.
  await page.getByTestId("item-save").click();
  await expect(page.getByTestId("item-save")).toBeHidden();

  // --- 3. Verify it on the calendar (US3, FR-012, FR-017) --------------------------------------
  const scheduled = page.locator(`[data-date="${TARGET_DAY}"]`).getByTestId("item-chip");
  await expect(scheduled).toHaveCount(1);
  await expect(scheduled.getByTestId("status-cue")).toHaveAttribute("aria-label", "Posted");
  await expect(scheduled.getByTestId("platform-cue")).toHaveAttribute("aria-label", "TikTok");

  // And it has left the backlog. `groupByScheduledDate` and `selectBacklog` are a partition, which is
  // US2 scenario 4 — no item appears in both.
  await expect(page.getByTestId("backlog-peek-list").getByTestId("item-chip")).toHaveCount(0);

  // The server agrees, which is what stops this asserting only that the browser lied to itself.
  expect(api.rows()).toEqual([
    expect.objectContaining({
      title: "Rooftop b-roll cutdown",
      platform: "tiktok",
      scheduled_date: TARGET_DAY,
      status: "posted",
    }),
  ]);

  // --- T058, assertion 1: the URL never changed (SC-002) ---------------------------------------
  // "Zero navigations to a separate detail page" is a statement about the address bar, so it is
  // asserted as one. A sheet is not a page; a route would be.
  expect(page.url()).toBe(startUrl);

  // --- T058, assertion 2: no drag gesture was used (FR-015b, SC-011) ---------------------------
  // The whole journey above is clicks, fills and keystrokes — there is no `page.mouse.down()` in it,
  // and this comment plus the code is the assertion. What can be checked mechanically is that the
  // journey cost the requests it should: one read on mount, one create, one update. Nothing here
  // needed a pointer that a keyboard could not produce.
  expect(api.calls).toEqual([
    "GET /api/content-items",
    "POST /api/content-items",
    "PATCH /api/content-items/1",
  ]);
});

test("the same journey by keyboard alone (FR-015b, SC-011)", async ({ page, baseURL }) => {
  const api = await stubApi(page);

  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  const startUrl = page.url();

  // This is T058's "no drag gesture" assertion made mechanical rather than left to a comment: a
  // keyboard cannot produce a drag, so a journey completed this way is one no drag was needed for.
  // It is also why `ItemChip` does not register dnd-kit's keyboard activator — `Enter` on a chip has
  // to open the sheet, or this test has no way in (see the amendment to research.md R-003).
  await page.getByTestId("capture-action").press("Enter");
  await page.getByLabel("Title").fill("Ring light, honestly");
  await page.getByTestId("capture-save").press("Enter");

  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().press("Enter");
  await expect(page.getByTestId("item-save")).toBeVisible();

  await page.getByTestId("platform-option-youtube").press("Enter");
  await page.getByTestId("item-date-input").fill(TARGET_DAY);
  await page.getByTestId("status-option-posted").press("Enter");
  await page.getByTestId("item-save").press("Enter");

  await expect(page.getByTestId("item-save")).toBeHidden();

  const scheduled = page.locator(`[data-date="${TARGET_DAY}"]`).getByTestId("item-chip");
  await expect(scheduled.getByTestId("status-cue")).toHaveAttribute("aria-label", "Posted");

  expect(api.rows()[0]).toMatchObject({
    platform: "youtube",
    scheduled_date: TARGET_DAY,
    status: "posted",
  });
  expect(page.url()).toBe(startUrl);
});

test("the journey survives a period change and a view change (SC-002)", async ({
  page,
  baseURL,
}) => {
  const api = await stubApi(page);

  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  const startUrl = page.url();

  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Ring light, honestly");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  // Navigate away and back, and switch views. None of it is a navigation in the URL sense, and none
  // of it re-reads the list — the calendar loads once and every surface narrows it (R-007).
  await page.getByTestId("period-next").click();
  await page.getByTestId("view-week").click();
  /*
   * `dispatchEvent` rather than `click`, and it is the recorded environment trap rather than a
   * flaky selector: **Next's dev overlay sits exactly over the `MONTH` toggle at 375px** and
   * intercepts the pointer event. `playwright.config.ts` runs `pnpm dev` locally and `pnpm start`
   * under `CI`, so the obstruction is **local only** — this is here so the suite passes on a
   * developer's machine, not because a pipeline needs it. (Corrected 2026-08-03; this comment
   * previously claimed CI ran `next dev` too.) A hand-walk still needs `pnpm build && pnpm start`
   * for the same overlay (`frontend/AGENTS.md`).
   *
   * Dispatching straight at the element is honest here: the obstruction is a development artifact
   * that no creator will ever have, and the thing under test is what the toggle *does*.
   */
  await page.getByTestId("view-month").dispatchEvent("click");
  await expect(page.getByTestId("month-grid")).toBeVisible();
  await page.getByTestId("period-previous").click();

  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  await page.getByTestId("platform-option-instagram").click();
  await page.getByTestId("item-date-input").fill(TARGET_DAY);
  await page.getByTestId("status-option-draft").click();
  await page.getByTestId("item-save").click();
  await expect(page.getByTestId("item-save")).toBeHidden();

  await expect(
    page.locator(`[data-date="${TARGET_DAY}"]`).getByTestId("item-chip").getByTestId("status-cue"),
  ).toHaveAttribute("aria-label", "Draft");

  expect(page.url()).toBe(startUrl);
  // Four navigations, still one read. `period-nav.spec.ts` pins this at three; here it survives a
  // create and an update as well.
  expect(api.calls.filter((call) => call === "GET /api/content-items")).toHaveLength(1);
});
