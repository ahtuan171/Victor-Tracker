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
  testDir: "./tests/e2e",
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
      name: "mobile-375",
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
