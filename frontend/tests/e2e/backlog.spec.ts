import { expect, test, type Page } from "@playwright/test";

/**
 * The backlog drawer (T035, FR-011, research.md R-003a), at the 375x667 floor.
 *
 * **This is the file that makes User Story 1's Independent Test runnable.** Its goal is "capture an
 * idea with only a title, in under 15 seconds, *and find it in the backlog later*", and until this
 * task nothing on any surface displayed a captured item — the header count was the only feedback.
 *
 * The proxy is stubbed for the reason every other e2e file stubs it: CI runs the production bundle
 * with no FastAPI behind it. What is asserted here is the surface — which items appear, in what
 * order, and what the two states do. The `scheduled=none` query the endpoint offers is covered by
 * `backend/tests/test_content_items.py`; this drawer deliberately does not use it.
 */

const SESSION_COOKIE = "ch_session";

async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

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

/** Stub the list read, and record creates so the optimistic path can be driven. */
async function stubApi(
  page: Page,
  items: unknown[],
  { hangCreate = false }: { hangCreate?: boolean } = {},
): Promise<void> {
  await page.route("**/api/content-items*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(items),
      });
      return;
    }
    // Left hanging so an assertion can only pass through the optimistic path — with a real answer it
    // could not tell optimism from a fast round trip.
    if (hangCreate) return;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(item(99, { title: "Saved" })),
    });
  });
}

const toggle = (page: Page) => page.getByTestId("backlog-toggle");
const rows = (page: Page) => page.getByTestId("backlog-row");

test("undated items appear in the drawer, newest first", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  // The server returns created_at DESC, id DESC (T031). The drawer preserves that order rather than
  // re-sorting, so a regression to a client-side sort shows up as the wrong sequence here.
  await stubApi(page, [item(3, { title: "Newest" }), item(2, { title: "Middle" }), item(1, { title: "Oldest" })]);

  await page.goto("/calendar");
  await toggle(page).click();

  await expect(rows(page)).toHaveText(["Newest", "Middle", "Oldest"]);
});

test("dated items are not in the backlog", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [
    item(2, { title: "Undated" }),
    item(1, { title: "Dated", scheduled_date: "2026-09-01" }),
  ]);

  await page.goto("/calendar");

  // FR-011. The count is visible without expanding, which is the peek strip's whole job.
  await expect(page.getByTestId("backlog-count").first()).toHaveText("1");

  await toggle(page).click();
  await expect(rows(page)).toHaveText(["Undated"]);
});

test("a posted item with no date still belongs in the backlog", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [item(1, { title: "Published, never scheduled", status: "posted" })]);

  await page.goto("/calendar");
  await toggle(page).click();

  // The backlog is "undated", not "ideas" — which is why T041 has its own task to put the status cue
  // on these rows rather than assuming they are all `idea`.
  await expect(rows(page)).toHaveText(["Published, never scheduled"]);
});

test("the empty state names the capture action", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, []);

  await page.goto("/calendar");

  // "Empty" alone reads as something being broken. T035 asks the empty state to point at capture,
  // and the peek strip is the state a first-run creator actually sees.
  await expect(page.getByTestId("backlog-empty-peek")).toContainText(/capture/i);
  await expect(page.getByTestId("backlog-count").first()).toHaveText("0");
});

test("the drawer expands and collapses", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [item(1)]);

  await page.goto("/calendar");
  await expect(page.getByTestId("backlog-expanded")).toBeHidden();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");

  await toggle(page).click();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: /close drawer/i }).click();
  await expect(page.getByTestId("backlog-expanded")).toBeHidden();
});

test("tapping the scrim collapses the drawer", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [item(1)]);

  await page.goto("/calendar");
  await toggle(page).click();
  await page.getByTestId("backlog-scrim").click({ position: { x: 10, y: 10 } });

  await expect(page.getByTestId("backlog-expanded")).toBeHidden();
});

test("capture stays reachable while the drawer is open", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [item(1)]);

  await page.goto("/calendar");
  await toggle(page).click();

  // The expanded drawer covers the action band, so FR-022 would be broken by omission if the drawer
  // did not carry capture itself — and a creator browsing their backlog is exactly the person about
  // to think of the next idea.
  const capture = page.getByTestId("backlog-capture-action");
  const box = await capture.boundingBox();
  const viewport = page.viewportSize();

  expect(box!.y).toBeGreaterThan(viewport!.height / 2);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await capture.click();
  await expect(page.getByLabel("Title")).toBeFocused();
});

test("a captured idea reaches the backlog before the server answers", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [], { hangCreate: true });

  await page.goto("/calendar");
  await expect(page.getByTestId("backlog-empty-peek")).toBeVisible();

  // Expanded *before* capturing, and that ordering is the test's one subtlety. The capture sheet
  // stays open until the save resolves (T034: a refused save must keep the creator's typing), so
  // with the create left hanging its scrim covers the drawer toggle — there is no way to open the
  // drawer from here. Opening it first is not a workaround; it is the only state in which a pending
  // row is on screen at all. See `frontend/AGENTS.md`.
  await toggle(page).click();
  await page.getByTestId("backlog-capture-action").click();
  await page.getByLabel("Title").fill("Rooftop b-roll cutdown");
  await page.getByTestId("capture-save").click();

  // US1 on one surface: capture, then find it. The create request is never answered, so this can
  // only pass through `lib/items.ts`'s optimistic insert.
  await expect(rows(page)).toHaveText([/Rooftop b-roll cutdown/]);
  // `isPending` marks the row rather than hiding it. **T052's tap-to-open and T054's drag both name
  // an id the server has not issued**, so both must skip these rows rather than render a control
  // that 404s — this attribute is what they read.
  await expect(rows(page).first()).toHaveAttribute("aria-busy", "true");
});

test("a saved idea is no longer marked pending", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, []);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Rooftop b-roll cutdown");
  await page.getByTestId("capture-save").click();

  await toggle(page).click();

  // Reconciliation swapped the optimistic row for the server's. A row that stayed `aria-busy` after
  // saving would leave every id-bearing control at T052 and T054 permanently disabled.
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).not.toHaveAttribute("aria-busy", "true");
});

test("a captured idea survives a reload once the server has it", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  // The second half of US1's Independent Test — "reload, and confirm it is still there" — with the
  // server now returning what it stored.
  await stubApi(page, [item(1, { title: "Rooftop b-roll cutdown" })]);

  await page.goto("/calendar");
  await toggle(page).click();
  await expect(rows(page)).toHaveText(["Rooftop b-roll cutdown"]);

  await page.reload();
  await toggle(page).click();
  await expect(rows(page)).toHaveText(["Rooftop b-roll cutdown"]);
});

test("the page body does not scroll horizontally with the drawer open", async ({
  page,
  baseURL,
}) => {
  await signedIn(page, baseURL);
  await stubApi(page, [
    item(3, { title: "A very long idea title that would happily push a layout sideways if allowed" }),
    item(2),
    item(1),
  ]);

  await page.goto("/calendar");

  // Collapsed first: the peek strip is a horizontal row of chips, which is the likeliest thing in
  // this component to overflow the body at 375px.
  let overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);

  await toggle(page).click();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();

  overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the drawer toggle clears the 44px tap minimum", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, [item(1)]);

  await page.goto("/calendar");

  const box = await toggle(page).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
