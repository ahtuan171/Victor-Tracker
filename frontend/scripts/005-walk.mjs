/**
 * Hand-walk `specs/005-travel-log/quickstart.md`'s V1–V4 against a **production build** and the
 * **real backend**, at the 375x667 floor — `005`'s counterpart of `004`'s `scripts/t031-walk.mjs`
 * and `003`'s `scripts/t056-walk.mjs`, same shape and same reason: every automated frontend test in
 * this repo stubs the proxy, so a green suite is evidence about the frontend in isolation and never
 * about the seam (`.claude/memory.md`, 2026-08-01).
 *
 * Named `005-walk.mjs` rather than `tNNN-walk.mjs` on purpose: `005-travel-log`'s own `tasks.md`
 * never had a hand-walk task at all (T011–T013's Final Phase is a viewport-audit extension, a
 * lint/typecheck run, and `/speckit-analyze` — no walk task), which is exactly the gap
 * `docs/retro-05.md` records. There is no task number to name this after; run 2026-08-21, two days
 * after the iteration merged.
 *
 * Every fixture this creates is named with the `IT005` prefix and deleted at the end, matched on
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
 *   TOKEN_FILE=/tmp/tok node scripts/005-walk.mjs
 *
 * `localhost`, not `127.0.0.1` — a standalone Playwright script driving a Next server from
 * `127.0.0.1` silently never hydrates (`frontend/AGENTS.md`). Port 3400 rather than 3100 so this
 * cannot be adopted by, or collide with, a `playwright test` run.
 */
const BASE = process.env.WALK_BASE ?? "http://localhost:3400";
const API = process.env.WALK_API ?? "http://127.0.0.1:8000";
const TOKEN = readFileSync(process.env.TOKEN_FILE, "utf8").trim();
const PREFIX = "IT005";

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  const label = ok === null ? "SKIP" : ok ? "PASS" : "FAIL";
  console.log(`${label}  ${id}  ${detail}`);
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
  await page.waitForTimeout(1500);
}

async function openLog() {
  await page.getByTestId("open-travel-log").click();
  await page.getByTestId("travel-log-drawer").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
}

try {
  await cleanup();

  // Real dev-DB destination counts by status, read **before** this run's own fixtures exist —
  // needed for V4 below, which needs a status with zero real matches to walk an honest empty
  // state without touching the owner's own data (`.claude/memory.md`'s standing note that the
  // dev DB carries real Destinations; never delete anything outside the `IT005` prefix).
  const { body: preExisting } = await api("GET", "/destinations");
  const realCountByStatus = { visited: 0, planned: 0, wishlist: 0 };
  for (const d of preExisting ?? []) {
    if (!d.name.startsWith(PREFIX) && d.status in realCountByStatus) realCountByStatus[d.status]++;
  }

  // ============================================================================================
  // V1 — Reverse-chronological timeline display
  // ============================================================================================
  // Three dated Destinations, deliberately created out of chronological order, plus one
  // undated Wishlist place — so V1 actually exercises the sort rather than the creation order
  // happening to agree with it.
  const trip = await api("POST", "/trips", {
    name: `${PREFIX} V1 Trip`,
    start_date: "2026-11-01",
    end_date: "2026-11-10",
    status: "planned",
  });
  const oldest = await api("POST", "/destinations", {
    name: `${PREFIX} V1 Oldest`,
    latitude: 48.8566,
    longitude: 2.3522,
    status: "visited",
    start_date: "2025-01-05",
    end_date: "2025-01-10",
  });
  const newest = await api("POST", "/destinations", {
    name: `${PREFIX} V1 Newest`,
    latitude: 41.9028,
    longitude: 12.4964,
    status: "planned",
    trip_id: trip.body.id,
    start_date: "2026-11-03",
    end_date: "2026-11-05",
  });
  const middle = await api("POST", "/destinations", {
    name: `${PREFIX} V1 Middle`,
    latitude: 52.52,
    longitude: 13.405,
    status: "visited",
    start_date: "2025-06-15",
  });
  const undated = await api("POST", "/destinations", {
    name: `${PREFIX} V1 Undated Wishlist`,
    latitude: -33.8688,
    longitude: 151.2093,
    status: "wishlist",
  });

  await openMap();
  await openLog();

  const cardIds = await page.getByTestId("travel-log-list").locator('[data-testid^="travel-log-card-"]').evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute("data-testid")),
  );
  const posOf = (id) => cardIds.indexOf(`travel-log-card-${id}`);
  const order = [posOf(newest.body.id), posOf(middle.body.id), posOf(oldest.body.id)];
  const datedInOrder = order[0] < order[1] && order[1] < order[2];
  record(
    "V1.1",
    datedInOrder,
    `dated entries in reverse-chronological order (Newest→Middle→Oldest): positions=${JSON.stringify(order)}`,
  );

  const dateText = await page.getByTestId(`log-date-${newest.body.id}`).innerText();
  const nameText = await page.getByTestId(`log-name-${newest.body.id}`).innerText();
  const tripText = await page.getByTestId(`log-trip-${newest.body.id}`).innerText();
  const cueText = await page.getByTestId(`log-status-cue-${newest.body.id}`).innerText();
  record(
    "V1.2",
    dateText.includes("2026-11-03") && nameText === `${PREFIX} V1 Newest`,
    `entry shows name="${nameText}", date range="${dateText}"`,
  );
  record("V1.3 (status cue)", cueText.length > 0, `status cue text="${cueText}" (shape/label, not colour alone)`);
  record("V1.3 (trip name)", tripText.includes(`${PREFIX} V1 Trip`), `trip context shown="${tripText}"`);

  // `compareLogOrder` (lib/log.ts) compares `start_date` (a bare YYYY-MM-DD) against `created_at`
  // (a full ISO timestamp) as plain strings when one side is undated. That comparison is NOT
  // "undated always sorts last" — a YYYY-MM-DD string sorts *after* any full timestamp that starts
  // with an earlier year-month, and *before* one that starts with a later one. So relative to this
  // run's own fixtures, undated (created_at ≈ today) belongs strictly between Newest
  // (start_date 2026-11-03, a later month) and Middle/Oldest (start_date in 2025, an earlier year)
  // — never claim "last overall", which is also false the moment real, unrelated dev data exists
  // at other dates (`.claude/memory.md`'s standing note that the dev DB carries the owner's own
  // real Destinations).
  const undatedPos = posOf(undated.body.id);
  const undatedBetween = undatedPos > posOf(newest.body.id) && undatedPos < posOf(middle.body.id);
  record(
    "V1 edge case (no start_date)",
    undatedBetween,
    `undated entry (position ${undatedPos}) sorts after Newest (${posOf(newest.body.id)}, later start_date) and before Middle (${posOf(middle.body.id)}, earlier start_date) — falls back to created_at DESC as documented`,
  );

  // ============================================================================================
  // V2 — Status filtering
  // ============================================================================================
  await page.getByTestId("log-filter-visited").click();
  await page.waitForTimeout(300);
  const visitedOnly = await page.getByTestId("travel-log-list").locator('[data-testid^="travel-log-card-"]').count();
  const visitedNamesVisible =
    (await page.getByTestId(`travel-log-card-${oldest.body.id}`).count()) === 1 &&
    (await page.getByTestId(`travel-log-card-${middle.body.id}`).count()) === 1 &&
    (await page.getByTestId(`travel-log-card-${newest.body.id}`).count()) === 0;
  record(
    "V2.1",
    visitedNamesVisible,
    `"Visited" filter shows only Visited entries (${visitedOnly} cards): Oldest+Middle present, Newest (planned) absent`,
  );

  await page.getByTestId("log-filter-planned").click();
  await page.waitForTimeout(300);
  const plannedOnly =
    (await page.getByTestId(`travel-log-card-${newest.body.id}`).count()) === 1 &&
    (await page.getByTestId(`travel-log-card-${oldest.body.id}`).count()) === 0;
  record("V2.2", plannedOnly, `"Planned" filter shows only Planned entries`);

  await page.getByTestId("log-filter-all").click();
  await page.waitForTimeout(300);
  const allBack =
    (await page.getByTestId("travel-log-list").locator('[data-testid^="travel-log-card-"]').count()) >= 4;
  record("V2.3", allBack, `"All" filter restores every entry`);

  // ============================================================================================
  // V3 — Tap a log entry to focus the map and open the detail
  // ============================================================================================
  await page.getByTestId(`travel-log-card-${middle.body.id}`).click();
  await page.waitForTimeout(500);
  const drawerClosedAfterTap = (await page.getByTestId("travel-log-drawer").count()) === 0;
  await page.getByTestId("destination-sheet-close").waitFor({ timeout: 10000 });
  const sheetOpenedName = await page.getByTestId("destination-name-input").inputValue();
  const middlePin = page.locator(`[data-testid="destination-pin"][aria-label*="${PREFIX} V1 Middle"]`);
  const middlePinSelected = (await middlePin.getAttribute("data-selected")) !== null;
  record(
    "V3.1",
    drawerClosedAfterTap && sheetOpenedName === `${PREFIX} V1 Middle` && middlePinSelected,
    `drawer closed=${drawerClosedAfterTap}, detail opened for "${sheetOpenedName}", pin marked selected=${middlePinSelected}`,
  );
  await page.getByTestId("destination-sheet-close").click();

  // ============================================================================================
  // V4 — Honest empty state when a filter matches nothing
  // ============================================================================================
  // Needs a status with **zero** matches after this run's own fixtures for that status are
  // removed — which needs a status the owner's *real* dev data does not already occupy (checked
  // above, before any fixture existed). If no such status exists right now, the scenario cannot
  // be walked honestly without deleting real data, which this script must never do — recorded as
  // a note, the same treatment `003`'s R2 gap and `004`'s photo-upload gap already use, rather
  // than faked with a status this run does not actually leave empty.
  const emptyableStatus = (["visited", "planned", "wishlist"]).find((s) => realCountByStatus[s] === 0);
  if (emptyableStatus === undefined) {
    record(
      "V4.1",
      null,
      `SKIPPED — the real dev DB already has at least one Destination in every status ` +
        `(${JSON.stringify(realCountByStatus)}), so no status filter can be made to match zero ` +
        `entries without deleting the owner's own data. Not walked; not a defect.`,
    );
  } else {
    // This run's own fixture for `emptyableStatus`, if any, is the only thing keeping it
    // non-empty — remove it and confirm the filter then shows nothing.
    const ownFixtureForStatus = [oldest, newest, middle, undated].find(
      (d) => d.body.status === emptyableStatus,
    );
    if (ownFixtureForStatus) await api("DELETE", `/destinations/${ownFixtureForStatus.body.id}`);
    await openLog();
    await page.getByTestId(`log-filter-${emptyableStatus}`).click();
    await page.waitForTimeout(300);
    const emptyVisible = await page.getByTestId("travel-log-empty").isVisible();
    const emptyText = await page.getByTestId("travel-log-empty").innerText();
    const namesFilterSpecific = emptyText.toLowerCase().includes(emptyableStatus);
    record(
      "V4.1",
      emptyVisible && namesFilterSpecific,
      `filter="${emptyableStatus}" (confirmed zero real matches): honest empty state shown=${emptyVisible}, names the active filter="${emptyText.replace(/\n/g, " ")}"`,
    );
    await page.screenshot({ path: "005-walk-v4.png" });
  }

  // ============================================================================================
} catch (error) {
  record("FATAL", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser.close();
}

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
const passed = results.length - failed.length - skipped.length;
console.log(
  `\n${passed}/${results.length - skipped.length} scenarios passed` +
    (skipped.length > 0 ? ` (${skipped.length} skipped: ${skipped.map((s) => s.id).join(", ")}).` : "."),
);
if (failed.length > 0) {
  console.log("Failed:", failed.map((f) => f.id).join(", "));
  process.exit(1);
}
