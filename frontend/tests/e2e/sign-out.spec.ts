import { expect, test, type Page } from "@playwright/test";

/**
 * Sign-out (T077, FR-002a), at the 375x667 floor.
 *
 * **This surface exists because a checkpoint found a requirement with no product behind it.** The
 * Phase 7 checkpoint's finding C1: FR-002a says a session "MUST end only on expiry or an explicit
 * sign-out", the backend route has existed since T014, `lib/api.ts` has exported `logout()` since
 * T023 and the proxy has cleared the cookie on the way back since T021 — and for 76 tasks nothing
 * called any of it. Citation-based coverage read 100% because FR-002a *is* cited: by T018, a backend
 * test. So the assertions here are deliberately about the **surface**, which is the half that was
 * missing; the transport underneath is covered by `tests/client/api.spec.ts` and
 * `backend/tests/test_auth.py`.
 *
 * The proxy is stubbed, as in every other file here — CI runs the production bundle with no FastAPI
 * behind it. What that costs is stated in `.claude/memory.md`: a green run says nothing about the
 * browser → proxy → FastAPI → Postgres seam, which is why quickstart V1.4 and V8.1 walk it by hand.
 */

const SESSION_COOKIE = "ch_session";

async function signedIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "stub-session", url: baseURL! }]);
}

/**
 * Open the calendar with an empty list.
 *
 * The item list is irrelevant to signing out, and an empty one keeps the first-run copy (T068) out
 * of the way of the header this file is about.
 */
async function openCalendar(page: Page, baseURL: string | undefined): Promise<void> {
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await signedIn(page, baseURL);
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();
}

/**
 * Stub `POST /api/auth/logout` and record every call.
 *
 * The real proxy also clears the session cookie on the way back, which a `route.fulfill` cannot do.
 * Where that matters — the creator must not be bounced straight back in — the test clears the cookie
 * itself and says so.
 */
function stubLogout(
  page: Page,
  status = 204,
): { readonly calls: { method: string }[] } {
  const calls: { method: string }[] = [];

  void page.route("**/api/auth/logout", async (route) => {
    calls.push({ method: route.request().method() });
    await route.fulfill({
      status,
      contentType: "application/json",
      body: status === 204 ? "" : JSON.stringify({ detail: "nope" }),
    });
  });

  return { calls };
}

test("the calendar carries a sign-out control", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  await expect(page.getByTestId("sign-out-action")).toBeVisible();
  // A label rather than a bare glyph: it is the one control in the product whose mis-tap costs the
  // creator their session, and every other control here is a written word.
  await expect(page.getByTestId("sign-out-action")).toHaveAccessibleName(/sign out/i);
});

test("signing out ends the session and lands on the login page", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);
  const logout = stubLogout(page);

  await page.getByTestId("sign-out-action").click();

  await page.waitForURL("**/login");
  // The request is asserted, not just the navigation. Navigating to `/login` while leaving the
  // session alive is precisely the failure FR-002a describes — and it looks identical from the
  // address bar.
  expect(logout.calls).toEqual([{ method: "POST" }]);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signing out of an already-dead session still reaches the login page", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);
  const logout = stubLogout(page, 401);

  await page.getByTestId("sign-out-action").click();

  // `logout()` is the one operation in `lib/api.ts` that swallows a 401, and this is the case it was
  // written for: the proxy clears the cookie on any 401, so by the time the client sees one the
  // session is genuinely over — which is where sign-out was going. Rethrowing would strand the
  // creator on a calendar backed by a credential that no longer exists.
  await page.waitForURL("**/login");
  expect(logout.calls).toEqual([{ method: "POST" }]);
});

test("a refused sign-out keeps the creator on the calendar and says so", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);
  stubLogout(page, 500);

  await page.getByTestId("sign-out-action").click();

  // The honest outcome, and the reason this branch exists at all: only the proxy can clear an
  // httpOnly cookie, so a refused logout leaves the session **alive**. Navigating to `/login`
  // anyway would report an ending that did not happen — FR-002a's "ends only on ... an explicit
  // sign-out" read backwards.
  await expect(page.getByTestId("sign-out-message")).toHaveText(/could not sign you out/i);
  expect(new URL(page.url()).pathname).toBe("/calendar");
  // Still offered, because the creator's next move is to try again.
  await expect(page.getByTestId("sign-out-action")).toBeEnabled();
});

test("sign-out is not in the action band, and the band still fits", async ({ page, baseURL }) => {
  await openCalendar(page, baseURL);

  const viewport = page.viewportSize()!;
  const signOut = (await page.getByTestId("sign-out-action").boundingBox())!;
  const capture = (await page.getByTestId("capture-action").boundingBox())!;

  // **A measurement, not a preference.** The action band holds the view toggle, two arrows and
  // `+ CAPTURE`: 300px of content plus 24px of gaps plus 32px of padding = 356px of the 375px floor,
  // leaving 19px. A 44px target and its gap need 50px. T077's task line said "action band" and was
  // amended for this reason — putting it there means breaking either the tap floor
  // (`.claude/rules/design.md`) or FR-021, and FR-022 asks thumb reach for the actions the creator
  // performs *frequently* — "capture, status change, date change" — which sign-out is not.
  expect(signOut.y + signOut.height).toBeLessThan(capture.y);
  expect(capture.x + capture.width).toBeLessThanOrEqual(viewport.width);
});

test("the sign-out control meets the 44px tap floor and does not overflow", async ({
  page,
  baseURL,
}) => {
  await openCalendar(page, baseURL);

  const viewport = page.viewportSize()!;
  const box = (await page.getByTestId("sign-out-action").boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the header still fits its longest period title beside the sign-out control", async ({
  page,
  baseURL,
}) => {
  await signedIn(page, baseURL);
  await page.route("**/api/content-items*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // The same worst case `period-nav.spec.ts` pins: 31 December 2026 is a Thursday, so its week is
  // `28 Dec 2026 – 3 Jan 2027`, the longest title this product can produce. That test predates the
  // sign-out control; this one is here because the control took width out of the same row, and the
  // header is the band with the least slack after the action bar.
  await page.clock.setFixedTime(Date.UTC(2026, 11, 31, 3, 0, 0));
  await page.goto("/calendar");
  await page.getByTestId("capture-action").waitFor();
  await page.getByTestId("view-week").click();
  await expect(page.getByTestId("calendar-period")).toHaveText("28 Dec 2026 – 3 Jan 2027");

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);

  const title = (await page.getByTestId("calendar-period").boundingBox())!;
  const signOut = (await page.getByTestId("sign-out-action").boundingBox())!;
  // Adjacent, not overlapping — an overflow-hidden title that had been silently clipped would still
  // satisfy the scroll check above.
  expect(title.x + title.width).toBeLessThanOrEqual(signOut.x);
});
