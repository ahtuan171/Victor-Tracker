import { expect, test, type Page } from "@playwright/test";

/**
 * An item acted on after it was deleted somewhere else (T070) — FR-023a, spec Edge Cases.
 *
 * The edge case: *"Acting on an item already changed or deleted on another device — the later action
 * wins per FR-023a; if the item no longer exists the view recovers on refresh **without presenting a
 * phantom item as editable**."*
 *
 * ## Why this is the *update* path and not the delete path
 *
 * A `DELETE` that 404s was settled at **T056** and is asserted in `delete-item.spec.ts` ("an item
 * already gone is a success, not an error"): the row was already removed optimistically, the creator
 * asked for it to be gone, and it is gone — so there is no phantom and an error describing success
 * would be the worst of both. Nothing is owed there.
 *
 * A `PATCH` that 404s was the opposite, and it is the defect T070 exists to fix. `updateItem` rolled
 * every failure back with `itemChanged(previous, item)`, which **restores the row** — so an item
 * deleted on the creator's other device came back onto the grid the moment they edited or dragged it
 * here, and the sheet stayed open on it. That is a phantom item presented as editable, in the exact
 * words of the requirement, and a second save produced the same 404 forever.
 *
 * The two therefore differ by design and this file pins the difference, so a later "tidy the two 404
 * branches into one" has something to fail against.
 */

const SESSION_COOKIE = "ch_session";
const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);

test.use({ timezoneId: "Asia/Bangkok" });

function anItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

/**
 * `patchStatus` is the whole variable here: 404 is the item being gone, and anything else is an
 * ordinary refusal that must still roll back and say nothing about staleness.
 */
async function open(
  page: Page,
  baseURL: string | undefined,
  {
    items = [anItem()],
    patchStatus = 404,
    patchBody,
  }: {
    items?: Record<string, unknown>[];
    patchStatus?: number;
    patchBody?: unknown;
  } = {},
): Promise<{ readonly patched: unknown[] }> {
  const patched: unknown[] = [];

  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) }),
  );
  await page.route("**/api/content-items/*", async (route) => {
    patched.push(route.request().postDataJSON());
    await route.fulfill({
      status: patchStatus,
      contentType: "application/json",
      body: JSON.stringify(
        patchBody ?? { detail: patchStatus === 404 ? "Content item not found." : "Nope." },
      ),
    });
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  return { patched };
}

/** Open the one backlog item and advance its status, which is the smallest real edit. */
async function editAndSave(page: Page): Promise<void> {
  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  await expect(page.getByTestId("item-save")).toBeVisible();
  await page.getByTestId("status-option-draft").click();
  await page.getByTestId("item-save").click();
}

/** A deliberate drag, past the 8px activation constraint — the same helper `drag-schedule` uses. */
async function drag(
  page: Page,
  from: ReturnType<Page["locator"]>,
  to: ReturnType<Page["locator"]>,
): Promise<void> {
  const source = (await from.boundingBox())!;
  const target = (await to.boundingBox())!;

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("a save on an item deleted elsewhere takes it off the calendar, phantom and all", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  await editAndSave(page);

  // The rollback used to put this row back. Nothing on any surface may still be showing it.
  await expect(page.getByTestId("item-chip")).toHaveCount(0);
});

test("the sheet closes rather than leaving a phantom item editable (spec Edge Cases)", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  await editAndSave(page);

  // `CalendarShell` holds the *id* and looks the row up each render, so removing it from the store
  // closes the sheet with no extra code — this asserts that consequence, which is the requirement's
  // own wording ("without presenting a phantom item as editable").
  await expect(page.getByTestId("item-save")).toBeHidden();
});

test("the notice names the item, so a chip that vanishes is explained", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  await editAndSave(page);

  const notice = page.getByTestId("stale-notice");
  await expect(notice).toBeVisible();
  // Without the title the creator sees a sheet close and a chip disappear with no way to tell which
  // item went — and on the drag path, no sheet closed at all.
  await expect(notice).toContainText("Ring light review");
});

test("a drag onto a day reports it too — the path that used to swallow the refusal", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await drag(page, chip, page.getByTestId("day-cell").nth(10));

  // `onDragEnd` caught and discarded every rejection, on the stated grounds that the row returning
  // to its old day was feedback enough. It is not feedback when the row is *gone*.
  await expect(page.getByTestId("stale-notice")).toBeVisible();
  await expect(page.getByTestId("item-chip")).toHaveCount(0);
});

test("the notice can be dismissed", async ({ page, baseURL }) => {
  await open(page, baseURL);

  await editAndSave(page);
  await expect(page.getByTestId("stale-notice")).toBeVisible();

  await page.getByTestId("stale-notice-dismiss").click();
  await expect(page.getByTestId("stale-notice")).toBeHidden();
});

test("an ordinary refusal still puts the row back, and says nothing about staleness", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL, {
    patchStatus: 409,
    patchBody: { code: "platform_required", detail: "Give it a platform first." },
  });

  await editAndSave(page);

  // The 404 branch must not widen into "any failed write removes the row". A 409 is the server
  // saying the item exists and the change is wrong — the row stays, the sheet stays, T053 renders it.
  await expect(page.getByTestId("item-chip")).toHaveCount(1);
  await expect(page.getByTestId("item-save")).toBeVisible();
  await expect(page.getByTestId("stale-notice")).toBeHidden();
  await expect(page.getByTestId("item-sheet-message")).toContainText("Give it a platform first.");
});

test("the dismiss control carries the one focus indicator (T067)", async ({ page, baseURL }) => {
  await open(page, baseURL);

  await editAndSave(page);
  const dismiss = page.getByTestId("stale-notice-dismiss");
  await expect(dismiss).toBeVisible();

  // `focus-states.spec.ts` sweeps the surfaces it can reach, and this control only exists after a
  // write has been refused — so the sweep never sees it. Asserted here instead, with T067's two
  // lessons kept: focus is driven by **keyboard**, because `:focus-visible` is a modality heuristic
  // that a programmatic `.focus()` does not satisfy on a button; and the assertion is for the value
  // the design specifies (`solid`, 2px), never merely "not the default" — Chromium draws its own
  // `auto` 1px ring, which is what made the first version of that spec pass against the bug.
  await dismiss.evaluate((el: HTMLElement) => el.focus());
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");

  const outline = await dismiss.evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("the notice does not push the action band off a 375px screen", async ({ page, baseURL }) => {
  await open(page, baseURL);

  await editAndSave(page);
  await expect(page.getByTestId("stale-notice")).toBeVisible();

  // The trap this guards is recorded twice in `frontend/AGENTS.md`: the action band *clips* rather
  // than extending the document's scroll width, so a control can leave the screen with the overflow
  // check still false. Assert the control is inside the viewport, not only that the body behaves.
  const capture = (await page.getByTestId("capture-action").boundingBox())!;
  expect(capture.x + capture.width).toBeLessThanOrEqual(375);

  const scrolls = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrolls).toBe(false);
});
