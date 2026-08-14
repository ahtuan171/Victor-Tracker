import type { Metadata } from "next";

import { LoginForm } from "./login-form";

/**
 * The sign-in screen (T025, FR-001, FR-002).
 *
 * A server component that renders one client component, for two reasons. `metadata` cannot be
 * exported from a `"use client"` module, and keeping the route's own file on the server means
 * nothing here can accidentally reach for `lib/session.ts` — which reads non-`NEXT_PUBLIC_`
 * variables and must never end up in a client bundle.
 *
 * There is deliberately **no session check here**. A signed-in creator opening `/login` sees the
 * form, and signing in again is harmless. Redirecting them away is a behaviour the spec does not
 * ask for, and `/` (T026) is what owns "where does a signed-in creator belong".
 */
export const metadata: Metadata = {
  title: "Sign in · Victor Tracker",
};

export default function LoginPage() {
  return <LoginForm />;
}
