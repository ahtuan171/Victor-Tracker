/**
 * The `ch_theme` cookie (T032, research.md R-002, data-model.md "The cookie is not part of the data
 * model").
 *
 * **The database row is authoritative; this cookie is a cache with a stated staleness window.** It
 * exists for exactly one reason: `app/layout.tsx` is a server component and has to pick a
 * presentation *before* the document is written, and the account's own value is not knowable there
 * without a database round trip in front of every page load — the one thing R-002 rules out outright,
 * given the cold `/calendar` document already measured 44.18s at T072.
 *
 * Three rules, from R-002, implemented across three call sites:
 *
 *   1. **At sign-in**, the proxy writes this cookie from the login response's `preferences.theme`
 *      (T035) — no code here, but worth stating: this file's job starts *after* that cookie exists.
 *   2. **On a toggle**, the class changes immediately, the cookie is rewritten from the client, and a
 *      `PATCH` follows without being awaited first — `applyTheme` and `writeThemeCookie` below, called
 *      together from `NavDrawer.tsx` (T034).
 *   3. **On app mount**, the account's own value is read once and, if it disagrees with the cookie,
 *      the account wins and the cookie is rewritten — `reconcileTheme` below (T034 wires the call).
 *
 * **Deliberately not httpOnly, and holds nothing but one of two words.** The client writes it on
 * every toggle, so it cannot be httpOnly; principle II is untouched because there is no identifier in
 * it to disclose. This is also why this file may be imported from client code — unlike
 * `lib/session.ts`, which reads non-`NEXT_PUBLIC_` environment variables and would silently fall back
 * if a client bundle pulled it in, nothing here is an environment-dependent secret.
 */

import type { Theme } from "@/lib/api";
import { THEMES } from "@/lib/api";

/** The one name, used server-side (`app/layout.tsx`) and client-side (this file) alike. */
export const THEME_COOKIE_NAME = "ch_theme";

/**
 * A year — long enough that "remembered" (FR-011) does not quietly expire between visits. Exported
 * so `app/api/[...path]/route.ts` writes the exact same lifetime server-side (T035) rather than a
 * second literal that could drift from this one.
 */
export const THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Parse a raw value into a `Theme`, or `null` for anything else — absent, empty, the wrong type, or
 * a value this build no longer recognises (FR-010 fixes the set at exactly two; a third value never
 * becomes a silent third presentation). `unknown` rather than `string | undefined | null` because
 * both call sites hand this a value they have not shape-checked yet: a cookie's raw string, or a
 * JSON body's `preferences.theme` before anything has confirmed it is even a string.
 */
export function parseTheme(value: unknown): Theme | null {
  return THEMES.find((candidate) => candidate === value) ?? null;
}

/** Read `ch_theme` from `document.cookie`. Browser-only; see the file header for why. */
export function readThemeCookie(): Theme | null {
  if (typeof document === "undefined") return null;

  for (const pair of document.cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== THEME_COOKIE_NAME) continue;
    return parseTheme(decodeURIComponent(pair.slice(separator + 1).trim()));
  }
  return null;
}

/**
 * Write `ch_theme` from the client. `Secure` is derived from the page's own protocol rather than an
 * environment variable — `lib/session.ts`'s equivalent cannot be imported here (it would silently
 * read `undefined` in a client bundle), and the protocol the page is actually served over is a more
 * reliable answer than a guess baked in at build time.
 */
export function writeThemeCookie(theme: Theme): void {
  if (typeof document === "undefined") return;

  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; Max-Age=${THEME_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Apply a theme to the document `<html>` element, client-side.
 *
 * Mirrors `app/layout.tsx`'s server-rendered class exactly (`class="dark"` for dark, nothing extra
 * for light) — `:root` already carries the light values, so light is simply the *absence* of `.dark`
 * rather than a second class. Toggling the wrong thing here would fight the class the server already
 * sent down and read as the theme "not sticking" on this one browser.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Step 3 of R-002's mechanism: called once after the app has loaded the account's own preferences.
 * If the account disagrees with what this device's cookie already showed, the account wins — both
 * the visible class and the cookie are corrected to match it.
 *
 * A no-op when they already agree, which is the common case on every load after the first: nothing
 * to re-apply, nothing to rewrite.
 */
export function reconcileTheme(accountTheme: Theme): void {
  if (readThemeCookie() === accountTheme) return;
  applyTheme(accountTheme);
  writeThemeCookie(accountTheme);
}
