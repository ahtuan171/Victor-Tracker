/**
 * T043 - greyscale acceptance screenshots, every surface with an appearance-based distinction,
 * both presentations (dark and light).
 *
 * Local, stubbed proxy (same pattern as tests/e2e/*.spec.ts) against `pnpm dev` on :3000. Not a
 * Playwright test file: nothing here is asserted, it only captures PNGs for the audit to look at
 * side by side with each surface's design brief.
 *
 * Usage (from frontend/): node scripts/t043-greyscale.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// `localhost`, not `127.0.0.1`: Turbopack's cross-origin dev-resource guard silently breaks
// hydration when the page is loaded from an origin outside `allowedDevOrigins` — no console error,
// no failed request, chunks all report 200, but client JS never takes over and `today` stays null
// forever (`period === null`'s "Loading your items…" never clears). Cost real debugging time; see
// frontend/AGENTS.md.
const BASE = "http://localhost:3000";
const OUT = "../design/002-pixel-arcade-skin/greyscale";
const NOW = Date.UTC(2026, 2, 12, 3, 0, 0); // Thu 12 Mar 2026, 10:00 Asia/Ho_Chi_Minh — matches overdue.spec.ts

mkdirSync(OUT, { recursive: true });

function anItem(overrides = {}) {
  return {
    id: 1,
    title: "Overdue idea",
    hook: null,
    platform: "tiktok",
    scheduled_date: "2026-03-10",
    status: "idea",
    published_url: null,
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-01T09:00:00Z",
    ...overrides,
  };
}

const ITEMS = [
  anItem(),
  anItem({ id: 2, title: "Draft in progress", platform: "instagram", scheduled_date: "2026-03-15", status: "draft" }),
  anItem({ id: 3, title: "Already posted", platform: "youtube", scheduled_date: "2026-03-05", status: "posted", published_url: "https://youtube.com/watch?v=abc" }),
  anItem({ id: 4, title: "Backlog idea, no date", scheduled_date: null, platform: null }),
];

async function stub(page, theme) {
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ITEMS) });
  });
  await page.route("**/api/preferences", async (route) => {
    const body = JSON.stringify({ theme, sound_enabled: false });
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 200, contentType: "application/json", body });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body });
    }
  });
  await page.context().addCookies([
    { name: "ch_session", value: "stub-session", url: BASE },
    { name: "ch_theme", value: theme, url: BASE },
  ]);
  await page.clock.setFixedTime(NOW);
}

async function shoot(page, name, { greyscale }) {
  if (greyscale) {
    await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function run() {
  const browser = await chromium.launch();

  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await stub(page, theme);

    // Month grid, with status cues (idea/draft/posted), overdue border, comic-panel corners.
    // `month-grid`, not `capture-action` — the action band is SSR content and appearing proves
    // nothing about hydration; `period` stays null (and the grid never renders) until the client
    // clock read lands, per CalendarShell's own "period === null until the browser's clock has been
    // read" comment.
    await page.goto(`${BASE}/calendar`);
    await page.getByTestId("month-grid").waitFor({ timeout: 30_000 });
    await shoot(page, `${theme}-01-month-color`, { greyscale: false });
    await shoot(page, `${theme}-01-month-grey`, { greyscale: true });

    // Week view, full-size comic-panel chips.
    await page.getByTestId("view-week").click();
    await page.getByTestId("week-list").waitFor();
    await shoot(page, `${theme}-02-week-color`, { greyscale: false });
    await shoot(page, `${theme}-02-week-grey`, { greyscale: true });

    // Item chip hover state (comic-panel web-line accent).
    const chip = page.locator('[data-date="2026-03-10"]').getByTestId("item-chip").first();
    await chip.hover();
    await shoot(page, `${theme}-03-chip-hover-color`, { greyscale: false });
    await shoot(page, `${theme}-03-chip-hover-grey`, { greyscale: true });
    await page.mouse.move(0, 0);

    // Backlog drawer, expanded.
    await page.getByTestId("backlog-toggle").click();
    await page.getByTestId("backlog-expanded").waitFor();
    await shoot(page, `${theme}-04-backlog-color`, { greyscale: false });
    await shoot(page, `${theme}-04-backlog-grey`, { greyscale: true });
    await page.keyboard.press("Escape");

    // Platform filter, one tab selected (comic-tab active state, T050).
    const tiktokTab = page.getByTestId("platform-filter-tiktok");
    if (await tiktokTab.count()) {
      await tiktokTab.click();
      await shoot(page, `${theme}-05-filter-color`, { greyscale: false });
      await shoot(page, `${theme}-05-filter-grey`, { greyscale: true });
      await page.getByTestId("platform-filter-all").click();
    }

    // Nav drawer (red left border, T053).
    await page.getByTestId("nav-drawer-trigger").click();
    await page.getByTestId("nav-drawer-panel").waitFor();
    await shoot(page, `${theme}-06-navdrawer-color`, { greyscale: false });
    await shoot(page, `${theme}-06-navdrawer-grey`, { greyscale: true });
    await page.keyboard.press("Escape");

    await context.close();
  }

  await browser.close();
  console.log(`Screenshots written to ${OUT}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
