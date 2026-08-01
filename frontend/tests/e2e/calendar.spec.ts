import { expect, test, type Page } from "@playwright/test";

/**
 * The calendar shell (T033, FR-022, research.md R-006 addendum and R-007), at the 375x667 floor.
 *
 * **The proxy is stubbed, for the same reason `login.spec.ts` stubs it**: `.gitlab-ci.yml`'s
 * `test:e2e` job runs the production bundle with no FastAPI and no Postgres behind it, so a test
 * that fetched for real would be green only on a developer's machine. What is under test here is the
 * *shell*: that it guards, loads once, holds what it loaded, and puts the primary action in thumb
 * reach. The endpoint itself is covered by `backend/tests/test_content_items.py`, and the seam
 * between them is what quickstart V2 walks by hand.
 *
 * The grid is **not** tested here because it does not exist — T042 builds it and brings its own
 * tests. This file covers the frame that will hold it.
 */

/** Matches `sessionCookieName()`'s default and `.env.example`. */
const SESSION_COOKIE = "ch_session";

function item(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Item ${id}`,
    hook: null,
    platform: null,
    scheduled_date: null,
    status: "idea",
    published_url: null,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...overrides,
  };
}

/**
 * Sign the browser in, the way the proxy would.
 *
 * A presence check is all the guard does — the signing secret never leaves Render (R-001) — so a
 * non-JWT value is not a shortcut here, it is what the guard actually inspects.
 */
async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

/** Stub `GET /api/content-items` and count how many times the page asks. */
async function stubItems(
  page: Page,
  items: unknown[],
  status = 200,
): Promise<{ readonly calls: string[] }> {
  const calls: string[] = [];

  await page.route("**/api/content-items*", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(status === 200 ? items : { detail: "The API could not be reached." }),
    });
  });

  return { calls };
}

test("the page body does not scroll horizontally at 375px", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubItems(page, [item(1), item(2)]);

  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-counts")).toHaveText("2 items");

  // Constitution principle I: wide content scrolls inside its own container, the body never does.
  // Asserted now, while the surface is nearly empty, so T042's grid inherits a passing test rather
  // than a new one written to fit whatever it produces.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the capture action sits in the bottom half, within thumb reach", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubItems(page, []);

  await page.goto("/calendar");

  const box = await page.getByTestId("capture-action").boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  // design.md: "Primary actions sit within thumb reach — bottom half of the screen, not a top-right
  // toolbar." Structural, so it gets an assertion rather than a code review.
  expect(box!.y).toBeGreaterThan(viewport!.height / 2);
  // Every shadcn size variant is desktop-scaled, so 44px is an override a refactor can silently drop.
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("the visible period comes from the browser clock, not the server", async ({
  page,
  baseURL,
}) => {
  await signedIn(page, baseURL);
  await stubItems(page, []);

  // Fixed so the assertion is about *which* clock was read rather than about today's date. The
  // runner is UTC and this instant is the 4th there and the 5th in UTC+7 — if the period were read
  // during server rendering it would say March, and R-006's addendum exists because that mismatch
  // is otherwise a silent hydration flip.
  // `Date.UTC` rather than `new Date(...)`: eslint bans the constructor outside `lib/dates.ts`, and
  // the ban is right — this is a millisecond timestamp, which is what `setFixedTime` wants anyway.
  await page.clock.setFixedTime(Date.UTC(2026, 3, 30, 18, 0, 0));

  await page.goto("/calendar");

  await expect(page.getByTestId("calendar-period")).toHaveText("May 2026");
});

test("the item list is fetched once, not once per render", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const stub = await stubItems(page, [item(1)]);

  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  // R-007: the period is loaded once and held in state. An effect depending on an unstable params
  // object refetches forever, which is invisible on screen and obvious here.
  expect(stub.calls).toHaveLength(1);
});

test("a failed load shows a readable message and keeps the shell", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubItems(page, [], 502);

  await page.goto("/calendar");

  await expect(page.locator("#calendar-error")).toContainText(/could not be reached/i);
  // The action band survives a failed read. A creator who opens the app on a bad connection must
  // still be able to capture — that is the whole of US1, and it does not depend on the list.
  await expect(page.getByTestId("capture-action")).toBeVisible();
});

test("nothing renders the calendar to a signed-out visitor", async ({ request }) => {
  const response = await request.get("/calendar", { maxRedirects: 0 });

  // SC-006 at the page level rather than the layout level. `session-guard.spec.ts` covers the same
  // address through the layout; both checks run on a full load, so this is belt and braces on the
  // property that actually matters — no content markup is generated at all.
  expect([302, 303, 307, 308]).toContain(response.status());
  expect(response.headers()["location"]).toContain("/login");
});
