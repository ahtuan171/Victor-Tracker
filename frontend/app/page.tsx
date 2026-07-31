import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { sessionCookieName } from "@/lib/session";

/**
 * The root route (T026, SC-001, US1 scenario 1).
 *
 * `/` is what gets bookmarked and what gets typed, and it has no content of its own — so it decides
 * where the creator belongs and sends them there before any markup exists. Signed in goes to the
 * calendar; everyone else goes to sign in. Without this the bookmarked root is a 404, which is how
 * the post-review pass found it.
 *
 * **The cookie's presence is a routing hint, not an authorisation decision, and that distinction is
 * the whole design.** Nothing here validates the token: the signing secret lives on Render and
 * deliberately never reaches Vercel (research.md R-001), so this route could not verify one even if
 * it wanted to. A present-but-expired cookie therefore routes to `/calendar`, whose data load takes
 * a 401, whose handler in `lib/api.ts` returns the creator to `/login` — while the proxy clears the
 * dead cookie on the way past. FR-002 is enforced by the backend rejecting the bearer, never by
 * this line.
 *
 * Guessing wrong is cheap in exactly one direction, which is what makes it safe: a stale cookie
 * costs one redirect, and no content is ever rendered on the strength of it.
 *
 * `lib/session.ts` is imported here rather than hard-coding `"ch_session"`, and this is a server
 * component, so that import is correct — it is the same module the proxy names the cookie with, so
 * the two cannot drift.
 */

/**
 * Reading a cookie already opts this route out of static rendering, so this is belt-and-braces —
 * but the failure it guards against is silent and total. A prerendered `/` would bake one answer
 * into the bundle and send every visitor to the same place forever.
 */
export const dynamic = "force-dynamic";

export default async function RootPage(): Promise<never> {
  const store = await cookies();

  // The value, not merely the name: `has()` is true for an empty cookie, and an empty session
  // cookie is not a session.
  const session = store.get(sessionCookieName())?.value;
  const signedIn = session !== undefined && session.length > 0;

  // `redirect` throws, which is why this returns `never` and why nothing follows it.
  redirect(signedIn ? "/calendar" : "/login");
}
