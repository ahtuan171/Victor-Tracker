import { expect, test, type Page } from "@playwright/test";

/**
 * The text-size audit (T009, SC-014, FR-032–FR-034) — every route and every overlay surface,
 * mirroring `viewport-audit.spec.ts`'s coverage and its reason for existing: a hand-written list of
 * testids goes stale the day a surface grows a text node, so this sweeps the DOM instead.
 *
 * **Expected to be red until Phase 3 restyles a surface onto the new type scale — that is the test
 * working, not a bug in the test.** VT323 is loaded (T002) but nothing renders in it yet; every
 * surface here still carries the outgoing Barlow/Oswald sizes, several of which sit under both
 * floors this file checks. `tasks.md`'s "Predicted two-task merge requests" names this pairing
 * (T009 with T014) for exactly this reason.
 *
 * ## Three checks, and why content text needs a bounded list where a control does not
 *
 * - **FR-033, everywhere, no exceptions**: no visible text renders below 12px. Checked the same way
 *   `viewport-audit.spec.ts` checks controls — every element in the DOM, filtered by visibility, not
 *   by a maintained list.
 * - **FR-032, content text only**: an item's title, its hook, and any value shown inside a cell or
 *   row must be at least 16px. Unlike a *control*, which can appear anywhere and in any number,
 *   FR-032 names a **closed, bounded set** — title, hook, cell/row values, nothing else — so the
 *   testids that carry them are named directly rather than inferred from tag or role. This does not
 *   go stale the way a hand-written control list would, because the requirement itself is closed.
 * - **FR-034**: any text below 16px must use the more legible face (VT323), never the display face
 *   (Silkscreen) reserved for headings and labels.
 */

const SESSION_COOKIE = "ch_session";
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

const BUSY = [
  item(1, { scheduled_date: "2026-03-11", platform: "tiktok", status: "draft" }),
  item(2, {
    scheduled_date: "2026-03-11",
    platform: "youtube",
    status: "posted",
    published_url: "https://www.youtube.com/watch?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }),
  item(3, { scheduled_date: "2026-03-11", platform: "instagram" }),
  item(4, { scheduled_date: "2026-02-02" }),
  item(5), // undated — the one row the backlog drawer has something to show
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
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) });
  });

  await page.clock.setFixedTime(MARCH_2026);
  await page.goto("/calendar");
  await expect(page.getByTestId("capture-action")).toBeVisible();
}

/**
 * Every visible text violation on the current screen, as `label: Npx <reason>`.
 *
 * Two passes: text nodes (chip titles, labels, counts — everything rendered as static text) and
 * form-field elements separately, because a typed or placeholder value in an `<input>`/`<textarea>`
 * is never a DOM text node and a tree-walker would silently skip every field on the item sheet.
 */
async function textSizeViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    /*
     * FR-032's closed set: an item's title, its hook, and any value shown inside a cell or row.
     * `item-chip` wraps the title (and, on a `full` chip, the hook) everywhere a chip appears — the
     * month grid, the week list, and the backlog drawer all compose it rather than each drawing its
     * own text. The item sheet's own title/hook fields are the editable form of the same two values.
     */
    const CONTENT_ANCESTOR_TESTIDS = ["item-chip", "item-title-input", "item-hook-input"];

    function isContentText(el: Element): boolean {
      return CONTENT_ANCESTOR_TESTIDS.some(
        (testid) => el.closest(`[data-testid="${testid}"]`) !== null,
      );
    }

    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (el.closest('[aria-hidden="true"]') !== null) return false;
      // `sr-only` (Tailwind's screen-reader-only utility: clipped to 1x1px, not display:none) is
      // visible to `getBoundingClientRect` but not to anyone reading the screen — FR-032/033/034 are
      // about what a person can see, not what a screen reader announces. `ItemChip`'s `micro` chip
      // relies on exactly this pattern for its accessible title.
      if (el.closest(".sr-only") !== null) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function labelFor(el: Element, sample: string): string {
      return el.getAttribute("data-testid") ?? `${el.tagName.toLowerCase()}:${sample.slice(0, 24)}`;
    }

    function checkElement(el: Element, size: number, family: string, sample: string): string[] {
      const found: string[] = [];
      const label = labelFor(el, sample);

      if (size < 12) {
        found.push(`${label}: ${size}px < 12px absolute floor (FR-033)`);
      } else if (isContentText(el) && size < 16) {
        found.push(`${label}: ${size}px < 16px content floor (FR-032)`);
      }

      if (size < 16 && family.includes("Silkscreen")) {
        found.push(`${label}: ${size}px uses the display face below 16px, not VT323 (FR-034)`);
      }

      return found;
    }

    const violations: string[] = [];

    // Pass 1: static text nodes.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (parent === null || !isVisible(parent)) continue;
      // Form fields are covered in pass 2, from their own font-size — a placeholder is not a text
      // node, and double-counting a field's ordinary label text here is harmless but redundant.
      if (parent.tagName === "INPUT" || parent.tagName === "TEXTAREA") continue;

      const style = getComputedStyle(parent);
      const size = Math.round(parseFloat(style.fontSize) * 100) / 100;
      violations.push(...checkElement(parent, size, style.fontFamily, text));
    }

    // Pass 2: form fields, checked by their own font-size regardless of whether they hold a value.
    for (const el of Array.from(document.querySelectorAll("input, textarea"))) {
      if (!isVisible(el)) continue;
      const style = getComputedStyle(el);
      const size = Math.round(parseFloat(style.fontSize) * 100) / 100;
      const sample = (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || "";
      violations.push(...checkElement(el, size, style.fontFamily, sample));
    }

    return violations;
  });
}

async function auditSurface(page: Page, surface: string): Promise<void> {
  expect(await textSizeViolations(page), `${surface}: text-size violations`).toEqual([]);
}

test.describe("the routes", () => {
  test("/login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await auditSurface(page, "/login");
  });

  test("/calendar, month view, busy", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await expect(page.getByTestId("month-grid")).toBeVisible();
    await auditSurface(page, "/calendar month");
  });

  test("/calendar, week view, busy", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("view-week").click();
    await expect(page.getByTestId("week-list")).toBeVisible();
    await auditSurface(page, "/calendar week");
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
});

test.describe("the overlay surfaces", () => {
  test("the capture sheet", async ({ page, baseURL }) => {
    await openCalendar(page, baseURL);
    await page.getByTestId("capture-action").click();
    await expect(page.getByPlaceholder("Rooftop b-roll cutdown")).toBeInViewport();
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
    await auditSurface(page, "item sheet");
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
