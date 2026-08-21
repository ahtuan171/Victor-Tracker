import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasSessionCookie, sessionCookieName } from "@/lib/session";

/**
 * The root route (T026, SC-001, US1 scenario 1).
 *
 * `/` is what gets bookmarked and what gets typed, and it has no content of its own — so it decides
 * where the creator belongs and sends them there before any markup exists. Signed in goes to the
 * travel map; everyone else goes to sign in. Without this the bookmarked root is a 404, which is
 * how the post-review pass found it.
 *
 * **Was `/calendar` until 2026-08-21**, when the product pivoted fully to the travel tracker and
 * Content Calendar was taken out of navigation (`NavDrawer.tsx`'s `SCREENS` list) — sending a
 * bookmarked root to a surface nothing else links to any more would have been the one entry point
 * that missed the change. Content Calendar's own route, backend and tests are untouched.
 *
 * **The cookie's presence is a routing hint, not an authorisation decision** — see
 * `hasSessionCookie` in `lib/session.ts` for why this side cannot do better, and why it does not
 * need to. FR-002 is enforced by the backend rejecting the bearer, never by this line.
 *
 * Both helpers come from `lib/session.ts` rather than being written out here: it is the same module
 * the proxy names the cookie with, so the two cannot drift. This is a server component, so that
 * import is correct.
 */

/**
 * Reading a cookie already opts this route out of static rendering, so this is belt-and-braces —
 * but the failure it guards against is silent and total. A prerendered `/` would bake one answer
 * into the bundle and send every visitor to the same place forever.
 */
export const dynamic = "force-dynamic";

export default async function RootPage(): Promise<never> {
  const store = await cookies();

  const signedIn = hasSessionCookie(store.get(sessionCookieName())?.value);

  // `redirect` throws, which is why this returns `never` and why nothing follows it.
  redirect(signedIn ? "/map" : "/login");
}
