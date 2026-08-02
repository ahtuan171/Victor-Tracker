import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * The item sheet (T052) at the 375x667 floor — FR-006a, FR-006, FR-007, FR-008, FR-010, FR-010a,
 * FR-014, FR-015, FR-015b, SC-012.
 *
 * This is the surface whose absence would have left every item stuck in `idea` forever, so the
 * assertions here are mostly about *what leaves the browser*: which fields, in which shape, in how
 * many requests. The proxy is stubbed for the reason every e2e file stubs it — CI has no FastAPI
 * behind the bundle — and `PATCH /content-items/{id}` itself is covered by
 * `backend/tests/test_content_items.py`. Quickstart V4/V5/V7 walk the seam by hand.
 *
 * The clock is pinned **with** a timezone: `page.clock.setFixedTime` pins the instant, and the zone
 * that turns it into a calendar day still comes from the machine running the browser. That has turned
 * this project's CI red four times.
 */

const SESSION_COOKIE = "ch_session";
/**
 * `Date.UTC` rather than `new Date("…")` — eslint forbids the second project-wide, because
 * `new Date("2026-08-04")` parses as UTC midnight and renders as the 3rd west of Greenwich. A
 * timestamp is an instant, and this is how the rest of the suite spells one.
 */
const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);

test.use({ timezoneId: "Asia/Bangkok" });

interface StubItem {
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

function anItem(overrides: Partial<StubItem> = {}): StubItem {
  return {
    id: 7,
    title: "Ring light review",
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

interface Stub {
  /** Every `PATCH` body the page sent, in order. One save must be one request. */
  readonly patched: unknown[];
  /** Every request URL, so a test can assert the calendar's read stays unparameterised. */
  readonly urls: string[];
}

/**
 * Stub the list read and the by-id update.
 *
 * `patchStatus`/`patchBody` let a test make the save fail — the branch that decides whether the
 * creator's edit survives a refusal, and the branch T053 will build on.
 */
async function stubApi(
  page: Page,
  {
    items = [anItem()],
    patchStatus = 200,
    patchBody,
  }: { items?: StubItem[]; patchStatus?: number; patchBody?: unknown } = {},
): Promise<Stub> {
  const patched: unknown[] = [];
  const urls: string[] = [];

  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    urls.push(request.url());

    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(items),
      });
      return;
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    patched.push(body);
    await route.fulfill({
      status: patchStatus,
      contentType: "application/json",
      body: JSON.stringify(patchBody ?? { ...items[0], ...body, updated_at: "2026-08-04T09:00:01Z" }),
    });
  };

  // Two routes, because `**/api/content-items*` does not match a path segment after the collection.
  await page.route("**/api/content-items", handle);
  await page.route("**/api/content-items/*", handle);

  return { patched, urls };
}

async function openCalendar(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
}

/** Open the sheet from the backlog drawer's peek strip — the fewest interactions to reach it. */
async function openFromPeek(page: Page): Promise<void> {
  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  await expect(page.getByTestId("item-save")).toBeVisible();
}

const save = (page: Page) => page.getByTestId("item-save");

test("tapping an item in the backlog opens it for editing (FR-006a)", async ({ page, baseURL }) => {
  await stubApi(page);
  await openCalendar(page, baseURL);

  await openFromPeek(page);

  await expect(page.getByTestId("item-title-input")).toHaveValue("Ring light review");
});

test("tapping an item in the week list opens the same sheet", async ({ page, baseURL }) => {
  await stubApi(page, { items: [anItem({ scheduled_date: "2026-08-04" })] });
  await openCalendar(page, baseURL);

  await page.getByTestId("view-week").click();
  await page.getByTestId("week-list").getByTestId("item-chip").first().click();

  // One sheet, reached from every surface — FR-015's "without opening a separate detail page" is
  // about there being no second screen, not about there being no sheet.
  await expect(page.getByTestId("item-title-input")).toHaveValue("Ring light review");
});

test("it carries every field FR-006a requires except the link, which is T064", async ({
  page,
  baseURL,
}) => {
  await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await expect(page.getByTestId("item-title-input")).toBeVisible();
  await expect(page.getByTestId("item-hook-input")).toBeVisible();
  await expect(page.getByTestId("item-date-input")).toBeVisible();

  // Three statuses, both directions available at once (FR-007, FR-008), and three platforms with no
  // fourth (FR-010).
  for (const status of ["idea", "draft", "posted"]) {
    await expect(page.getByTestId(`status-option-${status}`)).toBeVisible();
  }
  for (const platform of ["tiktok", "instagram", "youtube"]) {
    await expect(page.getByTestId(`platform-option-${platform}`)).toBeVisible();
  }
});

test("a save sends only the fields that changed", async ({ page, baseURL }) => {
  const stub = await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("status-option-draft").click();
  await save(page).click();
  await expect(save(page)).toBeHidden();

  // Not the whole item. A PATCH that resends every field is a full replacement, and it would rewrite
  // whatever this screen last read over anything changed elsewhere.
  expect(stub.patched).toEqual([{ status: "draft" }]);
});

test("a platform and a status advance leave together in ONE request (SC-012)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("platform-option-tiktok").click();
  await page.getByTestId("status-option-posted").click();
  await save(page).click();
  await expect(save(page)).toBeHidden();

  // The whole of SC-012. Written per-tap this would be two requests and the first would be a
  // guaranteed 409 — `check_invariant_1` validates the item as it would be *after* the change
  // precisely so this single request exists.
  expect(stub.patched).toEqual([{ platform: "tiktok", status: "posted" }]);
});

test("status moves backward as easily as forward (FR-008)", async ({ page, baseURL }) => {
  const stub = await stubApi(page, {
    items: [anItem({ status: "posted", platform: "tiktok" })],
  });
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("status-option-idea").click();
  await save(page).click();
  await expect(save(page)).toBeHidden();

  expect(stub.patched).toEqual([{ status: "idea" }]);
});

test("the platform is single-select, and tapping the chosen one clears it (FR-010a, FR-009a)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page, { items: [anItem({ platform: "tiktok" })] });
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("platform-option-instagram").click();
  // At most one, always — picking a second replaces the first rather than adding to it.
  await expect(page.getByTestId("platform-option-tiktok")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("platform-option-instagram")).toHaveAttribute("aria-pressed", "true");

  // And `null` stays reachable, which is the only way to meet the `platform_locked` refusal at all.
  await page.getByTestId("platform-option-instagram").click();
  await expect(page.getByTestId("platform-option-instagram")).toHaveAttribute("aria-pressed", "false");

  await save(page).click();
  await expect(save(page)).toBeHidden();
  expect(stub.patched).toEqual([{ platform: null }]);
});

test("setting a date sends YYYY-MM-DD, the tap half of FR-014", async ({ page, baseURL }) => {
  const stub = await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("item-date-input").fill("2026-08-09");
  await save(page).click();
  await expect(save(page)).toBeHidden();

  // The exact string the column, the contract and `lib/dates.ts` all use. No `Date` is constructed
  // anywhere on this path, so R-006's UTC-midnight trap has nowhere to occur.
  expect(stub.patched).toEqual([{ scheduled_date: "2026-08-09" }]);
});

test("clearing the date sends an explicit null, so the tap path can unschedule (SC-011)", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page, { items: [anItem({ scheduled_date: "2026-08-09" })] });
  await openCalendar(page, baseURL);

  await page.getByTestId("month-grid").getByTestId("item-chip").first().click();
  await expect(save(page)).toBeVisible();

  await page.getByTestId("item-date-clear").click();
  await save(page).click();
  await expect(save(page)).toBeHidden();

  // Omission would mean "leave the date alone". Without this control the tap path could schedule but
  // never unschedule, leaving T054's drag as the only way back to the backlog — the pointer-only
  // dependency SC-011 forbids.
  expect(stub.patched).toEqual([{ scheduled_date: null }]);
  expect("scheduled_date" in (stub.patched[0] as Record<string, unknown>)).toBe(true);
});

test("clearing the hook sends null rather than an empty string", async ({ page, baseURL }) => {
  const stub = await stubApi(page, { items: [anItem({ hook: "Open on the ledge shot" })] });
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("item-hook-input").fill("");
  await save(page).click();
  await expect(save(page)).toBeHidden();

  expect(stub.patched).toEqual([{ hook: null }]);
});

test("saving with nothing changed closes without a request", async ({ page, baseURL }) => {
  const stub = await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await save(page).click();
  await expect(save(page)).toBeHidden();

  // The backend refuses an empty body with a 422 (`minProperties: 1`) on purpose, so a no-op save
  // must not become one.
  expect(stub.patched).toEqual([]);
});

test("the cue updates immediately, without waiting for the server (US3 scenario 3)", async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);

  await page.route("**/api/content-items", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([anItem({ platform: "tiktok" })]),
    });
  });
  // Never fulfilled: with a real answer the assertion could not tell optimism from a fast round trip.
  await page.route("**/api/content-items/*", () => {});

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await openFromPeek(page);

  await page.getByTestId("status-option-posted").click();
  await save(page).click();

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await expect(chip.getByTestId("status-cue")).toHaveAttribute("aria-label", "Posted");
});

test("a refused save keeps the sheet open with the edit intact", async ({ page, baseURL }) => {
  await stubApi(page, {
    patchStatus: 409,
    patchBody: {
      code: "platform_required",
      detail: "Pick a platform before moving this item out of ideas.",
    },
  });
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("status-option-draft").click();
  await save(page).click();

  // Same rule as the capture sheet: losing the edit *and* being told no is the worst outcome. The
  // platform control is one column to the right, which is the layout half of SC-012 — T053 makes the
  // code itself legible.
  await expect(page.getByTestId("item-sheet-message")).toHaveText(/Pick a platform/);
  await expect(page.getByTestId("status-option-draft")).toHaveAttribute("aria-checked", "true");
  await expect(save(page)).toBeVisible();
});

test("a refused save rolls the optimistic change back off the calendar", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, {
    items: [anItem({ platform: "tiktok" })],
    patchStatus: 409,
    patchBody: { code: "platform_locked", detail: "Move this item back to ideas first." },
  });
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await expect(chip.getByTestId("status-cue")).toHaveAttribute("aria-label", "Idea");

  await page.getByTestId("status-option-posted").click();
  await save(page).click();

  // An optimistic change that survives its own rejection shows the creator a state the server does
  // not hold, and it will be gone tomorrow.
  await expect(page.getByTestId("item-sheet-message")).toHaveText(/Move this item back/);
  await expect(chip.getByTestId("status-cue")).toHaveAttribute("aria-label", "Idea");
});

test("closing discards the edit and sends nothing", async ({ page, baseURL }) => {
  const stub = await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("item-title-input").fill("Changed my mind");
  await page.getByTestId("item-sheet-close").click();
  await expect(save(page)).toBeHidden();

  expect(stub.patched).toEqual([]);

  // Reopening starts from the stored row, not from the abandoned draft — nothing was written, so
  // nothing should look as though it was.
  await openFromPeek(page);
  await expect(page.getByTestId("item-title-input")).toHaveValue("Ring light review");
});

test("a pending row cannot be opened — its id does not exist yet", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);

  await page.route("**/api/content-items", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    // Never fulfilled, so the optimistic row stays pending for the whole test.
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");

  // The drawer must be expanded *before* capturing: the capture sheet stays open until the save
  // resolves, and its scrim covers the drawer toggle.
  await page.getByTestId("backlog-toggle").click();
  await page.getByTestId("backlog-capture-action").click();
  await page.getByLabel("Title").fill("Idea from the car");
  await page.getByTestId("capture-save").click();

  const chip = page.getByTestId("backlog-row").getByTestId("item-chip").first();
  await expect(chip).toHaveAttribute("aria-busy", "true");

  // Not a disabled button — an `<article>`. A disabled button is still a tab stop promising
  // something, and a `PATCH /content-items/-1` is a 404 at best.
  await expect(chip).toHaveJSProperty("tagName", "ARTICLE");
});

test("editing never re-reads the list, so the backlog cannot empty itself", async ({
  page,
  baseURL,
}) => {
  const stub = await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  await page.getByTestId("status-option-draft").click();
  await save(page).click();
  await expect(save(page)).toBeHidden();

  // One unparameterised read on mount, then one PATCH. `reload()` still has no caller: an optimistic
  // edit reconciles against the PATCH response, so there is nothing left to re-read — and a ranged
  // re-read would return no undated rows and empty the drawer.
  const reads = stub.urls.filter((url) => url.endsWith("/api/content-items"));
  expect(reads).toEqual([reads[0]]);
});

test("every control clears the 44px tap floor and the sheet does not scroll the page sideways", async ({
  page,
  baseURL,
}) => {
  await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  // The export draws the status and platform options at 40px. `.claude/rules/design.md` makes 44px a
  // hard floor, and these six sit in the densest part of the sheet — exactly where a missed tap is
  // most likely. This assertion is why the design is knowingly not followed to the pixel here.
  for (const id of ["status-option-idea", "platform-option-tiktok", "item-save", "item-date-clear"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box!.height, id).toBeGreaterThanOrEqual(44);
  }

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the save button stays in thumb reach at the 375x667 floor", async ({ page, baseURL }) => {
  await stubApi(page);
  await openCalendar(page, baseURL);
  await openFromPeek(page);

  // `toBeInViewport` rather than a bounding-box comparison, and the difference is not pedantry: the
  // sheet enters on a 200ms `translate-y` transition, so a box measured the instant the button
  // becomes *visible* is still 40px below where it lands. This retries until it settles.
  await expect(save(page)).toBeInViewport();

  const box = await save(page).boundingBox();
  const viewport = page.viewportSize();

  // The sheet's content is taller than the space it has at 667px, so the fields scroll inside their
  // own container rather than pushing the primary action off the bottom (design.md, FR-022).
  expect(box!.y).toBeGreaterThan(viewport!.height / 2);
});

test("an overdue item says so in the sheet, on the field that caused it", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, { items: [anItem({ scheduled_date: "2026-07-28" })] });
  await openCalendar(page, baseURL);

  await page.getByTestId("month-grid").getByTestId("item-chip").first().click();
  await expect(save(page)).toBeVisible();

  await expect(page.getByTestId("item-overdue-note")).toBeVisible();

  // And it goes away the moment the creator fixes the thing it is about, without a save — the note
  // describes the draft, not the stored row.
  await page.getByTestId("item-date-input").fill("2026-08-20");
  await expect(page.getByTestId("item-overdue-note")).toBeHidden();
});
