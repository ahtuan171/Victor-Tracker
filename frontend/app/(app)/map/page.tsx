import type { Metadata } from "next";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MapShell } from "@/components/map/MapShell";
import { hasSessionCookie, sessionCookieName } from "@/lib/session";

/**
 * The map surface (T018, FR-002, SC-006) — the second real screen this product has, and
 * `calendar/page.tsx`'s exact twin in every structural way.
 *
 * The re-assert here is not optional, for the identical reason `calendar/page.tsx`'s own
 * docstring gives: `app/(app)/layout.tsx` guards this route group once, but App Router layouts
 * are not re-executed on soft navigations, so a client-side route change between `/calendar` and
 * `/map` would reuse a credential check from whenever the tab was opened. Page segments *are*
 * re-fetched on a soft navigation, which is why this file carries its own check through the same
 * `hasSessionCookie` helper rather than a second inline cookie read.
 */
export const metadata: Metadata = {
  title: "Travel Map · Victor Tracker",
};

export default async function MapPage() {
  const store = await cookies();

  if (!hasSessionCookie(store.get(sessionCookieName())?.value)) {
    redirect("/login");
  }

  return <MapShell />;
}
