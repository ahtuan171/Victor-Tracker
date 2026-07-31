import { expect, test } from "@playwright/test";

/**
 * The `(app)` session guard (T027, FR-002, SC-006, quickstart V1).
 *
 * ---
 *
 * ## Why this whole file is skipped, and the exact change that switches it on
 *
 * The guard lives in `app/(app)/layout.tsx`. A route group's layout **does not execute when no page
 * exists inside the group**, and the first route to live in `(app)` is the calendar page at T033.
 * So in Phase 2 there is nothing to navigate to and nothing to assert against — not because the
 * guard is untested by choice, but because the surface it guards has not been built, and building
 * it early is exactly what "nothing outside the current phase gets built" forbids.
 *
 * These tests are therefore written in full and skipped, rather than described in a comment
 * somewhere and written later. **At T033, one edit switches them on**: change `test.describe.skip(`
 * below to `test.describe(`. `GUARDED_PATH` is already the address T033 creates.
 *
 * ## They are not unverified in the meantime
 *
 * Two of the three things this file covers are already exercised continuously elsewhere:
 * `hasSessionCookie` — the actual decision — is unit-tested in `tests/proxy/session.spec.ts`, and
 * the identical cookie-reading path is covered end to end by `tests/e2e/root-redirect.spec.ts`,
 * because `app/page.tsx` reads the same cookie through the same two helpers.
 *
 * What was *not* covered is the wiring: that a route group layout actually runs, and runs before
 * its children. That was verified once by hand at T027 by standing up a throwaway page inside
 * `(app)`, running this file un-skipped, and removing the page — recorded in `.claude/build-log.md`
 * so the evidence is not just this sentence. It is one-time evidence rather than a standing gate,
 * which is precisely why the tests are left here ready to run instead of deleted.
 */

/** The first route to live inside `(app)`, created at T033. Does not exist yet. */
const GUARDED_PATH = "/calendar";

/** Matches `sessionCookieName()`'s default and `.env.example`. Unset in the test environment. */
const SESSION_COOKIE = "ch_session";

test.describe.skip("the (app) session guard", () => {
  test("a signed-out visitor is redirected to /login", async ({ page }) => {
    await page.goto(GUARDED_PATH);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("no content markup reaches a signed-out visitor (SC-006)", async ({ request }) => {
    const response = await request.get(GUARDED_PATH, { maxRedirects: 0 });

    // SC-006 is stronger than "no content on screen": a layout that rendered its children and then
    // hid them would put the data in the HTML, where quickstart V1's View Source step finds it.
    // A 3xx is generated instead of markup, so there is nothing to find.
    expect([302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/login");
  });

  test("an empty session cookie does not pass the guard", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: SESSION_COOKIE, value: "", url: baseURL! }]);

    await page.goto(GUARDED_PATH);

    // `cookies().has()` would let this through. `hasSessionCookie` checks the value.
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("a visitor holding a session cookie reaches the page", async ({ page, context, baseURL }) => {
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        // Not a real JWT, and it does not need to be: the guard is a presence check, because the
        // signing secret never leaves Render (R-001). A test that minted a valid token would be
        // asserting something this layout does not do.
        value: "any-non-empty-value",
        url: baseURL!,
      },
    ]);

    const response = await page.goto(GUARDED_PATH);

    // The status matters as much as the path, and this is not hypothetical: during T027's one-time
    // verification the throwaway route was briefly named `__probe`, which App Router treats as a
    // *private folder* and excludes from routing. It 404'd, the layout never ran — and a
    // path-only assertion passed anyway, because a 404 leaves the browser at the address it asked
    // for. Asserting 200 is what turns "did not redirect" into "actually rendered".
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(GUARDED_PATH);
  });
});
