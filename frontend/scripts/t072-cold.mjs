/**
 * T072 - measure SC-001 against the DEPLOYED environment on a genuine cold start.
 *
 * SC-001: "From the app's landing screen on a phone, a creator can capture a new idea with only a
 * title in under 15 seconds and in no more than 3 interactions." It is a whole-journey budget, not
 * a page-load budget - so the cold start has to fit INSIDE it.
 *
 * The landing screen for a creator with a valid ~30-day session (FR-002a) is /calendar, so that is
 * where the clock starts. Two cold starts stack here: Render's free tier spins down and Neon's
 * auto-suspends (plan.md, T071).
 *
 * ASCII output only.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://creator-hub-hazel.vercel.app";
const SHOTS = "scripts/t072-shots";
mkdirSync(SHOTS, { recursive: true });

// Session cookie from the earlier curl jar, so the clock starts at the landing screen and does not
// include a login the creator would not normally perform.
const jar = readFileSync(process.argv[2], "utf8");
const line = jar.split("\n").find((l) => l.includes("ch_session"));
if (!line) {
  console.error("no ch_session cookie in jar");
  process.exit(1);
}
const value = line.trim().split(/\s+/).pop();

const main = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  await context.addCookies([
    { name: "ch_session", value, domain: "creator-hub-hazel.vercel.app", path: "/", secure: true, httpOnly: true },
  ]);
  const page = await context.newPage();

  const marks = {};
  const t0 = Date.now();
  const since = () => (Date.now() - t0) / 1000;

  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  marks.domcontentloaded = since();

  // The capture control is the first interaction, and it is what SC-001 counts.
  await page.waitForSelector('[data-testid="capture-action"]', { timeout: 120_000 });
  marks.capture_control_ready = since();

  // Wait for the item list to actually arrive - this is the request that crosses both cold starts.
  await page
    .waitForSelector('[data-testid="month-grid"], [data-testid="week-list"], [data-testid="first-run"]', {
      timeout: 120_000,
    })
    .catch(() => {});
  marks.calendar_rendered = since();

  // --- the three interactions SC-001 allows ---
  await page.getByTestId("capture-action").click(); // 1
  await page.getByLabel("Title").fill("T072 cold-start capture"); // 2
  await page.getByTestId("capture-save").click(); // 3
  await page.waitForTimeout(2500);
  marks.captured = since();

  await page.screenshot({ path: `${SHOTS}/cold-after-capture.png` });

  console.log("=== SC-001 on a COLD start (deployed) ===");
  for (const [k, v] of Object.entries(marks)) console.log(`${k.padEnd(24)} ${v.toFixed(2)}s`);
  console.log(`\nSC-001 budget: 15.00s / 3 interactions`);
  console.log(`measured     : ${marks.captured.toFixed(2)}s / 3 interactions`);
  console.log(`VERDICT      : ${marks.captured <= 15 ? "PASS" : "FAIL"}`);

  // Warm comparison, same journey, same browser.
  const t1 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="capture-action"]', { timeout: 60_000 });
  await page.getByTestId("capture-action").click();
  await page.getByLabel("Title").fill("T072 warm-start capture");
  await page.getByTestId("capture-save").click();
  await page.waitForTimeout(2500);
  const warm = (Date.now() - t1) / 1000;
  console.log(`\nsame journey, WARM: ${warm.toFixed(2)}s -> ${warm <= 15 ? "PASS" : "FAIL"}`);
  console.log(`cold-start cost   : ${(marks.captured - warm).toFixed(2)}s`);

  writeFileSync(`${SHOTS}/sc001.json`, JSON.stringify({ marks, warm }, null, 2));
  await browser.close();
};

main().catch((e) => {
  console.error("ABORTED:", e && e.message ? e.message : e);
  process.exit(1);
});
