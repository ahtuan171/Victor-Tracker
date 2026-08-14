import type { Metadata } from "next";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CalendarShell } from "@/components/calendar/CalendarShell";
import { hasSessionCookie, sessionCookieName } from "@/lib/session";

/**
 * The calendar surface (T033) — and **T027's deferred second half** (FR-002, SC-006).
 *
 * A server component rendering one client component, the same split `/login` uses. R-007 puts the
 * item state in a client component; this file stays on the server so it can do the thing a client
 * component structurally cannot.
 *
 * ## The re-assert, and why a layout was not enough
 *
 * `app/(app)/layout.tsx` already guards this group. T027 recorded that as insufficient on its own and
 * deferred the remainder here, because **App Router layouts are not re-executed on soft
 * navigations**: once the app is open, a client-side route change within `(app)` reuses the layout's
 * result, so a session that dies mid-visit would leave the creator moving between surfaces on a
 * credential that was checked when the tab was opened. Page segments *are* re-fetched on a soft
 * navigation, which is precisely why the second check belongs in this file and not in another layout.
 *
 * The check is deliberately identical to the layout's, through the same `hasSessionCookie` helper
 * rather than a second inline reading of the cookie — one definition of "is there a session", and
 * `tests/proxy/session.spec.ts` covers it continuously. It is still a **presence** check, never a
 * validity one: the signing secret never leaves Render (research.md R-001), so nothing on Vercel can
 * tell a live token from a dead one. Expiry is caught by the backend rejecting the bearer, surfacing
 * as the 401 `lib/api.ts` turns into a redirect. The two layers catch different failures and neither
 * is sufficient alone.
 *
 * Placing it here also satisfies SC-006 the strong way: the redirect happens before any markup
 * exists, so there is no calendar in the HTML for View Source to find (quickstart V1).
 *
 * `tests/e2e/session-guard.spec.ts` was written in full at T027 and skipped, because a route group's
 * layout does not execute with no page inside it. This file is that page, so those four tests are
 * switched on in the same commit.
 */
export const metadata: Metadata = {
  title: "Calendar · Victor Tracker",
};

export default async function CalendarPage() {
  const store = await cookies();

  if (!hasSessionCookie(store.get(sessionCookieName())?.value)) {
    redirect("/login");
  }

  return <CalendarShell />;
}
