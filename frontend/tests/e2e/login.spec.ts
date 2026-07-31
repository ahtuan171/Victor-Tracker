import { expect, test, type Page } from "@playwright/test";

/**
 * The login page (T025), driven at the 375x667 design floor.
 *
 * **The proxy is stubbed, and it has to be.** `.gitlab-ci.yml`'s `test:e2e` job runs the production
 * bundle with no FastAPI and no Postgres behind it, so a test that performed a real sign-in would
 * be green only on a developer's machine — the exact "verified locally, red in CI" failure this
 * project has already paid for three times. What is under test here is the *page*: what it renders,
 * what it sends, where it goes. The proxy itself is covered by `tests/proxy/`, against its own stub.
 *
 * Note what the stub therefore cannot prove: that a real 401 from FastAPI carries a `detail`, or
 * that the cookie is actually set. Both are covered elsewhere — `backend/tests/test_auth.py` and
 * `tests/proxy/route.spec.ts` respectively — and the seam between them is what quickstart V1 walks
 * by hand.
 */

const LOGIN_RESPONSE = { expires_at: "2026-08-30T09:00:00Z" };

/** Stub `POST /api/auth/login` with a given status and body, and record what the page sent. */
async function stubLogin(
  page: Page,
  status: number,
  body: unknown,
): Promise<{ requests: unknown[] }> {
  const requests: unknown[] = [];

  await page.route("**/api/auth/login", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  return { requests };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("the page body does not scroll horizontally at 375px", async ({ page }) => {
  await page.goto("/login");

  // Constitution principle I and design.md: wide content scrolls inside its own container, the body
  // never does. Asserted on the element that actually overflows rather than by eyeballing a
  // screenshot.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the submit button sits in the bottom half, within thumb reach", async ({ page }) => {
  await page.goto("/login");

  const button = page.getByRole("button", { name: /sign in/i });
  const box = await button.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  // design.md: "Primary actions sit within thumb reach — bottom half of the screen, not a top-right
  // toolbar." That is a structural requirement, so it gets an assertion rather than a code review.
  expect(box!.y).toBeGreaterThan(viewport!.height / 2);
});

test("both fields clear the 44px minimum tap target", async ({ page }) => {
  await page.goto("/login");

  for (const label of ["Email", "Password"]) {
    const box = await page.getByLabel(label).boundingBox();
    expect(box).not.toBeNull();
    // Every shadcn size variant is desktop-scaled (`lg` is 36px), so this is an override that a
    // future refactor could silently drop.
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("a wrong password renders the error and stays on /login", async ({ page }) => {
  await stubLogin(page, 401, { detail: "Incorrect email or password." });

  await page.goto("/login");
  await signIn(page, "creator@example.com", "wrong");

  // The load-bearing half of T024's exemption list, asserted end to end: `lib/api.ts` redirects to
  // /login on a 401 for every operation *except* the two /auth/* ones. Remove that exemption and
  // this page reloads itself, discarding the message — so this test is what stops it being removed.
  await expect(page.locator("#login-error")).toHaveText("Incorrect email or password.");
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("an unreachable server produces a readable message, not a stack trace", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.abort("failed"));

  await page.goto("/login");
  await signIn(page, "creator@example.com", "hunter2");

  await expect(page.locator("#login-error")).toContainText(/could not reach the server/i);
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("a successful sign-in sends the credentials and leaves for the landing screen", async ({
  page,
}) => {
  const stub = await stubLogin(page, 200, LOGIN_RESPONSE);

  await page.goto("/login");
  await signIn(page, "creator@example.com", "hunter2");

  // `/calendar` does not exist until T033, so this asserts the destination, not a rendered page.
  await page.waitForURL("**/calendar");
  expect(new URL(page.url()).pathname).toBe("/calendar");

  expect(stub.requests).toEqual([{ email: "creator@example.com", password: "hunter2" }]);
});

test("signing in does not put a token anywhere the browser can read", async ({ page }) => {
  await stubLogin(page, 200, { ...LOGIN_RESPONSE, access_token: "leaked.jwt.value" });

  await page.goto("/login");
  await signIn(page, "creator@example.com", "hunter2");
  await page.waitForURL("**/calendar");

  // R-001 in one assertion. The proxy is what strips the token in production; this guards the other
  // end — that the *page* never copies a credential into storage even when handed one. A future
  // "remember the session" change would trip this, which is the point.
  const stored = await page.evaluate(() => ({
    local: JSON.stringify(window.localStorage),
    session: JSON.stringify(window.sessionStorage),
  }));
  expect(stored.local).not.toContain("leaked.jwt.value");
  expect(stored.session).not.toContain("leaked.jwt.value");
});

test("the form cannot be submitted empty", async ({ page }) => {
  const stub = await stubLogin(page, 200, LOGIN_RESPONSE);

  await page.goto("/login");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Native `required` validation blocks it before any request is made.
  expect(stub.requests).toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/login");
});
