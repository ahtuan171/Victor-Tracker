import { defineConfig, devices } from "@playwright/test";

/**
 * One E2E flow, run on a phone.
 *
 * 375px is the design width and a hard floor (constitution principle I, FR-021, SC-003), so it is
 * the default and only project rather than an extra matrix entry. A suite whose default is a
 * desktop viewport would pass on layouts the creator cannot use.
 *
 * The flow this configures is T057: capture an idea, assign a platform, set a date, advance to
 * posted, verify it on the calendar — driven through the tap path. Drag is deliberately not
 * automated (research.md R-003): drag automation is the flakiest thing in a browser suite, the
 * suite gates merges, and a flaky gate gets switched off. SC-011's drag half is validated by hand
 * via quickstart V4.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,

  // A committed `test.only` silently shrinks the merge gate to one test.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Serial in CI; locally Playwright's own default. Spread rather than `workers: undefined` —
  // exactOptionalPropertyTypes (tsconfig, T005) makes "absent" and "explicitly undefined" different
  // types, and this option only accepts the former.
  ...(process.env.CI ? { workers: 1 } : {}),

  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      // Contract assertions, not browser flows: tests/contract reads specs/ from disk and touches
      // no page fixture, so no browser launches for it. It lives in this config rather than a
      // second one because .gitlab-ci.yml's test:e2e job runs `playwright test` with no --project
      // filter — a separate config would be a merge gate nobody invokes.
      //
      // Cost of that choice: `webServer` below is global, so even `--project=contract` alone boots
      // a Next server it never calls. Cheap, and worth it for the gate.
      name: "contract",
      testDir: "./tests/contract",
    },
    {
      // The proxy driven directly with a stubbed upstream. Also browserless: it imports the route
      // handler and calls it, because what it asserts — a stripped header, a cookie attribute, a
      // credential absent from a body — is invisible from the browser side of the boundary.
      name: "proxy",
      testDir: "./tests/proxy",
      // These mutate process.env for the whole worker, so they must not interleave.
      fullyParallel: false,
      workers: 1,
    },
    {
      // `lib/api.ts` driven against a stubbed `fetch`. Browserless for the same reason as the
      // proxy project: what it asserts — a same-origin URL, an absent Authorization header, an
      // error mapped to one type — is a property of the request, not of a rendered page.
      name: "client",
      testDir: "./tests/client",
      // The stub replaces `globalThis.fetch` for the worker, so these must not interleave.
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "mobile-375",
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Chrome"],
        // Explicit rather than a named device preset: the number is the requirement, and a preset
        // could change it in a Playwright upgrade.
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],

  webServer: {
    // A non-default port so a dev server already running on 3000 is neither hijacked nor clashed
    // with. Locally an existing server on this port is reused; CI always starts its own.
    //
    // CI runs the production server, not the dev one: the merge gate should exercise the bundle
    // that actually ships. The .gitlab-ci.yml e2e job runs `pnpm build` first.
    command: `${process.env.CI ? "pnpm start" : "pnpm dev"} --port ${PORT} --hostname 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
