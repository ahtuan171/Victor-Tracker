/**
 * T072 - walk quickstart V1-V9 against the DEPLOYED environment.
 *
 * This is the one walk the automated suite structurally cannot do: every Playwright test in
 * tests/e2e stubs the proxy, because CI has no FastAPI behind it. Here nothing is stubbed - the
 * browser talks to Vercel, which proxies to Render, which queries Neon.
 *
 * ASCII output only: the Windows console is cp1252.
 *
 * Usage (from frontend/):
 *   set -a; . "D:/AhTuan/prod.env"; set +a
 *   node scripts/t072-walk.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://creator-hub-hazel.vercel.app";
const EMAIL = "ahtuan1701@gmail.com";
const PASSWORD = process.env.SEED_CREATOR_PASSWORD;
const SHOTS = "scripts/t072-shots";

if (!PASSWORD) {
  console.error("SEED_CREATOR_PASSWORD is not set. Source prod.env first.");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const results = [];
const created = [];

function record(id, name, status, detail) {
  results.push({ id, name, status, detail });
  console.log(`[${status}] ${id} ${name}${detail ? " :: " + detail : ""}`);
}

async function run(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, "PASS", detail);
  } catch (err) {
    record(id, name, "FAIL", String(err && err.message ? err.message : err).slice(0, 300));
  }
}

const signIn = async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

  // Wait for hydration BEFORE TYPING, not merely before clicking.
  //
  // The T072 fix disables the submit control until handlers exist, so Playwright's click already
  // auto-waits for "enabled". Filling first still fails, and silently: values typed into a
  // React-controlled input before hydration live only in the DOM, and hydration resets the input to
  // React's own (empty) state. The click then submits an EMPTY form, the API answers 401, the page
  // stays on /login, and the symptom is a navigation timeout that looks like a dead backend or a
  // wrong password. Cost a full walk to find - the credential was correct throughout.
  const submit = page.getByRole("button", { name: /sign in/i });
  for (let i = 0; i < 120; i += 1) {
    if (!(await submit.isDisabled())) break;
    await page.waitForTimeout(500);
  }
  if (await submit.isDisabled()) throw new Error("login form never hydrated");

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await submit.click();
  await page.waitForURL("**/calendar", { timeout: 90_000 });
  await page.waitForSelector('[data-testid="month-grid"], [data-testid="week-list"], [data-testid="first-run"]', {
    timeout: 90_000,
  });
};

/**
 * The expanded drawer's scrim covers the toggle, so "click the toggle again" does not close it.
 * Escape does (BacklogDrawer.tsx), and so does tapping the scrim. Same for the sheets.
 */
const closeOverlays = async (page) => {
  for (let i = 0; i < 4; i += 1) {
    const expanded = await page.getByTestId("backlog-expanded").isVisible().catch(() => false);
    const sheet = await page.getByTestId("item-save").isVisible().catch(() => false);
    const capture = await page.getByTestId("capture-save").isVisible().catch(() => false);
    if (!expanded && !sheet && !capture) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
};

const openDrawer = async (page) => {
  await closeOverlays(page);
  const already = await page.getByTestId("backlog-expanded").isVisible().catch(() => false);
  if (!already) {
    await page.getByTestId("backlog-toggle").click();
    await page.waitForTimeout(700);
  }
};

const capture = async (page, title) => {
  await closeOverlays(page);
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill(title);
  await page.getByTestId("capture-save").click();
  await page.waitForTimeout(1500);
  created.push(title);
  await closeOverlays(page);
};

const main = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();

  // ---------------------------------------------------------------- V2
  await run("V2", "Capture an idea in under 15 seconds (FR-005, SC-001)", async () => {
    await signIn(page);
    const title = "T072 walk - capture timing";
    const t0 = Date.now();
    await page.getByTestId("capture-action").click();
    await page.getByLabel("Title").fill(title);
    await page.getByTestId("capture-save").click();
    await page.waitForTimeout(1500);
    const elapsed = (Date.now() - t0) / 1000;
    created.push(title);
    await openDrawer(page);
    const visible = await page.getByText(title).first().isVisible();
    await page.screenshot({ path: `${SHOTS}/v2-backlog.png` });
    await closeOverlays(page);
    if (!visible) throw new Error("captured item not found in backlog");
    if (elapsed > 15) throw new Error(`took ${elapsed.toFixed(2)}s, over the 15s budget`);
    return `3 interactions, ${elapsed.toFixed(2)}s (warm), item present in backlog`;
  });

  // empty title refused
  await run("V2b", "Empty title is refused and creates nothing (US1 scenario 2)", async () => {
    await closeOverlays(page);
    const before = (await (await page.request.get(`${BASE}/api/content-items`)).json()).length;
    await page.getByTestId("capture-action").click();
    await page.getByLabel("Title").waitFor();

    // The product refuses EARLIER than this scenario assumed: save is `disabled` on an empty title,
    // so there is no click to make. Asserting the disabled state is the honest check - the first
    // version clicked and timed out on a button that was correctly inert, which reads as a product
    // failure in the summary and is the opposite.
    const save = page.getByTestId("capture-save");
    const disabledEmpty = await save.isDisabled();
    await page.getByLabel("Title").fill("x");
    await page.waitForTimeout(200);
    const enabledWithTitle = !(await save.isDisabled());
    await page.getByLabel("Title").fill("");
    await page.waitForTimeout(200);
    const disabledAgain = await save.isDisabled();
    const stillOpen = await save.isVisible();
    await closeOverlays(page);
    const after = (await (await page.request.get(`${BASE}/api/content-items`)).json()).length;

    if (!disabledEmpty) throw new Error("save was enabled on an empty title");
    if (!enabledWithTitle) throw new Error("save stayed disabled after a title was typed");
    if (!disabledAgain) throw new Error("save stayed enabled after the title was cleared again");
    if (!stillOpen) throw new Error("the sheet closed on an empty title");
    if (after !== before) throw new Error(`item count moved ${before} -> ${after}`);
    return `save disabled while the title is empty (and re-disabled when cleared), sheet stayed open, item count unchanged at ${before}`;
  });

  // ---------------------------------------------------------------- V4
  await run("V4", "Whole journey idea->posted, no drag (SC-002, SC-011, SC-012)", async () => {
    const urlBefore = page.url();
    await openDrawer(page);
    await page.getByTestId("backlog-row").first().click();
    await page.waitForTimeout(800);

    // Refusal first: advance with no platform (FR-009). The tap alone issues NO request - the sheet
    // saves on an explicit save (one PATCH carrying a diff, which is what makes SC-012 reachable),
    // so the 409 only exists after SAVE. The first version read the message straight after the
    // status tap and got the sheet's standing hint ("Changes save together..."), which is always
    // present and would have passed against a product that never refused anything.
    await page.getByTestId("status-option-draft").click();
    await page.waitForTimeout(300);
    await page.getByTestId("item-save").click();
    await page.waitForTimeout(2000);
    const refusal = await page.getByTestId("item-sheet-message").innerText().catch(() => "");
    if (!/platform/i.test(refusal)) {
      throw new Error(`expected a platform_required refusal after save, got "${refusal.slice(0, 120)}"`);
    }

    await page.getByTestId("platform-option-tiktok").click();
    await page.waitForTimeout(400);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await page.getByTestId("item-date-input").fill(iso);
    await page.getByTestId("status-option-draft").click();
    await page.waitForTimeout(300);
    await page.getByTestId("status-option-posted").click();
    await page.waitForTimeout(300);
    await page.getByTestId("item-save").click();
    await page.waitForTimeout(1800);
    await closeOverlays(page);
    const urlAfter = page.url();
    await page.screenshot({ path: `${SHOTS}/v4-after-journey.png` });
    if (urlBefore !== urlAfter) throw new Error(`URL changed: ${urlBefore} -> ${urlAfter}`);
    if (!refusal) throw new Error("no refusal message shown when advancing without a platform");
    return `refused without platform ("${refusal.slice(0, 60)}"), then idea->draft->posted by tap only; URL never changed`;
  });

  // ---------------------------------------------------------------- V5
  //
  // quickstart.md's V5 runs backend/tests/test_transitions.py, which exercises INV-1 against the
  // LOCAL database. T072 is about the deployed environment, so the same three propositions are put
  // to the real API instead: browser -> Vercel proxy -> Render -> Neon. page.request shares the
  // context's cookie jar, so these carry the session the sign-in above established.
  await run("V5", "Invariants hold under abuse (FR-008a, FR-009, FR-009a, FR-019a)", async () => {
    const api = page.request;
    const steps = [];
    const link = "https://www.tiktok.com/@creator/video/7000000000000000001";

    const created_ = await api.post(`${BASE}/api/content-items`, {
      data: { title: "T072 invariant probe" },
    });
    if (created_.status() !== 201) throw new Error(`create returned ${created_.status()}`);
    const item = await created_.json();
    created.push("T072 invariant probe");
    const url = `${BASE}/api/content-items/${item.id}`;

    // 1. advance past idea with no platform -> 409 platform_required
    const r1 = await api.patch(url, { data: { status: "draft" } });
    const b1 = await r1.json().catch(() => ({}));
    if (r1.status() !== 409) throw new Error(`advance with no platform returned ${r1.status()}`);
    if (b1.code !== "platform_required") throw new Error(`code was "${b1.code}"`);
    steps.push(`no-platform advance -> 409 ${b1.code}`);

    // SC-012: platform and status in ONE request, which is why check_invariant_1 validates the
    // post-change item rather than the stored one.
    const r2 = await api.patch(url, { data: { platform: "tiktok", status: "draft" } });
    if (r2.status() !== 200) throw new Error(`one-request advance returned ${r2.status()}`);
    steps.push("platform+status in one PATCH -> 200");

    // 2. clear the platform while past idea -> 409 platform_locked
    const r3 = await api.patch(url, { data: { platform: null } });
    const b3 = await r3.json().catch(() => ({}));
    if (r3.status() !== 409) throw new Error(`clearing platform returned ${r3.status()}`);
    if (b3.code !== "platform_locked") throw new Error(`code was "${b3.code}"`);
    steps.push(`clear platform on a draft -> 409 ${b3.code}`);

    // 3. posted -> draft -> idea is lossless (FR-008a, FR-019a)
    const r4 = await api.patch(url, { data: { status: "posted", published_url: link } });
    if (r4.status() !== 200) throw new Error(`advance to posted returned ${r4.status()}`);
    const back1 = await (await api.patch(url, { data: { status: "draft" } })).json();
    const back2 = await (await api.patch(url, { data: { status: "idea" } })).json();
    if (back2.status !== "idea") throw new Error(`reversal left status "${back2.status}"`);
    if (back1.platform !== "tiktok" || back2.platform !== "tiktok") {
      throw new Error(`platform lost on reversal: ${back1.platform} / ${back2.platform}`);
    }
    if (back1.published_url !== link || back2.published_url !== link) {
      throw new Error(`link lost on reversal: ${back1.published_url} / ${back2.published_url}`);
    }
    steps.push("posted->draft->idea preserved platform and published link");

    return steps.join("; ");
  });

  // ---------------------------------------------------------------- V3
  await run("V3", "Status readable without colour (FR-017, SC-004)", async () => {
    // All three statuses must be ON THE GRID for the greyscale shot to prove anything - SC-004 is
    // "identify every item's status from the calendar view alone". Captured items are UNDATED and
    // live in the backlog, so capturing three here would screenshot a grid with none of them on it.
    // Built through the API for the dates, then read back by the browser like any other item.
    const api = page.request;
    const today = new Date();
    const day = (n) =>
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    const cues = [
      { title: "T072 cue idea", status: "idea", platform: null, on: 4 },
      { title: "T072 cue draft", status: "draft", platform: "instagram", on: 5 },
      { title: "T072 cue posted", status: "posted", platform: "youtube", on: 6 },
    ];
    for (const c of cues) {
      const made = await api.post(`${BASE}/api/content-items`, {
        data: { title: c.title, scheduled_date: day(c.on) },
      });
      if (made.status() !== 201) throw new Error(`${c.title} create returned ${made.status()}`);
      created.push(c.title);
      const row = await made.json();
      if (c.status !== "idea") {
        // One PATCH carrying platform AND status - INV-1 is checked against the post-change item.
        const adv = await api.patch(`${BASE}/api/content-items/${row.id}`, {
          data: { platform: c.platform, status: c.status },
        });
        if (adv.status() !== 200) throw new Error(`${c.title} advance returned ${adv.status()}`);
      }
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="month-grid"]', { timeout: 60_000 });
    // The grid renders its 42 cells BEFORE the items arrive - waiting on the grid alone counted
    // zero cues against a structurally complete but empty calendar. Wait for the data.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="status-cue"]').length >= 3,
      undefined,
      { timeout: 60_000 },
    );
    await page.screenshot({ path: `${SHOTS}/v3-month-colour.png` });
    await page.addStyleTag({ content: "html{filter:grayscale(1) !important}" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/v3-month-greyscale.png` });
    const drawn = await page.getByTestId("status-cue").count();
    if (drawn < 3) throw new Error(`only ${drawn} status cues on the grid; need all three statuses`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="month-grid"]', { timeout: 60_000 });
    return `idea/draft/posted all dated onto the grid, ${drawn} status cues rendered; greyscale shot written - inspect v3-month-greyscale.png`;
  });

  // ---------------------------------------------------------------- V6
  await run("V6", "Everything fits at 375px (FR-021, SC-003)", async () => {
    const surfaces = [];
    const checkWidth = async (label) => {
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      const offscreen = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll("button, a, input, select, textarea, [role=button]")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // The backlog peek strip is the one surface allowed to clip a control: a single line by
          // design, with the expanded drawer as the stated compensation. quickstart.md V6 names the
          // exception and tests/e2e/viewport-audit.spec.ts encodes the same one - without it this
          // check reports the design as a defect on every surface the strip is visible behind.
          if (el.closest('[data-testid="backlog-peek-list"]') !== null) continue;
          if (r.left < -0.5 || r.right > window.innerWidth + 0.5) {
            bad.push((el.getAttribute("data-testid") || el.tagName) + `@${Math.round(r.left)},${Math.round(r.right)}`);
          }
        }
        return bad;
      });
      surfaces.push(`${label}: body ${overflow.scroll}/${overflow.client}, offscreen ${offscreen.length}${offscreen.length ? " " + offscreen.join(" ") : ""}`);
      await page.screenshot({ path: `${SHOTS}/v6-${label}.png` });
    };

    await closeOverlays(page);
    await checkWidth("month");
    await page.getByTestId("view-week").click();
    await page.waitForTimeout(600);
    await checkWidth("week");
    await page.getByTestId("view-month").click();
    await page.waitForTimeout(600);
    await openDrawer(page);
    await checkWidth("backlog-expanded");
    await page.getByTestId("backlog-row").first().click();
    await page.waitForTimeout(800);
    await checkWidth("item-sheet");
    await page.getByTestId("item-delete").click();
    await page.waitForTimeout(600);
    await checkWidth("delete-confirm");
    await page.getByTestId("delete-keep").click();
    await page.waitForTimeout(600);
    await closeOverlays(page);

    const failures = surfaces.filter((s) => !s.includes("offscreen 0") || s.match(/body (\d+)\/(\d+)/) === null);
    const bodyBad = surfaces.filter((s) => {
      const m = s.match(/body (\d+)\/(\d+)/);
      return m && Number(m[1]) > Number(m[2]);
    });
    if (bodyBad.length) throw new Error("horizontal body scroll: " + bodyBad.join(" | "));
    if (failures.length) throw new Error("controls off screen: " + failures.join(" | "));
    return surfaces.join(" | ");
  });

  // ---------------------------------------------------------------- V7
  await run("V7", "Delete needs explicit confirmation (FR-020, SC-007)", async () => {
    await openDrawer(page);
    await page.getByTestId("backlog-row").first().click();
    await page.waitForTimeout(900);
    const titleBefore = await page.getByTestId("item-title-input").inputValue();
    await page.getByTestId("item-delete").click();
    await page.waitForTimeout(600);
    const confirmVisible = await page.getByTestId("delete-confirm").isVisible();
    await page.getByTestId("delete-keep").click();
    await page.waitForTimeout(600);
    await closeOverlays(page);
    await openDrawer(page);
    const stillThere = await page.getByText(titleBefore).first().isVisible().catch(() => false);
    if (!confirmVisible) throw new Error("no confirmation dialog appeared");
    if (!stillThere) throw new Error("item vanished after choosing keep");
    return "confirmation required; 'keep' left the item intact";
  });

  // ---------------------------------------------------------------- V8
  await run("V8", "Changes survive a reload; link is reachable (FR-023, SC-009, FR-019)", async () => {
    await closeOverlays(page);
    await page.getByTestId("view-week").click();
    await page.waitForTimeout(900);
    const chip = page.getByTestId("item-chip").first();
    await chip.click();
    await page.waitForTimeout(800);
    const link = "https://www.tiktok.com/@creator/video/7000000000000000000";
    await page.getByTestId("item-link-input").fill(link);
    await page.getByTestId("item-save").click();
    await page.waitForTimeout(1800);
    await closeOverlays(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="month-grid"], [data-testid="week-list"]', { timeout: 60_000 });

    // Step 1's second half: "sign out and back in". Unwalkable before T077 - the Phase 7 hand-walk
    // had to substitute clearing the cookie, because nothing in the product could sign out.
    await page.getByTestId("sign-out-action").click();
    await page.waitForURL("**/login", { timeout: 60_000 });
    await signIn(page);

    await page.getByTestId("view-week").click();
    await page.waitForTimeout(800);
    const openControl = page.getByTestId("item-published-link").first();
    const href = await openControl.getAttribute("href");
    const rel = await openControl.getAttribute("rel");
    const target = await openControl.getAttribute("target");
    await page.screenshot({ path: `${SHOTS}/v8-week-link.png` });
    if (href !== link) throw new Error(`link did not persist: ${href}`);
    if (!rel || !rel.includes("noopener") || !rel.includes("noreferrer")) throw new Error(`rel is "${rel}"`);
    return `persisted across reload; rel="${rel}" target="${target}"`;
  });

  // ---------------------------------------------------------------- filter
  await run("US4", "Platform filter narrows and clears (FR-016, SC-005)", async () => {
    await closeOverlays(page);
    await page.getByTestId("view-month").click();
    await page.waitForTimeout(700);
    const before = await page.getByTestId("item-chip").count();
    const t0 = Date.now();
    await page.getByTestId("platform-filter-youtube").click();
    await page.waitForTimeout(400);
    const elapsed = (Date.now() - t0) / 1000;
    const during = await page.getByTestId("item-chip").count();
    await page.screenshot({ path: `${SHOTS}/filter-youtube.png` });
    await page.getByTestId("platform-filter-all").click();
    await page.waitForTimeout(400);
    const after = await page.getByTestId("item-chip").count();
    if (after !== before) throw new Error(`clearing the filter did not restore: ${before} -> ${after}`);
    if (elapsed > 1) throw new Error(`filter took ${elapsed.toFixed(2)}s, over SC-005's 1s`);
    return `${before} chips -> ${during} filtered to YouTube -> ${after} restored, in ${elapsed.toFixed(2)}s`;
  });

  // ---------------------------------------------------------------- V9
  //
  // SC-008. The drag is from the PEEK strip, not the expanded drawer: expanded, the drawer's scrim
  // covers the grid, so there is no drop target on screen. That is the surface R-003a bought - one
  // DOM tree, so a chip can be dragged from the backlog onto a day without a route change.
  await run("V9", "A week's planning in under a minute (SC-008)", async () => {
    await closeOverlays(page);
    await page.getByTestId("view-month").click();
    await page.waitForTimeout(700);

    // Five undated ideas, captured before the clock starts - V9 times the PLACING, not the capture.
    for (let i = 1; i <= 5; i += 1) await capture(page, `T072 week plan ${i}`);
    await closeOverlays(page);
    await page.waitForTimeout(800);

    const cells = page.locator('[data-testid="day-cell"][data-in-period=""]');
    const placed = [];
    const t0 = Date.now();
    for (let i = 0; i < 5; i += 1) {
      // Whichever "week plan" chip is leftmost, not a numbered one. The backlog is newest-first and
      // the peek strip is a single clipped line, so "T072 week plan 1" is the LAST of the five and
      // sits off the right edge - asking for it by number waited 30s for a chip that was never
      // going to be visible. Filtering by the shared prefix also keeps this walk's earlier fixtures
      // out of the drag, which is what the by-name targeting was for.
      const chip = page
        .getByTestId("backlog-peek-list")
        .getByTestId("item-chip")
        .filter({ hasText: "T072 week plan" })
        .first();
      const source = await chip.boundingBox();
      if (!source) throw new Error(`no "T072 week plan" chip reachable in the peek strip at drop ${i + 1}`);
      const cell = cells.nth(7 + i); // second row, five consecutive days
      const target = await cell.boundingBox();
      if (!target) throw new Error(`no day cell for drop ${i + 1}`);

      // Past the 8px activation distance, in steps: a single jump can arrive as one event the
      // sensor sees only after the pointer has stopped, which no real finger produces.
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      placed.push(await cell.getAttribute("data-date"));
    }
    const elapsed = (Date.now() - t0) / 1000;
    await page.screenshot({ path: `${SHOTS}/v9-week-planned.png` });

    // Asked of the SERVER, not the DOM. `getByText` searches the whole page, and a scheduled item's
    // title is still present as the month grid's sr-only chip title (micro chips render the title
    // for assistive tech only) - so a DOM check reported all five "still in the backlog" when every
    // one of them had in fact been scheduled. What US2 scenario 4 requires is the partition: dated
    // items on the grid, undated ones in the backlog, never both. `scheduled_date` is that fact.
    const rows = await (await page.request.get(`${BASE}/api/content-items`)).json();
    const unscheduled = [];
    const dates = [];
    for (let i = 1; i <= 5; i += 1) {
      const row = rows.find((r) => r.title === `T072 week plan ${i}`);
      if (!row) throw new Error(`"T072 week plan ${i}" is missing from the server entirely`);
      if (!row.scheduled_date) unscheduled.push(i);
      else dates.push(row.scheduled_date);
    }
    if (unscheduled.length) {
      throw new Error(`still undated after the drop: ${unscheduled.join(", ")}`);
    }
    if (elapsed > 60) throw new Error(`took ${elapsed.toFixed(2)}s, over SC-008's 60s`);
    return `5 ideas dragged onto ${placed.join(", ")} in ${elapsed.toFixed(2)}s; server confirms all five dated (${dates.sort().join(", ")}), none left in the backlog`;
  });

  // Deliberately NOT context.storageState() - that file contains the production session cookie,
  // which is a ~30-day credential (tech-defaults.md: no denylist, so no revocation). Writing it
  // into the checkout puts a live credential one `git add -A` away from the remote.
  writeFileSync(`${SHOTS}/results.json`, JSON.stringify({ results, created }, null, 2));

  // ---------------------------------------------------------------- V1
  await run("V1", "Nothing visible without signing in (FR-001, FR-002, SC-006)", async () => {
    const fresh = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p2 = await fresh.newPage();
    const leaks = [];
    for (const path of ["/", "/calendar", "/api/content-items"]) {
      const resp = await p2.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      const body = await resp.text().catch(() => "");
      const finalUrl = p2.url();
      for (const t of created) {
        if (body.includes(t)) leaks.push(`${path} leaked "${t}"`);
      }
      if (path !== "/api/content-items" && !finalUrl.includes("/login")) {
        leaks.push(`${path} did not land on /login (got ${finalUrl})`);
      }
      if (path === "/api/content-items" && resp.status() !== 401) {
        leaks.push(`/api/content-items returned ${resp.status()}, expected 401`);
      }
    }
    await p2.screenshot({ path: `${SHOTS}/v1-login.png` });
    await fresh.close();
    if (leaks.length) throw new Error(leaks.join(" | "));
    return `/ and /calendar redirect to /login with no item title in any body; /api/content-items 401 (${created.length} fixture titles checked)`;
  });

  // ------------------------------------------------------- cleanup
  //
  // Every fixture this walk made, plus the wreckage of the earlier aborted runs. Matched on the
  // "T072" title prefix rather than on `created`, so a title from a run that crashed before it
  // could record one is still swept up. Runs after V1, which needs the items to still exist for
  // "no title leaked to an unauthenticated request" to mean anything.
  await run("cleanup", "Remove every T072 fixture item", async () => {
    const api = page.request;
    const list = await api.get(`${BASE}/api/content-items`);
    if (list.status() !== 200) throw new Error(`list returned ${list.status()}`);
    const all = await list.json();
    const fixtures = all.filter((it) => it.title.startsWith("T072"));
    const failed = [];
    for (const it of fixtures) {
      const resp = await api.delete(`${BASE}/api/content-items/${it.id}`);
      if (resp.status() !== 204) failed.push(`${it.id} -> ${resp.status()}`);
    }
    const after = await (await api.get(`${BASE}/api/content-items`)).json();
    const left = after.filter((it) => it.title.startsWith("T072"));
    if (failed.length) throw new Error(`delete failed: ${failed.join(", ")}`);
    if (left.length) throw new Error(`${left.length} T072 items still present`);
    return `deleted ${fixtures.length} fixture items; ${after.length} items remain, none named T072*`;
  });

  await browser.close();

  console.log("\n==== T072 SUMMARY ====");
  for (const r of results) console.log(`${r.status.padEnd(4)} ${r.id.padEnd(5)} ${r.name}`);
  console.log(`\nfixture items created: ${created.length}`);
  writeFileSync(`${SHOTS}/results.json`, JSON.stringify({ results, created }, null, 2));
};

main().catch((e) => {
  console.error("WALK ABORTED:", e && e.message ? e.message : e);
  writeFileSync(`${SHOTS}/results.json`, JSON.stringify({ results, created, aborted: String(e) }, null, 2));
  process.exit(1);
});
