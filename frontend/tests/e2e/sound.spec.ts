import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Sound feedback (T041, FR-020–FR-023a, SC-009, SC-015), at the 375x667 floor.
 *
 * Playwright cannot hear anything (research.md R-004), so every test here stubs `AudioContext` in
 * the page — before any application script runs, via `addInitScript` — and counts **cues** rather
 * than asserting audio. A cue is every oscillator one `playCue` call creates (they are created
 * synchronously, so one microtask batch is one cue), classified by waveform: `triangle` is a UI
 * cue (navigation, opening/closing a panel, selecting), anything else is a data cue (`success`,
 * `save`, `delete`, `refuse`). That asserts the real module's real decisions right up to the browser
 * boundary: if a data-changing action played two cues, or a navigation played a data cue, this file
 * is what would catch it. FR-023a as amended (2026-09-23) allows quiet UI cues, so "silent" is
 * asserted for **data** cues on navigation, and for **everything** only while sound is off. The proxy is stubbed, as in every other file here — CI runs the production bundle with no
 * FastAPI behind it.
 *
 * **Rewritten 2026-08-22** against `/map` (`QuickAdd`, `DestinationSheet`) — Content Calendar
 * (`/calendar`, the original stage for every scenario here) was removed entirely, the owner's
 * instruction. `SoundCue`'s `"capture"` and `"move"` members were content-item-only (a captured
 * idea, a drag onto a day) and have **no equivalent on the map** — nothing calls `playCue("capture")`
 * or `playCue("move")` anymore, so the two scenarios that exercised them are gone rather than
 * rewritten, and `lib/sound.ts` itself is untouched (that type is a design decision beyond this
 * session's scope — see `CLAUDE.local.md`). Every other scenario has a real map-surface equivalent:
 * creating a Destination via `QuickAdd` and saving/deleting one in `DestinationSheet` all call
 * `playCue("save")`/`playCue("delete")`/`playCue("refuse")` exactly where the old capture/edit/
 * delete scenarios did.
 */

const SESSION_COOKIE = "ch_session";
const NOW = Date.UTC(2026, 7, 4, 9, 0, 0);

test.use({ timezoneId: "Asia/Bangkok" });

interface StubDestination {
  id: number;
  trip_id: number | null;
  name: string;
  latitude: number;
  longitude: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  category: string | null;
  note: string | null;
  photographs: unknown[];
  created_at: string;
  updated_at: string;
  outside_trip_range: boolean;
}

function aDestination(overrides: Partial<StubDestination> = {}): StubDestination {
  return {
    id: 1,
    trip_id: null,
    name: "Porto",
    latitude: 41.1579,
    longitude: -8.6291,
    start_date: null,
    end_date: null,
    status: "wishlist",
    note: null,
    photographs: [],
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    category: null,
    outside_trip_range: false,
    ...overrides,
  };
}

/**
 * A tiny in-memory destinations API — the `trip-organise.spec.ts`/`pipeline.spec.ts` shape, needed
 * here for the same reason: the create, save and delete cues each need a row that actually
 * appears, changes or is removed, not a canned response every request repeats.
 */
async function stubDestinations(page: Page, initial: StubDestination[] = []): Promise<void> {
  const rows = [...initial];
  let nextId = initial.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  await page.route("**/api/destinations", async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      return;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Partial<StubDestination>;
      const row = aDestination({ ...body, id: nextId++ });
      rows.push(row);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    await route.fallback();
  });

  await page.route(/\/api\/destinations\/\d+$/, async (route: Route) => {
    const request = route.request();
    const id = Number(new URL(request.url()).pathname.split("/").pop());
    const row = rows.find((each) => each.id === id);

    if (request.method() === "GET") {
      if (row === undefined) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not found" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    if (request.method() === "PATCH") {
      if (row === undefined) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not found" }) });
        return;
      }
      Object.assign(row, request.postDataJSON() as Partial<StubDestination>);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
      return;
    }
    if (request.method() === "DELETE") {
      const index = rows.findIndex((each) => each.id === id);
      if (index === -1) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not found" }) });
        return;
      }
      rows.splice(index, 1);
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/trips", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/locations/search*", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ name: "Kyoto", address: "Kyoto, Japan", latitude: 35.0116, longitude: 135.7681 }]),
    });
  });
}

/**
 * Stub `AudioContext` before any page script runs, and expose two counters the test can poll: data
 * cues and UI cues. `lib/sound.ts` creates a cue's oscillators synchronously inside one `playCue`
 * call and sets each one's waveform straight after creating it, so the first waveform set in a
 * microtask batch classifies — and counts — the whole cue.
 */
async function stubAudioContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counters = window as unknown as { __dataCues: number; __uiCues: number; __cueOpen: boolean };
    counters.__dataCues = 0;
    counters.__uiCues = 0;
    counters.__cueOpen = false;

    class StubOscillator {
      frequency = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
      set type(waveform: string) {
        if (counters.__cueOpen) return;
        counters.__cueOpen = true;
        queueMicrotask(() => {
          counters.__cueOpen = false;
        });
        if (waveform === "triangle") counters.__uiCues += 1;
        else counters.__dataCues += 1;
      }
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
      destination = {};
      createOscillator() {
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

/** Cues that accompany a change to stored information, or a refusal of one. */
async function dataCues(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __dataCues?: number }).__dataCues ?? 0);
}

/** Quiet cues for navigating, selecting and opening or closing a panel. */
async function uiCues(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __uiCues?: number }).__uiCues ?? 0);
}

async function openMap(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
}

/** Creates a Destination through `QuickAdd`'s three-interaction flow (search, select, status). */
async function createViaQuickAdd(page: Page): Promise<void> {
  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-add").first().click();
  await page.getByTestId("quick-add-status-wishlist").click();
}

/** Opens the one Destination the stub was seeded with, through the pin and its confirmation. */
async function openExistingDestination(page: Page): Promise<void> {
  await page.getByTestId("destination-pin").click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();
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
  await stubDestinations(page, []);
  await openMap(page, baseURL);

  // Create — the one data-changing action reachable with no places yet.
  await createViaQuickAdd(page);
  await expect(page.getByTestId("destination-pin")).toHaveCount(1);

  // Open, edit and save it.
  await openExistingDestination(page);
  await page.getByTestId("destination-name-input").fill("Porto (renamed)");
  await page.getByTestId("destination-save").click();
  await expect(page.getByTestId("destination-name-input")).toHaveValue("Porto (renamed)");

  // Delete it.
  await page.getByTestId("destination-delete").click();
  await page.getByTestId("destination-delete-confirm-action").click();
  await expect(page.getByTestId("destination-sheet-close")).toBeHidden();

  // Sign-out is reachable from the drawer, which this pass also opens and closes.
  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("nav-drawer-panel")).toBeVisible();
  await page.getByTestId("nav-drawer-close").click();

  expect(await dataCues(page)).toBe(0);
  expect(await uiCues(page)).toBe(0);
});

test("with sound on, creating a Destination produces exactly one cue", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubDestinations(page, []);
  await openMap(page, baseURL);
  await turnSoundOn(page);

  // Turning sound on answers with one cue of its own, so the toggle proves itself; count from there.
  const before = await dataCues(page);
  expect(before).toBe(1);

  await createViaQuickAdd(page);
  await expect(page.getByTestId("destination-pin")).toHaveCount(1);

  expect(await dataCues(page)).toBe(before + 1);
});

test("with sound on, saving an edit produces exactly one cue", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubDestinations(page, [aDestination()]);
  await openMap(page, baseURL);
  await turnSoundOn(page);

  await openExistingDestination(page);
  const before = await dataCues(page);

  await page.getByTestId("destination-name-input").fill("Porto (renamed)");
  await page.getByTestId("destination-save").click();
  await expect(page.getByTestId("destination-name-input")).toHaveValue("Porto (renamed)");

  expect(await dataCues(page)).toBe(before + 1);
});

test("with sound on, deleting a Destination produces exactly one cue", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubDestinations(page, [aDestination()]);
  await openMap(page, baseURL);
  await turnSoundOn(page);

  await openExistingDestination(page);
  await page.getByTestId("destination-delete").click();
  const before = await dataCues(page);

  await page.getByTestId("destination-delete-confirm-action").click();
  await expect(page.getByTestId("destination-sheet-close")).toBeHidden();

  expect(await dataCues(page)).toBe(before + 1);
});

test("with sound on, a refusal produces a cue distinguishable from a success (FR-023a)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  await page.route("**/api/destinations", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([aDestination()]) });
  });
  await page.route(/\/api\/destinations\/\d+$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(aDestination()) });
      return;
    }
    if (request.method() === "PATCH") {
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "Request failed validation." }) });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/trips", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.clock.setFixedTime(NOW);
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();
  await turnSoundOn(page);

  await openExistingDestination(page);
  const before = await dataCues(page);

  await page.getByTestId("destination-name-input").fill("");
  await page.getByTestId("destination-save").click();
  await expect(page.getByRole("alert")).toBeVisible();

  // Exactly one cue for the refusal — not zero (FR-023a promises a sound here too) and not two (a
  // stray success cue alongside it would make the two indistinguishable in count, even before pitch).
  expect(await dataCues(page)).toBe(before + 1);
});

test("with sound on, navigation alone produces no data cue (FR-023a, SC-015)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await stubDestinations(page, [aDestination()]);
  await openMap(page, baseURL);
  await turnSoundOn(page);

  const before = await dataCues(page);

  // Status filter.
  await page.getByTestId("status-filter-visited").click();
  await page.getByTestId("status-filter-all").click();
  // Open and close the Trip panel.
  await page.getByTestId("open-trips").click();
  await page.getByTestId("trip-panel-close").click();
  // Open and close a Destination, with no edit.
  await openExistingDestination(page);
  await page.getByTestId("destination-sheet-close").click();
  // Open and close the nav drawer itself.
  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("nav-drawer-close").click();

  // FR-023a as amended: navigation may answer with a quiet UI cue, but never with the cue that
  // means "stored information changed" — that distinction is what the sound is for.
  expect(await dataCues(page)).toBe(before);
});

test("turning sound off is immediate, and stays silent afterwards", async ({ page, baseURL }) => {
  await stubAudioContext(page);
  await stubDestinations(page, []);
  await openMap(page, baseURL);
  await turnSoundOn(page);

  const created = await dataCues(page);
  await createViaQuickAdd(page);
  await expect(page.getByTestId("destination-pin")).toHaveCount(1);
  expect(await dataCues(page)).toBe(created + 1);

  await page.getByTestId("nav-drawer-trigger").click();
  await page.getByTestId("sound-option-off").click();
  await page.getByTestId("nav-drawer-close").click();

  // Off is immediate for every kind of cue, UI ones included.
  const data = await dataCues(page);
  const ui = await uiCues(page);
  await page.getByTestId("open-trips").click();
  await page.getByTestId("trip-panel-close").click();
  await createViaQuickAdd(page);
  await expect(page.getByTestId("destination-pin")).toHaveCount(2);

  expect(await dataCues(page)).toBe(data);
  expect(await uiCues(page)).toBe(ui);
});

test("the sound control reflects the account's own choice once it has loaded (FR-022)", async ({
  page,
  baseURL,
}) => {
  await stubAudioContext(page);
  await stubDestinations(page, []);
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
  // The account already has sound on, from another device — the map shell's mount-time
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
  await page.goto("/map");
  await page.getByTestId("map-canvas").waitFor();

  await page.getByTestId("nav-drawer-trigger").click();
  await expect(page.getByTestId("sound-option-on")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("nav-drawer-close").click();

  // Reconciled, so a cue-worthy action now produces sound with no tap on the control at all.
  await createViaQuickAdd(page);
  await expect(page.getByTestId("destination-pin")).toHaveCount(1);

  expect(await dataCues(page)).toBe(1);
});
