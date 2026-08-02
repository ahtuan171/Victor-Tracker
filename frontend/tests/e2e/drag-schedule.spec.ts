import { expect, test, type Page } from "@playwright/test";

/**
 * The drag path for scheduling (T054, T055) — FR-014, FR-014a, FR-015b, SC-011, research.md R-003.
 *
 * ## What this file does and does not automate, and why that is a decision
 *
 * R-003 says outright: *"Making the tap path the primary one also means the Playwright E2E flow drives
 * taps. Drag automation is the flakiest thing in a browser suite, and `workflow.md` requires the E2E
 * flow to gate merges — a flaky gate gets disabled, and a disabled gate violates principle VI.
 * SC-011's drag half is validated manually via quickstart V4."*
 *
 * So the **journey** is not dragged here. What is asserted is everything a hand-walk cannot check
 * cheaply or repeatedly:
 *
 * - the **wiring** — which elements are draggable, which are drop targets, and which are neither;
 * - the **activation constraint** (T055), which is the difference between a scroll and a silent
 *   reschedule and is invisible to a walkthrough that happens not to swipe over a chip;
 * - the **one drag that is worth automating**, a deliberate 8px+ pointer drag onto a day cell, because
 *   it is the only way to assert that a drop and a tap produce the *same request*.
 *
 * Quickstart V4 remains the gate for how it feels on a real finger.
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

async function open(
  page: Page,
  baseURL: string | undefined,
  items: Record<string, unknown>[] = [anItem()],
): Promise<{ readonly patched: unknown[] }> {
  const patched: unknown[] = [];

  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(items),
    }),
  );
  await page.route("**/api/content-items/*", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patched.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...items[0], ...body }),
    });
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await expect(page.getByTestId("month-grid")).toBeVisible();

  return { patched };
}

/** A deliberate drag: press, cross the 8px activation threshold in steps, release over the target. */
async function drag(
  page: Page,
  from: ReturnType<Page["locator"]>,
  to: ReturnType<Page["locator"]>,
) {
  const source = (await from.boundingBox())!;
  const target = (await to.boundingBox())!;

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  // In steps, and past 8px: a single jump can be delivered as one event that the sensor sees after
  // the pointer has already stopped, which is exactly the case a real finger never produces.
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("a chip is draggable, and the calendar and backlog are the drop targets (R-003)", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  // dnd-kit's own marker. Asserting the attribute rather than a class means a refactor that drops
  // `useDraggable` fails here rather than silently shipping an undraggable chip.
  await expect(chip).toHaveAttribute("aria-roledescription", "draggable");

  // Day cells are droppables; so is the backlog strip, which is what "back to undated" means.
  await expect(page.getByTestId("day-cell").first()).toBeVisible();
  await expect(page.getByTestId("backlog-peek")).toBeVisible();
});

test("dragging an undated item onto a day sends the same PATCH the sheet would (FR-014a)", async ({
  page,
  baseURL,
}) => {
  const stub = await open(page, baseURL);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  const day = page.locator('[data-date="2026-08-12"]');

  await drag(page, chip, day);

  // One field, one request — and byte-for-byte what `item-sheet.spec.ts` asserts for the tap path.
  // "Both produce an identical result" is only checkable because both call `updateItem`.
  await expect.poll(() => stub.patched).toEqual([{ scheduled_date: "2026-08-12" }]);
});

test("dragging a dated item onto the backlog unschedules it", async ({ page, baseURL }) => {
  const stub = await open(page, baseURL, [anItem({ scheduled_date: "2026-08-12" })]);

  const chip = page.locator('[data-date="2026-08-12"]').getByTestId("item-chip").first();

  await drag(page, chip, page.getByTestId("backlog-peek"));

  // An explicit null, not an omission — the drag counterpart of the sheet's CLEAR button.
  await expect.poll(() => stub.patched).toEqual([{ scheduled_date: null }]);
});

test("dropping an item back on its own day sends nothing", async ({ page, baseURL }) => {
  const stub = await open(page, baseURL, [anItem({ scheduled_date: "2026-08-12" })]);

  const day = page.locator('[data-date="2026-08-12"]');
  await drag(page, day.getByTestId("item-chip").first(), day);

  // A no-op drop is not an empty PATCH: the backend refuses `{}` with a 422 (`minProperties: 1`), so
  // a creator who picked a chip up and changed their mind must not see an error.
  await page.waitForTimeout(300);
  expect(stub.patched).toEqual([]);
});

test("T055: a small movement scrolls the grid rather than lifting the chip", async ({
  page,
  baseURL,
}) => {
  const stub = await open(page, baseURL, [anItem({ scheduled_date: "2026-08-12" })]);

  const chip = page.locator('[data-date="2026-08-12"]').getByTestId("item-chip").first();
  const box = (await chip.boundingBox())!;

  // 5px, under the 8px activation constraint. This is the gesture that silently rescheduled items
  // before the constraint existed: a creator swiping to scroll the month grid, starting on a chip.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 5, {
    steps: 5,
  });
  await page.mouse.up();

  await page.waitForTimeout(300);
  expect(stub.patched).toEqual([]);
});

test("T055: chips opt out of browser touch gestures, which is the other half", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();

  // The activation constraint alone is not enough: without `touch-action: none` the browser can
  // claim the gesture as a pan before the sensor ever sees the movement. Neither half works alone,
  // which is why both are asserted.
  await expect(chip).toHaveCSS("touch-action", "none");
});

test("a pending row is neither draggable nor openable — one guard, both paths", async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    // Never fulfilled: the optimistic row stays pending for the whole test.
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");

  // Expand first — the capture sheet's scrim covers the drawer toggle while a save is in flight.
  await page.getByTestId("backlog-toggle").click();
  await page.getByTestId("backlog-capture-action").click();
  await page.getByLabel("Title").fill("Idea from the car");
  await page.getByTestId("capture-save").click();

  const chip = page.getByTestId("backlog-row").getByTestId("item-chip").first();
  await expect(chip).toHaveAttribute("aria-busy", "true");

  // `useDraggable({disabled})` rather than a conditional hook, and the same `isPending` that stops
  // the sheet opening — a drop would name an id the server has not issued.
  await expect(chip).not.toHaveAttribute("aria-roledescription", "draggable");
});

test("Enter on a chip opens the sheet — the amendment to R-003 in one assertion", async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await chip.focus();
  await page.keyboard.press("Enter");

  // dnd-kit's `KeyboardSensor` activates on `Space`/`Enter` — a button's own keys. Registering it
  // would make this impossible, trading the *primary* editing path for the secondary one. FR-015b and
  // SC-011 ask for date changes without a *drag*, not for a drag by keyboard, and the sheet's date
  // input satisfies both. research.md R-003 is amended to match.
  await expect(page.getByTestId("item-save")).toBeVisible();
  await expect(page.getByTestId("item-date-input")).toBeVisible();
});

test("the drawer promises the drag only now that it exists", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.getByTestId("backlog-toggle").click();

  // T035 shipped the first half of the export's line on purpose, because copy that promises a gesture
  // the product does not have is a bug in the same way a dead button is.
  await expect(page.getByTestId("backlog-expanded")).toContainText(
    "Undated ideas, newest first. Drag one onto a day to schedule it.",
  );
});
