"use client";

import { useState } from "react";

import { ApiError, login } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Where a signed-in creator lands (SC-001's "landing screen").
 *
 * `/calendar` does not exist until T033, so between T026 and then this is honestly a 404 — recorded
 * as an intended intermediate state in tasks.md's Phase 2 amendment note, and explicitly not a
 * reason to build the calendar page early.
 */
const LANDING_PATH = "/calendar";

/**
 * The error region's id, referenced by both fields through `aria-describedby`.
 *
 * Next.js renders its own `role="alert"` route announcer into every page, so "the alert on this
 * page" is ambiguous to a screen reader and to a test locator alike. Tying the message to the
 * inputs it describes resolves both at once.
 */
const ERROR_ID = "login-error";

/**
 * The sign-in form.
 *
 * Three things about this component follow from decisions taken at T022–T024, and each of them
 * looks like an omission if you do not know why:
 *
 *   1. **Success stores nothing.** `login()` resolves to `{expires_at}` and no token — the session
 *      cookie was already set by the proxy on that very response, and it is `httpOnly`, so there is
 *      nothing here that could read or keep it (research.md R-001). Navigate and stop.
 *   2. **This form renders its own error.** `lib/api.ts` redirects to `/login` on a 401 for every
 *      operation *except* `/auth/login` and `/auth/logout`, precisely so that a wrong password
 *      lands here as a thrown `ApiError` instead of silently reloading the page and discarding the
 *      message. If a bad password ever starts reloading this page, that exemption was removed —
 *      restore it rather than working around it here.
 *   3. **Navigation is a full page load, not `router.push`.** The T027 guard is a server component,
 *      and Next's Router Cache can replay a previously fetched RSC payload for `/calendar` — which,
 *      on the common "deep link → bounced to /login → sign in" path, is the *redirect back to
 *      login*. A soft navigation would bounce the creator straight back to this form with correct
 *      credentials and no error to show. `replace` rather than `assign` keeps `/login` out of
 *      history, since going back to it after signing in is never what was meant.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      await login({ email, password });
      // Deliberately not clearing `pending`: the navigation below is asynchronous, and re-enabling
      // the button for the moment before the page swaps invites a second submit.
      window.location.replace(LANDING_PATH);
    } catch (caught) {
      // `ApiError.detail` is safe to render verbatim — the contract makes every error body
      // `{"detail": "<string>"}` and the backend flattens FastAPI's validation array into one, so
      // this never shows `[object Object]`. A network failure arrives here as status 0 carrying a
      // sentence of its own.
      setError(
        caught instanceof ApiError ? caught.detail : "Something went wrong. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    // `justify-end` is the mobile-first rule, not a style choice: at 375x667 it puts the submit
    // button in the bottom third, within one-handed thumb reach (constitution I, design.md). The
    // `sm:` centring is the desktop enhancement, in that order and not the reverse.
    <main className="flex flex-1 flex-col justify-end px-6 pt-16 pb-10 sm:justify-center">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight">CreatorHub</h1>
        <p className="text-muted-foreground mt-2 text-base">Sign in to your content calendar.</p>

        {/* Native validation is left on: `required` plus `type="email"` is free, localised, and
            already the behaviour a phone browser gives. The backend still validates. */}
        <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              // Every one of these matters on a phone: the right keyboard, no capitalisation of an
              // address, and a password manager that recognises the pair.
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              // 44px. Every shadcn size variant is desktop-scaled — even `lg` is 36px — which is
              // below the minimum comfortable tap target. `text-base` is kept from the primitive
              // for a second reason: iOS zooms the page in on focusing any input under 16px.
              className="h-11 text-base"
              aria-invalid={error !== null}
              aria-describedby={error !== null ? ERROR_ID : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-11 text-base"
              aria-invalid={error !== null}
              aria-describedby={error !== null ? ERROR_ID : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
          </div>

          {/*
            `role="alert"` so the failure is announced rather than only drawn — a wrong password is
            the one thing this screen exists to communicate. Rendered only when set, so the layout
            does not reserve a gap for a message that is usually absent.
          */}
          {error !== null && (
            <p id={ERROR_ID} role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-1 h-12 w-full text-base" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
