/**
 * T056 — hand-walk quickstart.md's V1–V9 against a **production build** and the **real backend**,
 * at the 375x667 floor. The 003 counterpart of `001`'s `scripts/t072-walk.mjs`.
 *
 * Nothing here is stubbed: the frontend is `pnpm start` (production bundle) with
 * `API_BASE_URL=http://127.0.0.1:8000`, the backend is the compose container against real
 * Postgres, and the map's tiles and the location search reach CARTO and Nominatim for real. That
 * is the whole point — every automated frontend test in this repo stubs the proxy, so a green
 * suite is evidence about the frontend in isolation and never about the seam
 * (`.claude/memory.md`, 2026-08-01).
 *
 * Auth without the seed password: a token minted directly from `app.auth.create_access_token` and
 * set as the `ch_session` cookie, the trick recorded in the previous session's handoff.
 *
 * Every fixture this creates is named with the `T056` prefix and deleted at the end, matched on
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
 *   # mint a token without needing the seed password:
 *   docker compose exec -T backend uv run python -c \
 *     "from app.auth import create_access_token; print(create_access_token(1)[0])" > /tmp/tok
 *   TOKEN_FILE=/tmp/tok node scripts/t056-walk.mjs
 *
 * `localhost`, not `127.0.0.1` — a standalone Playwright script driving a Next server from
 * `127.0.0.1` silently never hydrates (`frontend/AGENTS.md`). Port 3400 rather than 3100 so this
 * cannot be adopted by, or collide with, a `playwright test` run.
 */
const BASE = process.env.WALK_BASE ?? "http://localhost:3400";
const API = process.env.WALK_API ?? "http://127.0.0.1:8000";
const TOKEN = readFileSync(process.env.TOKEN_FILE, "utf8").trim();
const PREFIX = "T056";

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

const tileRequests = [];
const nominatimRequests = [];
page.on("request", (request) => {
  const url = request.url();
  if (url.includes("cartocdn.com") || url.includes(".mvt")) tileRequests.push(url);
  if (url.includes("nominatim")) nominatimRequests.push(url);
});

try {
  await cleanup();

  // Seed one Destination per status, so V1/V8 have something real to look at.
  const seeded = [];
  for (const [name, status, lat, lon] of [
    [`${PREFIX} Hoi An`, "visited", 15.8801, 108.338],
    [`${PREFIX} Sapporo`, "planned", 43.0618, 141.3545],
    [`${PREFIX} Ushuaia`, "wishlist", -54.8019, -68.303],
  ]) {
    const { body } = await api("POST", "/destinations", {
      name,
      latitude: lat,
      longitude: lon,
      status,
    });
    seeded.push(body);
  }

  // ---- V1 ------------------------------------------------------------------------------------
  await page.goto(`${BASE}/map`);
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });

  // Wait for a real vector tile rather than a fixed sleep. The first version of this walk slept
  // 4s and recorded "0 .mvt" against a basemap that was merely still loading — which reads
  // exactly like the dead-worker bug of 2026-08-15 and is not it. Poll for the thing itself.
  const tileDeadline = Date.now() + 30000;
  while (tileRequests.filter((u) => u.includes(".mvt")).length === 0 && Date.now() < tileDeadline) {
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);

  const pinCount = await page.getByTestId("destination-pin").count();
  const statuses = await page
    .getByTestId("destination-pin")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  const distinct = new Set(statuses);
  record(
    "V1.1-2",
    pinCount >= 3 && distinct.has("visited") && distinct.has("planned") && distinct.has("wishlist"),
    `${pinCount} pins on screen, statuses present: ${[...distinct].join("/")}`,
  );

  const realTiles = tileRequests.filter((u) => u.includes(".mvt")).length;
  record("V1 (tiles)", realTiles > 0, `${realTiles} vector tile requests — basemap really drew`);

  await page.mouse.move(180, 300);
  await page.mouse.down();
  await page.mouse.move(120, 260, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  const controlsInside = await page.evaluate(() => {
    const ids = ["status-filter", "quick-add", "destination-strip", "open-trips"];
    return ids.every((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth;
    });
  });
  record("V1.3", !overflow && controlsInside, `after pan: overflow=${overflow}, controls inside=${controlsInside}`);
  await page.screenshot({ path: "t056-v1.png" });

  // ---- V8 (before adding more, while the three statuses are clean) ---------------------------
  await page.getByTestId("status-filter-visited").click();
  await page.waitForTimeout(900);
  const filtered = await page
    .getByTestId("destination-pin")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  const onlyVisited = filtered.length > 0 && filtered.every((s) => s === "visited");
  await page.getByTestId("status-filter-all").click();
  await page.waitForTimeout(900);
  const restored = await page.getByTestId("destination-pin").count();
  record("V8", onlyVisited && restored >= pinCount, `filtered to ${filtered.length} visited, cleared back to ${restored}`);
  await page.screenshot({ path: "t056-v8.png" });

  // ---- V3 — real Nominatim ------------------------------------------------------------------
  await page.getByTestId("quick-add-search-input").fill("Kyoto");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-result").first().waitFor({ timeout: 30000 });
  const candidates = await page.getByTestId("quick-add-search-result").count();
  const firstText = await page.getByTestId("quick-add-search-result").first().innerText();
  record("V3.1", candidates > 0 && firstText.length > 0, `${candidates} real candidates, first: ${firstText.replace(/\n/g, " / ").slice(0, 60)}`);

  // ---- V5 — three interactions, against the real API ------------------------------------------
  // Identified by **id difference**, never by name: Nominatim answers "Kyoto" with the local
  // exonym (京都市) depending on the language it decides to use, so a name match is a coin flip —
  // and the first version of this walk both mis-reported V5 and leaked the row it failed to
  // recognise, because cleanup only sweeps the `T056` prefix.
  const { body: beforeQuickAdd } = await api("GET", "/destinations");
  const idsBefore = new Set((beforeQuickAdd ?? []).map((d) => d.id));

  const urlBefore = page.url();
  await page.getByTestId("quick-add-search-add").first().click();
  await page.getByTestId("quick-add-status-group").waitFor();
  await page.getByTestId("quick-add-status-wishlist").click();
  await page.waitForTimeout(2500);

  const { body: afterQuickAdd } = await api("GET", "/destinations");
  const added = (afterQuickAdd ?? []).filter((d) => !idsBefore.has(d.id));
  const quickAdded = added[0];
  record(
    "V5.1-2",
    added.length === 1 &&
      quickAdded.latitude !== 0 &&
      quickAdded.status === "wishlist" &&
      page.url() === urlBefore,
    quickAdded
      ? `"${quickAdded.name}" saved at ${quickAdded.latitude.toFixed(3)},${quickAdded.longitude.toFixed(3)} as ${quickAdded.status}, no navigation`
      : "no row was created by the quick-add flow",
  );
  for (const row of added) await api("DELETE", `/destinations/${row.id}`);

  // V3.2 — a search with no matches, distinct from a failed one
  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.getByTestId("quick-add-search-input").fill("zzzqqxnowherereally12345");
  await page.getByTestId("quick-add-search-input").press("Enter");
  await page.getByTestId("quick-add-search-empty").waitFor({ timeout: 30000 });
  const errorShown = await page.getByTestId("quick-add-search-error").count();
  record("V3.2", errorShown === 0, "no-matches message shown, and it is not the transport-failure message");

  // ---- V9 — what left the machine -------------------------------------------------------------
  const leaky = [...tileRequests, ...nominatimRequests].filter((u) => {
    const lower = u.toLowerCase();
    return (
      lower.includes("hoi%20an") ||
      lower.includes("sapporo") ||
      lower.includes("ushuaia") ||
      lower.includes(PREFIX.toLowerCase()) ||
      /destination|trip_id|note=/.test(lower)
    );
  });
  const nominatimCarriedOnlyQuery = nominatimRequests.every(
    (u) => u.includes("kyoto") || u.includes("zzzqqx") || !/hoi|sapporo|ushuaia/i.test(u),
  );
  record(
    "V9",
    leaky.length === 0 && nominatimCarriedOnlyQuery,
    `${tileRequests.length} tile + ${nominatimRequests.length} search requests, none carrying a stored record`,
  );

  // ---- V7 — free status transitions, and Currently Traveling ---------------------------------
  const subject = seeded[2];
  let ok = true;
  for (const next of ["planned", "visited", "wishlist"]) {
    const { status } = await api("PATCH", `/destinations/${subject.id}`, { status: next });
    if (status !== 200) ok = false;
  }
  record("V7.1", ok, "wishlist -> planned -> visited -> wishlist, every transition accepted");

  const today = new Date().toISOString().slice(0, 10);
  const { body: traveling } = await api("PATCH", `/destinations/${seeded[1].id}`, {
    status: "planned",
    start_date: today,
    end_date: today,
  });
  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  const travelingMarked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-testid="destination-pin"]')];
    return els.some((e) => (e.getAttribute("aria-label") ?? "").toLowerCase().includes("traveling"));
  });
  record(
    "V7.2",
    travelingMarked && traveling.status === "planned",
    `overlay drawn=${travelingMarked}, stored status still "${traveling.status}" (not a fourth value)`,
  );
  await page.screenshot({ path: "t056-v7.png" });

  // ---- V4 — Trips ------------------------------------------------------------------------------
  const { body: trip } = await api("POST", "/trips", {
    name: `${PREFIX} Japan`,
    start_date: "2026-09-01",
    end_date: "2026-09-10",
    status: "planned",
  });
  const { body: inside } = await api("POST", "/destinations", {
    trip_id: trip.id,
    name: `${PREFIX} Nara`,
    latitude: 34.6851,
    longitude: 135.8048,
    status: "planned",
    start_date: "2026-09-03",
    end_date: "2026-09-04",
  });
  const { body: outside } = await api("PATCH", `/destinations/${inside.id}`, {
    start_date: "2026-12-01",
    end_date: "2026-12-05",
  });
  record(
    "V4.3",
    outside.outside_trip_range === true,
    `dates outside the Trip's range flagged (outside_trip_range=${outside.outside_trip_range}), write not rejected`,
  );

  await page.reload();
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  const naraOnMap = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="destination-pin"]')].some((e) =>
      (e.getAttribute("aria-label") ?? "").includes("Nara"),
    ),
  );
  record("V4.2", naraOnMap, "a Trip's Destination is drawn on the map (FR-019)");

  await page.getByTestId("open-trips").click();
  await page.waitForTimeout(800);
  const tripPanelText = await page.getByTestId("trip-panel").innerText().catch(() => "");
  record("V4.1", tripPanelText.includes(`${PREFIX} Japan`), "the Trip is listed in the Trips panel");
  await page.screenshot({ path: "t056-v4.png" });

  const { status: delStatus } = await api("DELETE", `/trips/${trip.id}`);
  const { body: afterDelete } = await api("GET", "/destinations");
  const naraGone = !(afterDelete ?? []).some((d) => d.id === inside.id);
  record("V4.4", delStatus === 204 && naraGone, `deleting the Trip cascaded to its Destination (FR-018)`);

  // ---- V2 — a Visited Destination's note, and the absence of a gallery elsewhere ---------------
  await api("PATCH", `/destinations/${seeded[0].id}`, {
    status: "visited",
    note: `${PREFIX} the lanterns at dusk`,
  });
  await page.goto(`${BASE}/map`);
  await page.getByTestId("map-canvas").waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.getByTestId(`destination-card-${seeded[0].id}`).click();
  await page.getByTestId("destination-note-input").waitFor({ timeout: 15000 });
  const noteValue = await page.getByTestId("destination-note-input").inputValue();
  record(
    "V2.2",
    noteValue.includes("lanterns at dusk"),
    "one tap from the map opens the Visited place's note",
  );

  // V2.3: the gallery and the note belong to Visited alone.
  await page.getByTestId("destination-sheet-close").click();
  await page.waitForTimeout(800);
  await page.getByTestId(`destination-card-${seeded[2].id}`).click();
  await page.waitForTimeout(1500);
  const noteOnWishlist = await page.getByTestId("destination-note-input").count();
  const galleryOnWishlist = await page.getByTestId("destination-photo-attach").count();
  record(
    "V2.3",
    noteOnWishlist === 0 && galleryOnWishlist === 0,
    `a Wishlist place offers no note (${noteOnWishlist}) and no gallery (${galleryOnWishlist})`,
  );
  await page.getByTestId("destination-sheet-close").click();
  await page.screenshot({ path: "t056-v2.png" });

  record("V6", false, "SKIPPED — R2 is not provisioned (r2_* settings all empty), so no upload can be walked");
} finally {
  await cleanup();
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  for (const f of failed) console.log(`   FAILED: ${f.id} — ${f.detail}`);
}
