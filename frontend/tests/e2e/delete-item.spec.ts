import { expect, test, type Page } from "@playwright/test";

/**
 * Deleting an item (T056) — FR-004, FR-020, SC-007, spec Edge Cases.
 *
 * FR-020 is three separate requirements wearing one sentence, and each needs its own assertion:
 * an explicit confirmation, not reachable by a single tap, and not next to a common navigation
 * gesture. A dialog that merely *exists* satisfies the first and neither of the others.
 */

const SESSION_COOKIE = "ch_session";
const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);

test.use({ timezoneId: "Asia/Bangkok" });

function anItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    title: "Rooftop b-roll cutdown",
    hook: null,
    platform: "tiktok",
    scheduled_date: null,
    status: "draft",
    published_url: null,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...overrides,
  };
}

interface Stub {
  readonly deleted: string[];
}

async function open(
  page: Page,
  baseURL: string | undefined,
  {
    items = [anItem()],
    deleteStatus = 204,
    deleteBody,
  }: { items?: Record<string, unknown>[]; deleteStatus?: number; deleteBody?: unknown } = {},
): Promise<Stub> {
  const deleted: string[] = [];

  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) }),
  );
  await page.route("**/api/content-items/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(items[0]),
      });
      return;
    }
    deleted.push(route.request().url());
    await route.fulfill(
      deleteStatus === 204
        ? { status: 204 }
        : {
            status: deleteStatus,
            contentType: "application/json",
            body: JSON.stringify(deleteBody ?? { detail: "Something went wrong." }),
          },
    );
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  return { deleted };
}

/** Chip → DELETE ITEM. Two taps before the confirmation is even on screen. */
async function openConfirm(page: Page): Promise<void> {
  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  await expect(page.getByTestId("item-save")).toBeVisible();
  await page.getByTestId("item-delete").click();
  await expect(page.getByTestId("delete-confirm")).toBeVisible();
}

test("nothing is deleted without an explicit confirmation (SC-007)", async ({ page, baseURL }) => {
  const stub = await open(page, baseURL);

  await openConfirm(page);

  // The confirmation is on screen and the item is still there. A single accidental tap anywhere on
  // the journey so far has deleted nothing.
  expect(stub.deleted).toEqual([]);
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");
});

test("deletion is three deliberate taps from the calendar, never one (FR-020)", async ({
  page,
  baseURL,
}) => {
  const stub = await open(page, baseURL);

  // 1. the chip, 2. DELETE ITEM, 3. DELETE PERMANENTLY. The first two are covered by openConfirm.
  await openConfirm(page);
  await page.getByTestId("delete-confirm-action").click();

  await expect.poll(() => stub.deleted).toHaveLength(1);
  expect(stub.deleted[0]).toContain("/api/content-items/7");
});

test("KEEP ITEM is focused on open, so the reflex key keeps the item", async ({
  page,
  baseURL,
}) => {
  const stub = await open(page, baseURL);
  await openConfirm(page);

  // The export's own footnote: "Keep is focused by default." `Enter` is the key a creator is most
  // likely to still be holding after activating the button that opened this — it must not delete.
  await expect(page.getByTestId("delete-keep")).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("delete-confirm")).toBeHidden();
  expect(stub.deleted).toEqual([]);
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");
});

test("Escape keeps the item — the back-gesture equivalent deletes nothing", async ({
  page,
  baseURL,
}) => {
  const stub = await open(page, baseURL);
  await openConfirm(page);

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("delete-confirm")).toBeHidden();
  expect(stub.deleted).toEqual([]);
});

test("the destructive action is below the safe one, where no back gesture lands", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);
  await openConfirm(page);

  const keep = (await page.getByTestId("delete-keep").boundingBox())!;
  const destroy = (await page.getByTestId("delete-confirm-action").boundingBox())!;

  // `.claude/rules/design.md`: destructive actions are never a single tap away from a common
  // gesture. Order is the mechanism — and both still clear the 44px floor.
  expect(destroy.y).toBeGreaterThan(keep.y);
  expect(keep.height).toBeGreaterThanOrEqual(44);
  expect(destroy.height).toBeGreaterThanOrEqual(44);
});

test("the dialog shows the item itself, not just its title (FR-018)", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openConfirm(page);

  // The creator is about to destroy something irreversible, and the status cue and platform monogram
  // are how they check it is the right one. A quoted title alone is exactly enough information to
  // delete the wrong item confidently.
  const chip = page.getByTestId("delete-confirm-item").getByTestId("item-chip");
  await expect(chip.getByTestId("status-cue")).toHaveAttribute("aria-label", "Draft");
  await expect(chip.getByTestId("platform-cue")).toHaveAttribute("aria-label", "TikTok");

  await expect(page.getByTestId("delete-confirm-message")).toContainText("no trash and no undo");
});

test("an overdue item still reads as overdue in the confirmation", async ({ page, baseURL }) => {
  // The Phase 5 `reviewer` finding. `ItemChip` defaults `today` to null and `isOverdue(item, null)`
  // is false, so a dialog that forgot to pass it dropped the overdue border silently — nothing
  // failed, the border simply was not drawn. On the one surface whose whole justification is "check
  // it is the right one before destroying it", and for exactly the item a creator is most likely to
  // be deleting: one whose day has passed.
  await open(page, baseURL, { items: [anItem({ scheduled_date: "2026-07-28" })] });

  await page.locator('[data-date="2026-07-28"]').getByTestId("item-chip").first().click();
  await expect(page.getByTestId("item-save")).toBeVisible();
  await page.getByTestId("item-delete").click();
  await expect(page.getByTestId("delete-confirm")).toBeVisible();

  const chip = page.getByTestId("delete-confirm-item").getByTestId("item-chip");
  await expect(chip).toHaveAttribute("data-overdue", "");

  // The *computed* style, and the top edge specifically: dashing all four sides is how the drag
  // ghost is drawn, so asserting "dashed somewhere" would pass on the wrong treatment.
  const border = await chip.evaluate((node) => ({
    left: getComputedStyle(node).borderLeftStyle,
    top: getComputedStyle(node).borderTopStyle,
  }));
  expect(border).toEqual({ left: "dashed", top: "solid" });
});

test("the item leaves the surface immediately, without waiting for the server", async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([anItem()]),
    }),
  );
  // Never fulfilled: against a real answer this could not tell optimism from a fast round trip.
  await page.route("**/api/content-items/*", () => {});

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await openConfirm(page);

  await page.getByTestId("delete-confirm-action").click();
  await expect(page.getByTestId("calendar-counts")).toHaveText("0 items");
});

test("a refused delete puts the item back and says why", async ({ page, baseURL }) => {
  await open(page, baseURL, {
    deleteStatus: 500,
    deleteBody: { detail: "The API could not be reached." },
  });
  await openConfirm(page);

  await page.getByTestId("delete-confirm-action").click();

  // The dialog stays open — closing it would leave the creator believing a deletion happened — and
  // the row is back on the surface behind it.
  await expect(page.getByTestId("delete-confirm-message")).toHaveText(
    "The API could not be reached.",
  );
  await expect(page.getByTestId("delete-confirm")).toBeVisible();
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");
});

test("an item already gone is a success, not an error (spec Edge Cases)", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL, {
    deleteStatus: 404,
    deleteBody: { detail: "Content item not found." },
  });
  await openConfirm(page);

  await page.getByTestId("delete-confirm-action").click();

  // T050 settled that the backend answers 404 rather than an idempotent 204, which is right for an
  // API. This call is reconciling a *screen*: the creator asked for the item to be gone and it is
  // gone. An error message describing success is the worst of both.
  await expect(page.getByTestId("delete-confirm")).toBeHidden();
  await expect(page.getByTestId("calendar-counts")).toHaveText("0 items");
});

test("the editing sheet closes before the confirmation opens", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openConfirm(page);

  // Two modal surfaces at once is the layout problem at 375px, and a sheet left open behind a
  // confirmation about the same item is the comprehension one.
  await expect(page.getByTestId("item-save")).toBeHidden();
});

test("the dialog does not make the page scroll sideways at 375px", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openConfirm(page);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
