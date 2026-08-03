import { expect, test, type Page } from "@playwright/test";

/**
 * The 375px audit (T069, FR-021, SC-003) — every route and every overlay surface in the product.
 *
 * ## Why this file exists when thirteen others already check for overflow
 *
 * They all check the same thing, and **it is weaker than it reads**. The assertion everywhere in
 * `tests/e2e/` is `document.documentElement.scrollWidth > document.documentElement.clientWidth`, and
 * T077 measured `+ CAPTURE` sitting at **x=417 on a 375px viewport — 42px past the right edge — with
 * that check still `false`.** T068 reproduced it on a second control: the export's
 * `+ CAPTURE FIRST IDEA` label ends at **x=411**, again with no overflow reported. The reason is the
 * same in both cases — the action band is a flex row inside an `h-dvh` column, so it **clips** rather
 * than extending the document's scroll width, and the primary action simply leaves the screen with
 * nothing to announce it.
 *
 * FR-021 has two clauses and the scrollWidth check only covers the second: *"Every screen MUST be
 * **fully usable** at 375px width, **and** the page body MUST NOT scroll horizontally."* A control
 * 42px off the side satisfies the second while destroying the first, which is also SC-003's word —
 * "fully usable". So this audit asserts both, and the load-bearing half is the first.
 *
 * ## What is checked, and why it is a category rather than a list of testids
 *
 * Every **visible interactive control** must lie entirely within the viewport's width. The predicate
 * is the one `focus-states.spec.ts` settled on for the same reason it was settled on there: filtering
 * on *what an element is* — a natively interactive tag, or an interactive ARIA role — means a control
 * added next month is audited on the day it lands, where a list of testids covers exactly what its
 * author remembered.
 *
 * Non-controls are deliberately out of scope. Decorative and textual overflow that is *clipped on
 * purpose* is a design decision this product makes in several places (the day cell's titles, the peek
 * strip); a control that cannot be tapped is a broken screen. One clipped control is exempted below,
 * with its reason and its compensation.
 */

const SESSION_COOKIE = "ch_session";

/** Mid-March 2026, far from any boundary, in a zone where the fixed instant is the same day. */
const MARCH_2026 = Date.UTC(2026, 2, 12, 3, 0, 0);

test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

/**
 * A title long enough to push any layout that can be pushed.
 *
 * The audit is only as good as the content it runs against — an empty calendar overflows nothing —
 * so every surface here is loaded with the worst case the product accepts rather than a tidy one.
 */
const LONG_TITLE =
  "A rooftop b-roll cutdown with an absurdly long working title that no layout should widen for";

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

/** A busy month: overdue rows, every platform, every status, and a day holding more than it can show. */
const BUSY = [
  item(1, { title: LONG_TITLE, scheduled_date: "2026-03-11", platform: "tiktok", status: "draft" }),
  item(2, {
    title: LONG_TITLE,
    scheduled_date: "2026-03-11",
    platform: "youtube",
    status: "posted",
    published_url: "https://www.youtube.com/watch?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }),
  item(3, { scheduled_date: "2026-03-11", platform: "instagram" }),
  item(4, { scheduled_date: "2026-03-11" }),
  item(5, { title: LONG_TITLE, scheduled_date: "2026-02-02" }),
  item(6, { title: LONG_TITLE }),
  item(7, { platform: "instagram", status: "draft" }),
];

async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

async function openCalendar(
  page: Page,
  baseURL: string | undefined,
  items: unknown[] = BUSY,
): Promise<void> {
  await signedIn(page, baseURL);
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(items),
    });
  });

  await page.clock.setFixedTime(MARCH_2026);
  await page.goto("/calendar");
  await expect(page.getByTestId("capture-action")).toBeVisible();
}

/**
 * Every visible control whose box escapes the viewport horizontally, as `label@x..right`.
 *
 * Returned rather than asserted inside the page so a failure names the control and its coordinates —
 * "the band clips" is only actionable if you can see which control and by how much.
 */
async function controlsOutsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const INTERACTIVE_TAGS = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"];
    const INTERACTIVE_ROLES = [
      "button",
      "link",
      "radio",
      "checkbox",
      "switch",
      "tab",
      "menuitem",
      "option",
      "combobox",
      "slider",
      "textbox",
    ];

    const width = document.documentElement.clientWidth;
    const escaped: string[] = [];

    for (const el of Array.from(document.querySelectorAll("*"))) {
      const role = el.getAttribute("role");
      const isControl =
        INTERACTIVE_TAGS.includes(el.tagName) ||
        (role !== null && INTERACTIVE_ROLES.includes(role));
      if (!isControl) continue;

      // Hidden from assistive technology is not a control — the same criterion `focus-states.spec.ts`
      // uses to skip a focus trap's 1px sentinels, which would otherwise be audited as buttons.
      if (el.closest('[aria-hidden="true"]') !== null) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;

      /*
       * The one exemption, and it is a design decision with a stated compensation rather than a
       * tolerance. The backlog peek strip is a single clipped line by design — `overflow-hidden`, not
       * a scroller — because it is a *glance* and the expanded drawer is how the backlog is browsed
       * (R-003a, and the note in `BacklogDrawer.tsx`). So its last chip can be half off the edge on a
       * full backlog, and every one of them is reachable at full size one tap away in the expanded
       * drawer, which this file audits separately.
       */
      if (el.closest('[data-testid="backlog-peek-list"]') !== null) continue;

      // Half a pixel of subpixel rounding is not a layout defect. Anything a creator could notice is.
      if (rect.left < -0.5 || rect.right > width + 0.5) {
        const label =
          el.getAttribute("data-testid") ??
          `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 20)}`;
        escaped.push(`${label}@${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }

    return escaped;
  });
}

/** The check every other file in this suite uses. Kept, because it catches the other half. */
async function bodyScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Both halves of FR-021, on whatever is currently on screen. */
async function auditSurface(page: Page, surface: string): Promise<void> {
  expect(await controlsOutsideViewport(page), `${surface}: controls outside the viewport`).toEqual(
    [],
  );
  expect(await bodyScrollsSideways(page), `${surface}: body scrolls horizontally`).toBe(false);
}

test.describe("the routes", () => {
  test("/login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await auditSurface(page, "/login");
  });

  test("/login carrying an error message", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Incorrect email or password" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("creator@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator("#login-error")).toBeVisible();
    await auditSurface(page, "/login with an error");
  });

  test("/calendar, month view, busy", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await expect(page.getByTestId("month-grid")).toBeVisible();

    await auditSurface(page, "/calendar month");
  });

  test("/calendar, month view, a day expanded past its cap", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);

    // The `+N more` control is the one place a day cell is allowed to grow, and it grows *inside* a
    // ~53px column — the narrowest place in the product a control can be put.
    await page.getByTestId("day-overflow").first().click();
    await auditSurface(page, "/calendar month, day expanded");
  });

  test("/calendar, week view, busy", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("view-week").click();
    await expect(page.getByTestId("week-list")).toBeVisible();

    await auditSurface(page, "/calendar week");
  });

  test("/calendar, a cross-boundary week title", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("view-week").click();

    // `28 Dec 2026 – 3 Jan 2027` is the longest title this product can produce, and it shares the
    // header row with the sign-out control (T077).
    await page.clock.setFixedTime(Date.UTC(2026, 11, 30, 3, 0, 0));
    await page.reload();
    // The view is client state, so a reload lands back on the month grid.
    await page.getByTestId("view-week").click();
    await expect(page.getByTestId("week-list")).toBeVisible();
    await expect(page.getByTestId("calendar-period")).toContainText("Jan");

    await auditSurface(page, "/calendar week, cross-boundary title");
  });

  test("/calendar, the filtered empty state", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, [item(1, { platform: "tiktok" })]);
    await page.getByTestId("platform-filter-youtube").click();
    await expect(page.getByTestId("filtered-empty")).toBeVisible();

    await auditSurface(page, "/calendar filtered empty");
  });

  test("/calendar, the first-run state", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL, []);
    await expect(page.getByTestId("first-run")).toBeVisible();

    await auditSurface(page, "/calendar first run");
  });

  /**
   * `/` is a server-side redirect and renders no surface of its own, so what is audited is that it
   * arrives somewhere already audited rather than at a screen nothing covers.
   */
  test("/ redirects to a surface this file audits", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await auditSurface(page, "/ after redirect");
  });
});

test.describe("the overlay surfaces", () => {
  test("the capture sheet", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("capture-action").click();

    const field = page.getByPlaceholder("Rooftop b-roll cutdown");
    await expect(field).toBeInViewport();
    await field.fill(LONG_TITLE);

    await auditSurface(page, "capture sheet");
  });

  test("the backlog drawer, expanded", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("backlog-toggle").click();
    await expect(page.getByTestId("backlog-expanded")).toBeVisible();

    await auditSurface(page, "backlog drawer expanded");
  });

  test("the item sheet, every field filled", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-list").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-save")).toBeInViewport();

    // The link row is the widest thing on the sheet, and the column accepts 2048 characters.
    await page.getByTestId("item-link-input").fill(`https://www.tiktok.com/@creator/video/${"9".repeat(64)}`);

    await auditSurface(page, "item sheet");
  });

  test("the item sheet carrying a 409 refusal", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.route("**/api/content-items/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          code: "platform_required",
          detail: "An item cannot leave ideas without a platform. Pick one first.",
        }),
      });
    });

    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-list").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-save")).toBeInViewport();

    await page.getByTestId("status-option-draft").click();
    await page.getByTestId("item-save").click();
    await expect(page.getByTestId("item-sheet-message")).toBeVisible();

    await auditSurface(page, "item sheet with a 409");
  });

  test("the delete confirmation", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-list").getByTestId("item-chip").first().click();
    await expect(page.getByTestId("item-save")).toBeInViewport();

    await page.getByTestId("item-delete").click();
    await expect(page.getByTestId("delete-confirm")).toBeVisible();

    await auditSurface(page, "delete confirmation");
  });
});
