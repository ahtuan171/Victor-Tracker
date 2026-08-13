import { expect, test, type Page } from "@playwright/test";

/**
 * The nav drawer (002 T029–T031, FR-015, FR-016, FR-018, FR-019, SC-007), at the 375x667 floor.
 *
 * The proxy is stubbed, as in every other file here — CI runs the production bundle with no FastAPI
 * behind it.
 */

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

async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

async function openCalendar(
  page: Page,
  baseURL: string | undefined,
  items: unknown[] = [],
): Promise<void> {
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) });
  });
  await signedIn(page, baseURL);
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();
}

test("the drawer is reachable from the calendar in a single tap", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
});

test("every screen the product has is listed, and the current one is marked (FR-015, SC-007)", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);
  await page.getByTestId("nav-drawer-trigger").click();

  const screens = page.getByTestId("nav-drawer-screens").getByRole("listitem");
  await expect(screens).toHaveCount(1);

  // SC-007 asks every screen be reachable in at most two interactions from any other. This product
  // has exactly one screen today, so opening the drawer (one interaction) already puts the creator
  // on the only entry it lists — reachable in zero further taps, which is the whole of SC-007 until
  // a second screen exists to measure a path between.
  const current = page.getByTestId("nav-drawer-screen-calendar");
  await expect(current).toHaveText("Content Calendar");
  await expect(current).toHaveAttribute("aria-current", "page");
});

test("dismissing the drawer over an open capture sheet keeps the typed text (FR-018)", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);

  await page.getByTestId("capture-action").click();
  const title = page.getByPlaceholder("Rooftop b-roll cutdown");
  await title.waitFor();
  await title.fill("Rooftop cutdown, take two");

  // The drawer opens **over** the capture sheet rather than being unreachable behind it — see
  // `NavDrawer.tsx`'s "It has to out-rank z-50" note.
  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();

  await page.getByTestId("nav-drawer-close").click();
  await expect(page.getByTestId("nav-drawer-panel")).not.toBeVisible();

  // The capture sheet was never touched by any of this — it is still open, with the typing intact.
  await expect(title).toBeVisible();
  await expect(title).toHaveValue("Rooftop cutdown, take two");
  await expect(page.getByTestId("capture-save")).toBeEnabled();
});

test("dismissing the drawer with Escape also keeps the capture sheet open (T044 hand-walk, FR-018)", async ({
  page,
  baseURL,
}) => {
  // Found by T044's hand-walk, not by this suite: the test above only ever dismissed via the CLOSE
  // button. Escape is a second, equally natural dismiss path, and it used to close both overlays at
  // once — `CaptureSheet`'s own `@base-ui/react` Dialog arms its own Escape listener the instant it
  // opens, and this drawer's listener (registered later, same bubble phase) ran second, after the
  // sheet had already closed itself. See `NavDrawer.tsx`'s capture-phase comment for the fix.
  await openCalendar(page, baseURL);

  await page.getByTestId("capture-action").click();
  const title = page.getByPlaceholder("Rooftop b-roll cutdown");
  await title.waitFor();
  await title.fill("Rooftop cutdown, take three");

  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nav-drawer-panel")).not.toBeVisible();

  await expect(title).toBeVisible();
  await expect(title).toHaveValue("Rooftop cutdown, take three");
  await expect(page.getByTestId("capture-save")).toBeEnabled();
});

test("opening the drawer does not cancel an open backlog drawer, and dismissing it leaves the backlog open (FR-019)", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [item(1), item(2)]);

  await page.getByTestId("backlog-toggle").click();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();

  // Independent state, not a shared one — opening the nav drawer must not close the backlog drawer
  // out from under the creator.
  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();

  await page.getByTestId("nav-drawer-close").click();
  await expect(page.getByTestId("nav-drawer-panel")).not.toBeVisible();
  // Dismissing the nav drawer is not what closed it either — the backlog is exactly where it was.
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();
});

test("the drawer does not trap keyboard focus when the backlog drawer is open behind it (FR-019)", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [item(1)]);

  await page.getByTestId("backlog-toggle").click();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();

  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("nav-drawer-panel").waitFor();

  // Tab from the trigger. A focus trap would keep every one of these landing inside the nav panel;
  // this drawer is deliberately not one (unlike `CaptureSheet`/`ItemSheet`/`DeleteConfirm`, which are
  // real modals with a trap of their own), so the walk must escape it within a handful of presses.
  let escaped = false;
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Tab");
    const insidePanel = await page.evaluate(
      () => document.activeElement?.closest('[data-testid="nav-drawer-panel"]') !== null,
    );
    if (!insidePanel) {
      escaped = true;
      break;
    }
  }
  expect(escaped).toBe(true);
});

test("the scrim dismisses the drawer without touching the backlog drawer underneath (FR-019)", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL, [item(1)]);

  await page.getByTestId("backlog-toggle").click();
  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("nav-drawer-panel").waitFor();

  // The scrim covers the whole viewport, but the panel sits on top of its right-hand two-thirds
  // (`w-[260px]` of a 375px screen) — clicking the scrim locator's default centre would actually
  // land on the panel above it. Click near the scrim's own top-left corner instead, which the panel
  // does not cover.
  await page.getByTestId("nav-drawer-scrim").click({ position: { x: 10, y: 10 } });

  await expect(page.getByTestId("nav-drawer-panel")).not.toBeVisible();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();
});

test("Escape dismisses the drawer", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("nav-drawer-panel").waitFor();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nav-drawer-panel")).not.toBeVisible();
});
