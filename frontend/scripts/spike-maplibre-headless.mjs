/**
 * Iteration-003 pre-planning spike: does MapLibre GL JS actually render tiles under headless
 * Playwright, not just report a WebGL context that exists?
 *
 * frontend/AGENTS.md already records that headless Chromium here has a WebGL 2 context that
 * genuinely paints (2026-08-05, e45510d) -- that was a raw `getContext("webgl2")` probe, before
 * MapLibre existed in this repo. It answered "does the canvas paint at all", not "does MapLibre's
 * actual pipeline -- style parsing, tile fetch, sprite/glyph loading, compositing -- work here".
 * This spike answers that second question: it loads a real MapLibre map against CARTO's free dark
 * basemap (tech-defaults.md's "The map" section) at the product's 375x667 floor, in both headless
 * and headed Chromium, and reads pixels back rather than trusting the `load`/`idle` events alone --
 * the prior probe's whole point was that a context can report fine and still paint nothing.
 *
 * Not a Playwright test file: nothing here is asserted against a suite. It is a one-off answer to
 * a planning question, same pattern as scripts/t043-greyscale.mjs and scripts/t072-walk.mjs.
 *
 * Usage (from frontend/): node scripts/spike-maplibre-headless.mjs
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // frontend/

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const filePath = path.join(ROOT, urlPath);
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/scripts/spike-maplibre.html`;

async function samplePixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#map canvas");
    if (!c) return null;
    const off = document.createElement("canvas");
    off.width = c.width;
    off.height = c.height;
    const ctx = off.getContext("2d");
    ctx.drawImage(c, 0, 0);
    const points = [
      [Math.floor(c.width / 2), Math.floor(c.height / 2)],
      [Math.floor(c.width / 4), Math.floor(c.height / 4)],
      [Math.floor((c.width * 3) / 4), Math.floor((c.height * 3) / 4)],
    ];
    return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
  });
}

async function run(headless) {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });

  const tileRequests = [];
  page.on("request", (req) => {
    if (/cartocdn\.com/.test(req.url())) tileRequests.push(req.url());
  });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(url);

  const eventResult = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          const events = window.__spike?.events ?? [];
          if (events.includes("idle") || Date.now() - start > 15000) {
            resolve({ events, timedOut: !events.includes("idle") });
          } else {
            setTimeout(check, 200);
          }
        };
        check();
      }),
  );

  const pixels = await samplePixels(page);
  const attributionText = await page.evaluate(() => {
    const el = document.querySelector(".maplibregl-ctrl-attrib");
    return el ? el.textContent : null;
  });
  const canvasSize = await page.evaluate(() => {
    const c = document.querySelector("#map canvas");
    return c ? { width: c.width, height: c.height } : null;
  });

  const screenshotPath = path.join(__dirname, `spike-maplibre-${headless ? "headless" : "headed"}.png`);
  await page.screenshot({ path: screenshotPath });

  await browser.close();

  return {
    mode: headless ? "headless" : "headed",
    ...eventResult,
    canvasSize,
    pixels,
    pixelsVary: pixels ? new Set(pixels.map((p) => p.join(","))).size > 1 : false,
    tileRequestCount: tileRequests.length,
    sampleTileRequest: tileRequests[0] ?? null,
    attributionPresent: !!attributionText,
    attributionText,
    consoleErrors,
    screenshotPath,
  };
}

const results = { headless: await run(true), headed: await run(false) };
server.close();

writeFileSync(path.join(__dirname, "spike-maplibre-results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
