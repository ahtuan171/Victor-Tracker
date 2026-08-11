import { expect, test, type Page } from "@playwright/test";

/**
 * Reduced motion (T042, FR-025, SC-008), at the 375x667 floor.
 *
 * `app/globals.css`'s `@media (prefers-reduced-motion: reduce)` block collapses every
 * `animation-duration`, `animation-iteration-count`, `transition-duration` and `scroll-behavior` on
 * `*, *::before, *::after` to near-zero, `!important` — one rule rather than a per-animation branch,
 * per that block's own comment: "switched off wholesale rather than per-animation." This file exists
 * to prove that rule actually reaches the product's three animated surfaces (the ticker's decorative
 * scan, the comic-panel hover lift, and the shadcn Sheet/AlertDialog entrance transitions) rather
 * than only the one it was written next to, and — the FR-025 half a duration assertion alone cannot
 * see — that nothing the ticker carries is lost when its motion stops.
 *
 * The proxy is stubbed, as in every other file here.
 */

const SESSION_COOKIE = "ch_session";
/** Thursday 12 March 2026, 10:00 in Asia/Ho_Chi_Minh (UTC+7) — matches `overdue.spec.ts`. */
const NOW = Date.UTC(2026, 2, 12, 3, 0, 0);

test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

function anItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Overdue idea",
    hook: null,
    platform: null,
    scheduled_date: "2026-03-10",
    status: "idea",
    published_url: null,
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-01T09:00:00Z",
    ...overrides,
  };
}

async function openCalendar(page: Page, baseURL: string | undefined): Promise<void> {
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([anItem(), anItem({ id: 2, title: "Future idea", scheduled_date: "2026-03-15" })]),
    });
  });
  // `CalendarShell`'s mount effect reads this to reconcile theme and sound (T038); left unstubbed it
  // hits a real, unauthenticated backend and 401s, which `lib/api.ts` turns into a redirect to
  // `/login` — a race every other file's tests happen to win, but one this file's own duration
  // assertions have no reason to gamble on.
  await page.route("**/api/preferences", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ theme: "dark", sound_enabled: false }),
    });
  });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();
}

/** `getComputedStyle(el).animationDuration`, read the same way for every animated element below. */
async function animationDuration(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationDuration);
}

test("with no preference expressed, the ticker's highlight actually animates", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);
  expect(await animationDuration(page, ".ticker-scan")).toBe("5s");
});

test("prefers-reduced-motion stops the ticker's highlight, with its message unaffected (FR-025, FR-031)", async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCalendar(page, baseURL);

  expect(await animationDuration(page, ".ticker-scan")).toBe("1e-05s");

  // Nothing lost: the same two facts, in full, exactly as V9/V10 in quickstart.md ask to be
  // compared. The highlight behind this text carries no information of its own (FR-031) — it was
  // always readable from a single still frame — so this is the same string with motion or without.
  await expect(page.getByTestId("ticker-message")).toHaveText("1 ITEM OVERDUE · NEXT 15 MAR");
});

/**
 * `.comic-panel` (`app/globals.css`) is applied only to `full`/`peek`-sized chips — never `micro`,
 * the month grid's own size (`ItemChip.tsx`'s own comment: "no room for the shadow to read without
 * bleeding into the next cell"). The week view is the cheapest way to a `full` chip.
 */
async function weekChip(page: Page, date: string) {
  await page.getByTestId("view-week").click();
  await page.getByTestId("week-list").waitFor();
  return page.locator(`[data-date="${date}"]`).getByTestId("item-chip").first();
}

test("with no preference expressed, an item chip's hover lift actually animates", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);
  const chip = await weekChip(page, "2026-03-10");
  // Two properties share the declaration (`transform`, `box-shadow`), hence the pair.
  expect(await chip.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0.16s, 0.16s");
});

test("prefers-reduced-motion collapses the hover lift's transition too", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCalendar(page, baseURL);
  const chip = await weekChip(page, "2026-03-10");
  // A single `!important` value replaces the whole comma list, unlike the two-value case above.
  expect(await chip.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("1e-05s");
});

test("with no preference expressed, the capture button's press-feedback actually animates (T052)", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);
  expect(
    await page
      .getByTestId("capture-action")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0.1s");
});

test("prefers-reduced-motion collapses the press-feedback transition too", async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCalendar(page, baseURL);
  expect(
    await page
      .getByTestId("capture-action")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("1e-05s");
});

test("prefers-reduced-motion also collapses the delete confirmation's entrance transition", async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCalendar(page, baseURL);

  const chip = page.locator('[data-date="2026-03-10"]').getByTestId("item-chip");
  await chip.click();
  await page.getByTestId("item-delete").click();

  const dialog = page.getByTestId("delete-confirm");
  await expect(dialog).toBeVisible();
  // shadcn's own `duration-100` utility, applied through the `data-open:animate-in`/`data-closed:
  // animate-out` classes `components/ui/alert-dialog.tsx` sets — proof the global rule reaches a
  // third-party primitive's own transition classes, not only the two hand-written ones above.
  expect(await dialog.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("1e-05s");
});

test("without the preference, the same dialog has a real entrance duration", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);

  const chip = page.locator('[data-date="2026-03-10"]').getByTestId("item-chip");
  await chip.click();
  await page.getByTestId("item-delete").click();

  const dialog = page.getByTestId("delete-confirm");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0.1s");
});
