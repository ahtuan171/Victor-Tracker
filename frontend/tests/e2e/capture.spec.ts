import { expect, test, type Page } from "@playwright/test";

/**
 * Capturing an idea (T034, FR-005, FR-022, SC-001, US1), at the 375x667 floor.
 *
 * This is the flow the whole of User Story 1 exists for: *capture an idea with only a title, in
 * under 15 seconds, and find it later*. The proxy is stubbed for the reason `login.spec.ts` and
 * `calendar.spec.ts` stub it — CI runs the production bundle with no FastAPI behind it — so what is
 * asserted here is the *page*: how many interactions it costs, what it sends, and what it does when
 * the server says no. The endpoint is covered by `backend/tests/test_content_items.py`, and the seam
 * between them is what quickstart V2 walks by hand.
 */

const SESSION_COOKIE = "ch_session";

async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

/**
 * Stub the two content-item calls: an empty list, and a create that records what was sent.
 *
 * `createStatus` lets a test make the save fail without touching anything else, which is the branch
 * that decides whether a creator loses their typing.
 */
async function stubApi(
  page: Page,
  { createStatus = 201, createBody }: { createStatus?: number; createBody?: unknown } = {},
): Promise<{ readonly created: unknown[] }> {
  const created: unknown[] = [];

  await page.route("**/api/content-items*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    created.push(route.request().postDataJSON());
    await route.fulfill({
      status: createStatus,
      contentType: "application/json",
      body: JSON.stringify(
        createBody ?? {
          id: 1,
          title: "Rooftop b-roll cutdown",
          hook: null,
          platform: null,
          scheduled_date: null,
          status: "idea",
          published_url: null,
          created_at: "2026-08-01T09:00:00Z",
          updated_at: "2026-08-01T09:00:00Z",
        },
      ),
    });
  });

  return { created };
}

const titleField = (page: Page) => page.getByLabel("Title");
const saveButton = (page: Page) => page.getByTestId("capture-save");

test("capturing an idea costs three interactions from the landing screen", async ({
  page,
  baseURL,
}) => {
  await signedIn(page, baseURL);
  const stub = await stubApi(page);

  await page.goto("/calendar");

  // 1. Tap capture. 2. Type. 3. Tap save. That is the whole of SC-001's budget, and this test is
  // what stops a fourth arriving one reasonable-sounding change at a time — a confirmation step, a
  // platform picker, a second screen.
  await page.getByTestId("capture-action").click();
  await titleField(page).fill("Rooftop b-roll cutdown");
  await saveButton(page).click();

  expect(stub.created).toEqual([{ title: "Rooftop b-roll cutdown" }]);
});

test("the field is focused on open, so typing needs no extra tap", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();

  // Without this the count above is four, not three — and on a phone it is also the difference
  // between the keyboard appearing and the creator hunting for the field.
  await expect(titleField(page)).toBeFocused();
});

test("only a title is sent — the sheet has no other field to fill", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const stub = await stubApi(page);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();
  await titleField(page).fill("Rooftop b-roll cutdown");
  await saveButton(page).click();
  await expect(saveButton(page)).toBeHidden();

  // FR-005 and `.claude/memory.md`: any required field beyond the title is enough friction to send
  // the creator back to a notes app. Asserted on the request rather than by counting inputs, because
  // a field that defaulted to something and sent it would still be a decision made here rather than
  // at T052's item sheet.
  expect(stub.created).toEqual([{ title: "Rooftop b-roll cutdown" }]);
});

test("the captured idea appears immediately, without waiting for the server", async ({
  page,
  baseURL,
}) => {
  await signedIn(page, baseURL);
  const created: unknown[] = [];

  await page.route("**/api/content-items*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    created.push(route.request().postDataJSON());
    // Never fulfilled. R-007's optimistic update means the item is on screen before this would have
    // returned — with a real answer the assertion could not tell optimism from a fast round trip.
  });

  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-counts")).toHaveText("0 items");

  await page.getByTestId("capture-action").click();
  await titleField(page).fill("Rooftop b-roll cutdown");
  await saveButton(page).click();

  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");
  expect(created).toHaveLength(1);
});

test("a blank title cannot be submitted", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const stub = await stubApi(page);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();

  await expect(saveButton(page)).toBeDisabled();

  // INV-2 is a whitespace check, not an emptiness check — the backend refuses a tab with a 422, and
  // stopping it here means the creator gets the answer without a round trip.
  await titleField(page).fill("   ");
  await expect(saveButton(page)).toBeDisabled();

  await titleField(page).fill("Real idea");
  await expect(saveButton(page)).toBeEnabled();

  expect(stub.created).toEqual([]);
});

test("a refused save keeps the sheet open with the typing intact", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, { createStatus: 502, createBody: { detail: "The API could not be reached." } });

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();
  await titleField(page).fill("Rooftop b-roll cutdown");
  await saveButton(page).click();

  // The whole reason `lib/items.ts` rethrows write failures instead of folding them into the list's
  // error state. Losing the row *and* the typing is the worst outcome of a failed save, and it is
  // exactly what closing the sheet optimistically would produce.
  await expect(page.getByText("The API could not be reached.")).toBeVisible();
  await expect(titleField(page)).toHaveValue("Rooftop b-roll cutdown");
});

test("a refused save rolls the optimistic item back off the surface", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page, { createStatus: 502, createBody: { detail: "The API could not be reached." } });

  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-counts")).toHaveText("0 items");

  await page.getByTestId("capture-action").click();
  await titleField(page).fill("Rooftop b-roll cutdown");
  await saveButton(page).click();

  // An optimistic row that survives its own rejection is worse than no optimism at all: the creator
  // is shown an item that does not exist and will not be there tomorrow.
  await expect(page.getByText("The API could not be reached.")).toBeVisible();
  await expect(page.getByTestId("calendar-counts")).toHaveText("0 items");
});

test("cancelling closes the sheet and captures nothing", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const stub = await stubApi(page);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();
  await titleField(page).fill("Rooftop b-roll cutdown");
  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(saveButton(page)).toBeHidden();
  expect(stub.created).toEqual([]);
});

test("the sheet sits at the bottom of the screen, in thumb reach", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();

  const save = await saveButton(page).boundingBox();
  const field = await titleField(page).boundingBox();
  const viewport = page.viewportSize();

  // design.md: primary actions in the bottom half, and 44px minimum tap targets on a product with a
  // 375px floor. Both are structural, so both get an assertion rather than a code review.
  expect(save!.y).toBeGreaterThan(viewport!.height / 2);
  expect(save!.height).toBeGreaterThanOrEqual(44);
  expect(field!.height).toBeGreaterThanOrEqual(44);
});

test("opening the sheet does not make the page scroll sideways", async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  await stubApi(page);

  await page.goto("/calendar");
  await page.getByTestId("capture-action").click();
  await expect(titleField(page)).toBeFocused();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
