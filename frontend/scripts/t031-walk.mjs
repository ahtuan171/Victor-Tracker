/**
 * T031 — hand-walk quickstart.md's V1–V6 against a **production build** and the **real backend**,
 * at the 375x667 floor. `004`'s counterpart of `003`'s `scripts/t056-walk.mjs`, same shape and same
 * reason: every automated frontend test in this repo stubs the proxy, so a green suite is evidence
 * about the frontend in isolation and never about the seam (`.claude/memory.md`, 2026-08-01).
 *
 * **Known, accepted gap carried over from `003`**: Cloudflare R2 is still unprovisioned, so V3
 * scenario 1's "at least one photograph" cannot be walked against real object storage here — it is
 * exercised with a note only, and the photo-grid rendering itself stays covered by the stubbed
 * `photo-upload.spec.ts`/`place-detail.spec.ts` (both already pass real e2e coverage for that half).
 *
 * Every fixture this creates is named with the `T031` prefix and deleted at the end, matched on
 * that prefix — so an aborted run is swept up by the next one.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

/*
 * Usage, from `frontend/`:
 *
 *   docker compose up -d db backend            # from the repo root
 *   pnpm build
 *   API_BASE_URL=http://127.0.0.1:8000 SESSION_COOKIE_SECURE=false pnpm start --port 3400
 *   docker compose exec -T backend uv run python -c \
 *     "from app.auth import create_access_token; print(create_access_token(1)[0])" > /tmp/tok
 *   TOKEN_FILE=/tmp/tok node scripts/t031-walk.mjs
 *
 * `localhost`, not `127.0.0.1` — a standalone Playwright script driving a Next server from
 * `127.0.0.1` silently never hydrates (`frontend/AGENTS.md`). Port 3400 rather than 3100 so this
 * cannot be adopted by, or collide with, a `playwright test` run.
 */
const BASE = process.env.WALK_BASE ?? "http://localhost:3400";
const API = process.env.WALK_API ?? "http://127.0.0.1:8000";
const TOKEN = readFileSync(process.env.TOKEN_FILE, "utf8").trim();
const PREFIX = "T031";

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
}

async function api(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : JSON.parse(text) };
}

async function cleanup() {
  const { body: destinations } = await api("GET", "/destinations");
  for (const d of destinations ?? []) {
    if (d.name.startsWith(PREFIX)) await api("DELETE", `/destinations/${d.id}`);
  }
  const { body: trips } = await api("GET", "/trips");
  for (const t of trips ?? []) {
    if (t.name.startsWith(PREFIX)) await api("DELETE", `/trips/${t.id}`);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
await context.addCookies([{ name: "ch_session", value: TOKEN, url: BASE }]);
const page = await context.newPage();

async function openMap() {
  await page.goto(`${BASE}/map`);
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
}

/**
 * This walk runs against the real dev database, which already carries the owner's own real
 * destinations spanning nearly the whole globe (Vietnam, Iceland, Patagonia, Tokyo…) — so the
 * initial `fitBoundsOnce` camera sits at a near-world zoom regardless of where this script's own
 * fixtures land, and two markers that are genuinely far apart in the real world can still render
 * within a few screen pixels of each other. Scroll-zooming in, centred on the viewport, separates
 * them proportionally without needing to touch or reason about the owner's existing data.
 */
async function zoomInUntilSeparated(pinA, pinB, { minDistance = 60, maxRounds = 8 } = {}) {
  for (let round = 0; round < maxRounds; round++) {
    const [a, b] = await Promise.all([pinA.boundingBox(), pinB.boundingBox()]);
    if (a === null || b === null) throw new Error("zoomInUntilSeparated: a pin left the DOM entirely");
    const bothOnscreen =
      a.x >= 0 && a.x + a.width <= 375 && a.y >= 0 && a.y + a.height <= 667 &&
      b.x >= 0 && b.x + b.width <= 375 && b.y >= 0 && b.y + b.height <= 667;
    if (bothOnscreen && Math.hypot(a.x - b.x, a.y - b.y) > minDistance) return;

    // Zoom centred on the *midpoint* between the two pins, not the viewport centre — MapLibre keeps
    // the point under the cursor fixed while zooming, so both pins move apart from it symmetrically
    // rather than one of them being carried toward, and eventually past, the viewport's edge.
    //
    // The mouse is moved **once per round**, not once per wheel tick: re-issuing `mouse.move`
    // between wheel events interrupts MapLibre's own momentum handling for `scrollZoom`, which
    // made an earlier version of this loop barely zoom at all over many iterations (measured:
    // ~1-6px of movement per tick when the mouse moved every time, versus ~25px+ per round of 10
    // sustained ticks at one fixed position).
    const midX = (a.x + a.width / 2 + b.x + b.width / 2) / 2;
    const midY = (a.y + a.height / 2 + b.y + b.height / 2) / 2;
    await page.mouse.move(midX, midY);
    for (let tick = 0; tick < 10; tick++) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
  }
  throw new Error("zoomInUntilSeparated: pins never separated within maxRounds");
}

function todayIsoRange() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const before = new Date(now);
  before.setDate(before.getDate() - 2);
  const after = new Date(now);
  after.setDate(after.getDate() + 2);
  return { start: iso(before), end: iso(after) };
}

try {
  await cleanup();

  // ============================================================================================
  // V1 — Selecting a pin brings the map to it and marks it selected
  // ============================================================================================
  const v1a = await api("POST", "/destinations", {
    name: `${PREFIX} V1 Alpha`,
    latitude: 48.8566,
    longitude: 2.3522,
    status: "wishlist",
  });
  // ~150m from Alpha, not a different continent: selecting Alpha eases the camera to street-level
  // zoom (MINIMUM_SELECTION_ZOOM=16, MapView.tsx) centred *on Alpha*, so Beta has to still be on
  // screen at that zoom for V1.2's "tap a different pin" to be reachable at all.
  await api("POST", "/destinations", {
    name: `${PREFIX} V1 Beta`,
    latitude: 48.8566,
    longitude: 2.355,
    status: "wishlist",
  });

  await openMap();

  const alphaPin = page.locator(`[data-testid="destination-pin"][aria-label*="${PREFIX} V1 Alpha"]`);
  const betaPin = page.locator(`[data-testid="destination-pin"][aria-label*="${PREFIX} V1 Beta"]`);

  await zoomInUntilSeparated(alphaPin, betaPin);

  await alphaPin.click();
  await page.waitForTimeout(1000);
  const alphaSelected = (await alphaPin.getAttribute("data-selected")) !== null;
  record("V1.1", alphaSelected, `Alpha pin selected=${alphaSelected} after tap`);

  await page.getByTestId("place-confirm-dismiss").click();
  await betaPin.click();
  await page.waitForTimeout(1000);
  const alphaStillSelected = (await alphaPin.getAttribute("data-selected")) !== null;
  const betaSelected = (await betaPin.getAttribute("data-selected")) !== null;
  record(
    "V1.2",
    !alphaStillSelected && betaSelected,
    `after selecting Beta: Alpha selected=${alphaStillSelected}, Beta selected=${betaSelected}`,
  );

  // The canvas *element*'s own box never moves (only what's drawn on it does), so the camera
  // itself has to be read off something that actually reflects the projection — a pin's own
  // position. Alpha's, not Beta's: `DestinationPin.tsx` scales a *selected* pin up 25%
  // (`scale-125`), so Beta's own box changes shape the instant it deselects regardless of whether
  // the camera moved at all — Alpha stays unselected throughout this step, so its box is a clean
  // read of the camera alone. Wait for it to settle first: selecting Beta eased the camera toward
  // it, and 1000ms is not a guaranteed bound on that animation.
  await page.waitForTimeout(1500);
  const alphaBoxBeforeDismiss = await alphaPin.boundingBox();
  await page.getByTestId("place-confirm-dismiss").click();
  await page.waitForTimeout(500);
  const noneSelected = (await page.locator('[data-testid="destination-pin"][data-selected]').count()) === 0;
  const alphaBoxAfterDismiss = await alphaPin.boundingBox();
  const cameraUnchanged =
    alphaBoxBeforeDismiss !== null &&
    alphaBoxAfterDismiss !== null &&
    Math.abs(alphaBoxBeforeDismiss.x - alphaBoxAfterDismiss.x) < 1 &&
    Math.abs(alphaBoxBeforeDismiss.y - alphaBoxAfterDismiss.y) < 1;
  record(
    "V1.3",
    noneSelected && cameraUnchanged,
    `after dismiss: none selected=${noneSelected}, map viewport unchanged=${cameraUnchanged}`,
  );

  // The cluster pair is created *now*, not alongside Alpha/Beta — added earlier, it would have sat
  // close enough to Paris (Alpha) to risk covering it in the DOM at the initial world-zoom camera,
  // exactly the marker-stacking flakiness this section exists to avoid for V1.1/V1.2. A fresh
  // reload also gives it a clean fit-all-bounds camera to zoom in from.
  await api("POST", "/destinations", {
    name: `${PREFIX} V1 Cluster 1`,
    latitude: 51.5074,
    longitude: -0.1278,
    status: "wishlist",
  });
  await api("POST", "/destinations", {
    name: `${PREFIX} V1 Cluster 2`,
    latitude: 51.508,
    longitude: -0.1285,
    status: "wishlist",
  });
  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  const cluster1Pin = page.locator(`[data-testid="destination-pin"][aria-label*="${PREFIX} V1 Cluster 1"]`);
  const cluster2Pin = page.locator(`[data-testid="destination-pin"][aria-label*="${PREFIX} V1 Cluster 2"]`);
  await cluster1Pin.click({ force: true });
  await page.waitForTimeout(1200);
  const box1 = await cluster1Pin.boundingBox();
  const box2 = await cluster2Pin.boundingBox();
  const separated =
    box1 !== null && box2 !== null && Math.hypot(box1.x - box2.x, box1.y - box2.y) > 44;
  record("V1.4", separated, `cluster pins ${separated ? "separated" : "still overlapping"} after tap-to-zoom`);
  await page.screenshot({ path: "t031-v1.png" });
  await page.getByTestId("place-confirm-dismiss").click();

  // ============================================================================================
  // V2 — The confirmation step guards against a mis-tap
  // ============================================================================================
  // Reload to reset the camera back to its initial fit-all-bounds view — V1.4's tap-to-zoom left
  // it centred tight on the London cluster, which would put Alpha off-screen for this section. And
  // re-separate Alpha from Beta, 150m away: back at the fresh fit-all-bounds camera the two are as
  // close together on screen as they were before V1.1 ever zoomed in.
  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await zoomInUntilSeparated(alphaPin, betaPin);

  await alphaPin.click();
  await page.waitForTimeout(500);
  const confirmVisible = await page.getByTestId("place-confirm").isVisible();
  const confirmName = await page.getByTestId("place-confirm-name").innerText();
  const sheetClosedYet = (await page.getByTestId("destination-sheet-close").count()) === 0;
  record(
    "V2.1",
    confirmVisible && confirmName === `${PREFIX} V1 Alpha` && sheetClosedYet,
    `confirm shown="${confirmName}", full detail not open=${sheetClosedYet}`,
  );

  await page.getByTestId("place-confirm-dismiss").click();
  await page.waitForTimeout(300);
  const confirmGone = (await page.getByTestId("place-confirm").count()) === 0;
  const sheetStillClosed = (await page.getByTestId("destination-sheet-close").count()) === 0;
  record("V2.2", confirmGone && sheetStillClosed, "dismissed: confirm gone, no detail opened, nothing changed");

  await alphaPin.click();
  await page.getByTestId("place-confirm-open").click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const openedName = await page.getByTestId("destination-name-input").inputValue();
  record("V2.3", openedName === `${PREFIX} V1 Alpha`, `full detail opened for "${openedName}"`);
  await page.getByTestId("destination-sheet-close").click();
  await page.getByTestId("place-confirm-dismiss").click().catch(() => {});

  const stripCard = page.getByTestId(`destination-card-${v1a.body.id}`);
  await stripCard.scrollIntoViewIfNeeded();
  await stripCard.click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const noConfirmOnStripTap = (await page.getByTestId("place-confirm").count()) === 0;
  const stripSelected = (await alphaPin.getAttribute("data-selected")) !== null;
  record(
    "V2.4",
    noConfirmOnStripTap && stripSelected,
    `strip tap opened detail directly (no confirm)=${noConfirmOnStripTap}, pin still marked selected=${stripSelected}`,
  );
  await page.getByTestId("destination-sheet-close").click();

  // ============================================================================================
  // V3 — A Visited place's detail is its photographs and impressions
  // ============================================================================================
  const v3note = await api("POST", "/destinations", {
    name: `${PREFIX} V3 With Note`,
    latitude: 35.6762,
    longitude: 139.6503,
    status: "visited",
    note: "Real note, real backend, real database round trip.",
  });
  const v3empty = await api("POST", "/destinations", {
    name: `${PREFIX} V3 Empty`,
    latitude: 22.3193,
    longitude: 114.1694,
    status: "visited",
  });

  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.getByTestId(`destination-card-${v3note.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const noteValue = await page.getByTestId("destination-note-input").inputValue();
  const inviteAbsent = (await page.getByTestId("visited-empty-invite").count()) === 0;
  record(
    "V3.1",
    noteValue === "Real note, real backend, real database round trip." && inviteAbsent,
    `note content shown as-is="${noteValue}", no empty-state invite=${inviteAbsent}`,
  );
  await page.getByTestId("destination-sheet-close").click();

  await page.getByTestId(`destination-card-${v3empty.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const inviteVisible = await page.getByTestId("visited-empty-invite").isVisible();
  record("V3.2", inviteVisible, "an empty Visited place invites adding a note/photograph");
  await page.getByTestId("destination-sheet-close").click();

  // ============================================================================================
  // V4 — A Planned place's detail is the trip it belongs to
  // ============================================================================================
  const trip = await api("POST", "/trips", {
    name: `${PREFIX} V4 Trip`,
    start_date: "2026-10-01",
    end_date: "2026-10-14",
    status: "planned",
  });
  const v4main = await api("POST", "/destinations", {
    name: `${PREFIX} V4 Main`,
    latitude: 52.52,
    longitude: 13.405,
    status: "planned",
    trip_id: trip.body.id,
    start_date: "2026-10-03",
    end_date: "2026-10-05",
  });
  const v4sibling = await api("POST", "/destinations", {
    name: `${PREFIX} V4 Sibling`,
    latitude: 50.1109,
    longitude: 8.6821,
    status: "planned",
    trip_id: trip.body.id,
    start_date: "2026-10-06",
    end_date: "2026-10-07",
  });
  const v4noTrip = await api("POST", "/destinations", {
    name: `${PREFIX} V4 No Trip`,
    latitude: 45.4642,
    longitude: 9.19,
    status: "planned",
  });

  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.getByTestId(`destination-card-${v4main.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const ownDates = await page.getByTestId("destination-planned-dates").innerText();
  const tripName = await page.getByTestId("destination-planned-trip-name").innerText();
  const siblingVisible = await page.getByTestId(`destination-planned-sibling-${v4sibling.body.id}`).isVisible();
  record(
    "V4.1",
    ownDates.includes("2026-10-03") && tripName === `${PREFIX} V4 Trip` && siblingVisible,
    `own dates="${ownDates}", trip="${tripName}", sibling shown=${siblingVisible}`,
  );
  await page.getByTestId("destination-sheet-close").click();

  await api("PATCH", `/destinations/${v4main.body.id}`, { start_date: "2026-09-01", end_date: "2026-09-02" });
  await page.getByTestId(`destination-card-${v4main.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const outsideRangeVisible = await page.getByTestId("destination-planned-outside-range").isVisible();
  record("V4.2", outsideRangeVisible, "dates outside the Trip's range: mismatch stated plainly");
  await page.getByTestId("destination-sheet-close").click();

  const { start, end } = todayIsoRange();
  await api("PATCH", `/destinations/${v4main.body.id}`, { start_date: start, end_date: end });
  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const mainPin = page.locator(`[data-testid="destination-pin"][aria-label*="${PREFIX} V4 Main"]`);
  const pinTravelingOverlay = (await mainPin.getAttribute("data-traveling")) === "true";
  await page.getByTestId(`destination-card-${v4main.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  const panelTravelingVisible = await page.getByTestId("destination-planned-traveling").isVisible();
  record(
    "V4.3",
    panelTravelingVisible,
    `panel Currently-Traveling message shown=${panelTravelingVisible} (pin overlay data-traveling=${pinTravelingOverlay})`,
  );
  await page.getByTestId("destination-sheet-close").click();

  await page.getByTestId(`destination-card-${v4noTrip.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  // `destination-sheet-close` is chrome, present before the detail fetch resolves and
  // `PlannedPanel` actually renders — wait for the panel's own content, not just the shell.
  await page.getByTestId("destination-planned-attach-trip").waitFor({ timeout: 15000 });
  const noTripOffer = await page.getByTestId("destination-planned-no-trip").isVisible();
  await page.getByTestId("destination-planned-attach-trip").selectOption(String(trip.body.id));
  await page.waitForTimeout(1000);
  const attachedName = await page.getByTestId("destination-planned-trip-name").innerText();
  record(
    "V4.4",
    noTripOffer && attachedName === `${PREFIX} V4 Trip`,
    `no-trip offer shown=${noTripOffer}, chosen Trip actually attached="${attachedName}"`,
  );
  await page.getByTestId("destination-sheet-close").click();

  // ============================================================================================
  // V5 — A Wishlist place is an honest empty state
  // ============================================================================================
  const v5 = await api("POST", "/destinations", {
    name: `${PREFIX} V5 Wishlist`,
    latitude: -33.8688,
    longitude: 151.2093,
    status: "wishlist",
  });
  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.getByTestId(`destination-card-${v5.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  await page.getByTestId("destination-wishlist-empty").waitFor({ timeout: 15000 });
  const wishlistEmptyVisible = await page.getByTestId("destination-wishlist-empty").isVisible();
  const noBlankDates = (await page.getByTestId("destination-start-date-input").count()) === 0;
  const noPhotoGrid = (await page.getByTestId("destination-photo-attach").count()) === 0;
  record(
    "V5.1",
    wishlistEmptyVisible && noBlankDates && noPhotoGrid,
    `honest empty state shown=${wishlistEmptyVisible}, no blank date fields=${noBlankDates}, no photo grid=${noPhotoGrid}`,
  );
  await page.getByTestId("destination-sheet-close").click();

  // ============================================================================================
  // V6 — The status control asks for what the new status needs, and never blocks a save
  // ============================================================================================
  await page.getByTestId(`destination-card-${v5.body.id}`).click();
  await page.getByTestId("destination-sheet-close").waitFor();
  await page.getByTestId("destination-status-option-planned").click();
  const asksForDates = await page.getByTestId("destination-start-date-input").isVisible();
  const asksForTrip = (await page.getByTestId("destination-planned-no-trip").count()) > 0;
  record("V6.1", asksForDates && asksForTrip, `moving to Planned asks for dates=${asksForDates}, a Trip=${asksForTrip}`);

  await page.getByTestId("destination-status-option-visited").click();
  const asksForNote = await page.getByTestId("destination-note-input").isVisible();
  const asksForPhoto = await page.getByTestId("destination-photo-attach").isVisible();
  record(
    "V6.2",
    asksForNote && asksForPhoto,
    `moving to Visited asks for impressions=${asksForNote}, photographs=${asksForPhoto}`,
  );

  let allDirectionsOk = true;
  for (const status of ["wishlist", "planned", "visited", "wishlist"]) {
    await page.getByTestId(`destination-status-option-${status}`).click();
    const checked = await page.getByTestId(`destination-status-option-${status}`).getAttribute("aria-checked");
    if (checked !== "true") allDirectionsOk = false;
  }
  record("V6.3", allDirectionsOk, "every status direction accepted, none restricted");

  // Leave the newly-asked date field empty, save, confirm it saves and the field stays unset.
  await page.getByTestId("destination-status-option-planned").click();
  await page.getByTestId("destination-save").click();
  await page.waitForTimeout(1500);
  const { body: afterSave } = await api("GET", `/destinations/${v5.body.id}`);
  record(
    "V6.4",
    afterSave.status === "planned" && afterSave.start_date === null && afterSave.end_date === null,
    `status saved as "${afterSave.status}", newly-asked date field stayed unset (start_date=${afterSave.start_date})`,
  );
  await page.getByTestId("destination-sheet-close").click();
  await page.screenshot({ path: "t031-v6.png" });

  // ============================================================================================
} catch (error) {
  record("FATAL", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);
if (failed.length > 0) {
  console.log("Failed:", failed.map((f) => f.id).join(", "));
  process.exit(1);
}
