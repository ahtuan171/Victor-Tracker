import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasSessionCookie, sessionCookieName } from "@/lib/session";

/**
 * The session guard for every signed-in surface (T027, FR-002, SC-006).
 *
 * `(app)` is a route group, so it adds nothing to any URL — its only job is to put one server-side
 * check in front of every route that shows content. Anything that renders a content item belongs
 * inside it; `/login` deliberately does not.
 *
 * **The guard runs before its children render, and that is what FR-002 asks for.** SC-006 requires
 * a signed-out visitor to receive *no content data* at any address, which is stronger than "no
 * content on screen": a page that server-rendered a calendar and then hid it would put the data in
 * the HTML, where View Source finds it (quickstart V1). Redirecting from the layout means the
 * markup is never generated.
 *
 * This is still a presence check, not a validity check — see `hasSessionCookie`. The layout cannot
 * verify a token because the signing secret never leaves Render (research.md R-001). The layering
 * is deliberate: this stops the *unauthenticated* case before any render, and the *expired* case is
 * caught by the backend rejecting the bearer, surfacing as the 401 that `lib/api.ts` turns into a
 * redirect. Neither half is sufficient alone.
 *
 * ---
 *
 * **A layout is not sufficient on its own, and T033 carries the other half.** App Router layouts
 * are not re-executed on soft navigations, so a client-side route change within `(app)` does not
 * re-read the cookie — a session that dies while the app is open would leave the creator moving
 * between month and week views on a layout that checked their credential ten minutes ago. The
 * calendar page therefore re-asserts the guard in its own data load (T033). That is recorded as an
 * amendment under Phase 2 in `tasks.md`, not left implicit here.
 *
 * **Nothing lives in this group until T033**, and a route group's layout does not execute with no
 * page inside it — so this file ships with its wiring exercised once by hand rather than
 * continuously. `tests/e2e/session-guard.spec.ts` holds the tests, fully written and skipped, with
 * the one-line change T033 makes to switch them on.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();

  if (!hasSessionCookie(store.get(sessionCookieName())?.value)) {
    // No `return` needed — `redirect` throws — but no children are rendered either way, which is
    // the property SC-006 actually cares about.
    redirect("/login");
  }

  return children;
}
