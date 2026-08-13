import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Sound feedback (T041, FR-020–FR-023a, SC-009, SC-015), at the 375x667 floor.
 *
 * Playwright cannot hear anything (research.md R-004), so every test here stubs `AudioContext` in
 * the page — before any application script runs, via `addInitScript` — and counts
 * `createOscillator()` calls rather than asserting audio. That asserts the real module's real
 * decisions right up to the browser boundary: if `lib/sound.ts` ever called `createOscillator` twice
 * for one cue, or once for a navigation that FR-023a forbids sound on, this file is what would catch
 * it. The proxy is stubbed, as in every other file here — CI runs the production bundle with no
 * FastAPI behind it.
 */

const SESSION_COOKIE = "ch_session";
const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);

test.use({ timezoneId: "Asia/Bangkok" });

interface Row {
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

function aRow(overrides: Partial<Row> = {}): Row {
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
 * A tiny in-memory content-items API — the `pipeline.spec.ts` shape, needed here for the same
 * reason: the move (drag) and delete cues both need a row that actually leaves, moves or is removed,
 * not a canned response every request repeats.
 */
async function stubContentItems(page: Page, initial: Row[] = [aRow()]): Promise<void> {
  const rows = [...initial];
  let nextId = 100;

  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const method = request.method();

    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      return;
    }

    if (method === "POST") {
      const body = request.postDataJSON() as Partial<Row>;
      const row: Row = {
        id: nextId++,
        title: body.title!,
        hook: body.hook ?? null,
        platform: body.platform ?? null,
        scheduled_date: body.scheduled_date ?? null,
        status: body.status ?? "idea",
        published_url: body.published_url ?? null,
        created_at: "2026-08-04T09:00:00Z",
        updated_at: "2026-08-04T09:00:00Z",
      };
      rows.unshift(row);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }

    const id = Number(new URL(request.url()).pathname.split("/").pop());
    const row = rows.find((each) => each.id === id);

    if (method === "DELETE") {
      if (row !== undefined) rows.splice(rows.indexOf(row), 1);
      await route.fulfill({ status: row === undefined ? 404 : 204, ...(row === undefined ? { contentType: "application/json", body: JSON.stringify({ detail: "not found" }) } : {}) });
      return;
    }

    // PATCH
    if (row === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Content item not found." }),
      });
      return;
    }
    Object.assign(row, request.postDataJSON() as Partial<Row>);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
  };

  await page.route("**/api/content-items", handle);
  await page.route("**/api/content-items/*", handle);
}

/**
 * Stub `AudioContext` before any page script runs, and expose a counter the test can poll.
 * `createOscillator` is the call `lib/sound.ts` makes exactly once per `playCue` — see that file's
 * own "one oscillator per cue" note — so counting it is counting cues.
 */
async function stubAudioContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __oscillatorCalls: number }).__oscillatorCalls = 0;

    class StubOscillator {
      type = "square";
      frequency = { setValueAtTime() {}, linearRampToValueAtTime() {} };
      connect() {}
      start() {}
      stop() {}
    }

    class StubGain {
      gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      connect() {}
    }

    class StubAudioContext {
      state = "running";
      currentTime = 0;
      createOscillator() {
        (window as unknown as { __oscillatorCalls: number }).__oscillatorCalls += 1;
        return new StubOscillator();
      }
      createGain() {
        return new StubGain();
      }
      resume() {
        return Promise.resolve();
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test-only global stub
    (window as any).AudioContext = StubAudioContext;
  });
}

async function oscillatorCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __oscillatorCalls?: number }).__oscillatorCalls ?? 0);
}

async function openCalendar(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();
}

async function turnSoundOn(page: Page): Promise<void> {
  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("sound-option-on").click();
  await page.getByTestId("nav-drawer-close").click();
}

test("a fresh account, sound never turned on, produces zero sound across a full pass (SC-009)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await stubContentItems(page, []);
  await openCalendar(page, baseURL);

  // Capture — the one data-changing action reachable with no items yet.
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Rooftop b-roll cutdown");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  // Open, edit and save it.
  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await chip.click();
  await page.getByTestId("platform-option-tiktok").click();
  await page.getByTestId("item-save").click();
  await expect(page.getByTestId("item-save")).toBeHidden();

  // Delete it.
  const chip2 = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  await chip2.click();
  await page.getByTestId("item-delete").click();
  await page.getByTestId("delete-confirm-action").click();
  await expect(page.getByTestId("delete-confirm")).toBeHidden();

  // Sign-out is reachable from the drawer, which this pass also opens and closes.
  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
  await page.getByTestId("nav-drawer-close").click();

  expect(await oscillatorCalls(page)).toBe(0);
});

test("with sound on, capturing an idea produces exactly one cue", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubContentItems(page, []);
  await openCalendar(page, baseURL);
  await turnSoundOn(page);

  expect(await oscillatorCalls(page)).toBe(0);

  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Rooftop b-roll cutdown");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  expect(await oscillatorCalls(page)).toBe(1);
});

test("with sound on, saving an edit produces exactly one cue", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubContentItems(page, [aRow()]);
  await openCalendar(page, baseURL);
  await turnSoundOn(page);

  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  await expect(page.getByTestId("item-save")).toBeVisible();
  const before = await oscillatorCalls(page);

  await page.getByTestId("platform-option-tiktok").click();
  await page.getByTestId("item-save").click();
  await expect(page.getByTestId("item-save")).toBeHidden();

  expect(await oscillatorCalls(page)).toBe(before + 1);
});

test("with sound on, deleting an item produces exactly one cue", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubContentItems(page, [aRow()]);
  await openCalendar(page, baseURL);
  await turnSoundOn(page);

  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  await page.getByTestId("item-delete").click();
  const before = await oscillatorCalls(page);

  await page.getByTestId("delete-confirm-action").click();
  await expect(page.getByTestId("delete-confirm")).toBeHidden();

  expect(await oscillatorCalls(page)).toBe(before + 1);
});

test("with sound on, dragging an item onto a day produces exactly one cue (move)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await stubContentItems(page, [aRow()]);
  await openCalendar(page, baseURL);
  await expect(page.getByTestId("month-grid")).toBeVisible();
  await turnSoundOn(page);

  const chip = page.getByTestId("backlog-peek-list").getByTestId("item-chip").first();
  const day = page.locator('[data-date="2026-08-12"]');
  const before = await oscillatorCalls(page);

  // The same deliberate 8px+ pointer drag `drag-schedule.spec.ts` uses.
  const source = (await chip.boundingBox())!;
  const target = (await day.boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(day.getByTestId("item-chip")).toHaveCount(1);
  expect(await oscillatorCalls(page)).toBe(before + 1);
});

test("with sound on, a refusal produces a cue distinguishable from a success (FR-023a)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/content-items", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([aRow()]) });
  });
  await page.route("**/api/content-items/*", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "platform_required",
        detail: "Pick a platform before moving this item out of ideas.",
      }),
    });
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();
  await turnSoundOn(page);

  await page.getByTestId("backlog-peek-list").getByTestId("item-chip").first().click();
  const before = await oscillatorCalls(page);

  await page.getByTestId("status-option-draft").click();
  await page.getByTestId("item-save").click();
  await expect(page.getByTestId("item-sheet-message")).toHaveText(/Pick a platform/);

  // Exactly one cue for the refusal — not zero (FR-023a promises a sound here too) and not two (a
  // stray success cue alongside it would make the two indistinguishable in count, even before pitch).
  expect(await oscillatorCalls(page)).toBe(before + 1);
});

test("with sound on, navigation alone produces zero sound (FR-023a, SC-015)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await stubContentItems(page, [aRow({ scheduled_date: "2026-08-12" })]);
  await openCalendar(page, baseURL);
  await turnSoundOn(page);

  const before = await oscillatorCalls(page);

  // Period arrows.
  await page.getByTestId("period-next").click();
  await page.getByTestId("period-previous").click();
  // Month/week toggle.
  await page.getByTestId("view-week").click();
  await page.getByTestId("view-month").click();
  // Platform filter.
  await page.getByTestId("platform-filter-tiktok").click();
  await page.getByTestId("platform-filter-all").click();
  // Open and close the backlog drawer.
  await page.getByTestId("backlog-toggle").click();
  await expect(page.getByTestId("backlog-expanded")).toBeVisible();
  await page.getByRole("button", { name: /close drawer/i }).click();
  await expect(page.getByTestId("backlog-expanded")).toBeHidden();
  // Open and close the nav drawer itself.
  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("nav-drawer-close").click();

  expect(await oscillatorCalls(page)).toBe(before);
});

test("turning sound off is immediate, and stays silent afterwards", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubContentItems(page, []);
  await openCalendar(page, baseURL);
  await turnSoundOn(page);

  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("First idea");
  await page.getByTestId("capture-save").click();
  expect(await oscillatorCalls(page)).toBe(1);

  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("sound-option-off").click();
  await page.getByTestId("nav-drawer-close").click();

  const before = await oscillatorCalls(page);
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Second idea");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("calendar-counts")).toHaveText("2 items");

  expect(await oscillatorCalls(page)).toBe(before);
});

test("the sound control reflects the account's own choice once it has loaded (FR-022)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await stubContentItems(page, []);
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  // The account already has sound on, from another device — `CalendarShell`'s mount-time
  // reconciliation is what is under test here, not the toggle itself.
  await page.route("**/api/preferences", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ theme: "dark", sound_enabled: true }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();

  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("sound-option-on")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("nav-drawer-close").click();

  // Reconciled, so a cue-worthy action now produces sound with no tap on the control at all.
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("Idea from a device that already had sound on");
  await page.getByTestId("capture-save").click();
  await expect(page.getByTestId("calendar-counts")).toHaveText("1 item");

  expect(await oscillatorCalls(page)).toBe(1);
});
