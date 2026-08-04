/**
 * T072 diagnostic - report what is actually on screen at each step against production.
 * ASCII output only.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "https://creator-hub-hazel.vercel.app";
const EMAIL = "ahtuan1701@gmail.com";
const PASSWORD = process.env.SEED_CREATOR_PASSWORD;
const SHOTS = "scripts/t072-shots";
mkdirSync(SHOTS, { recursive: true });

const state = async (page, label) => {
  const s = await page.evaluate(() => {
    const q = (t) => document.querySelector(`[data-testid="${t}"]`);
    const vis = (t) => {
      const el = q(t);
      if (!el) return "absent";
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? "visible" : "hidden";
    };
    return {
      url: location.pathname,
      monthGrid: vis("month-grid"),
      weekList: vis("week-list"),
      firstRun: vis("first-run"),
      captureAction: vis("capture-action"),
      captureSave: vis("capture-save"),
      backlogToggle: vis("backlog-toggle"),
      backlogExpanded: vis("backlog-expanded"),
      backlogScrim: vis("backlog-scrim"),
      backlogRows: document.querySelectorAll('[data-testid="backlog-row"]').length,
      chips: document.querySelectorAll('[data-testid="item-chip"]').length,
      itemSave: vis("item-save"),
      expandedAttr: q("backlog-toggle")?.getAttribute("aria-expanded") ?? "n/a",
    };
  });
  console.log(`-- ${label}: ${JSON.stringify(s)}`);
  await page.screenshot({ path: `${SHOTS}/probe-${label}.png` });
  return s;
};

const main = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") console.log("   [console.error]", m.text().slice(0, 160));
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/calendar", { timeout: 90_000 });
  await page.waitForTimeout(4000);
  await state(page, "01-after-signin");

  // capture with the drawer NOT expanded (the documented trap)
  await page.getByTestId("capture-action").click();
  await page.waitForTimeout(700);
  await state(page, "02-capture-open");

  await page.getByLabel("Title").fill("T072 probe item");
  await page.getByTestId("capture-save").click();
  await page.waitForTimeout(4000);
  await state(page, "03-after-save");

  // now try the drawer
  const toggleBox = await page.getByTestId("backlog-toggle").boundingBox();
  console.log("-- backlog-toggle box:", JSON.stringify(toggleBox));
  const blocker = await page.evaluate((b) => {
    if (!b) return "no box";
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return el ? `${el.tagName}[${el.getAttribute("data-testid") ?? ""}] cls=${String(el.className).slice(0, 60)}` : "none";
  }, toggleBox);
  console.log("-- element at toggle centre:", blocker);

  await page.getByTestId("backlog-toggle").click({ timeout: 10_000 }).catch((e) => console.log("-- toggle click failed:", e.message.split("\n")[0]));
  await page.waitForTimeout(1200);
  await state(page, "04-after-toggle");

  await browser.close();
};

main().catch((e) => {
  console.error("PROBE ABORTED:", e && e.message ? e.message : e);
  process.exit(1);
});
