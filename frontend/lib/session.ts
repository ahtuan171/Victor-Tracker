/**
 * The session cookie's one definition (research.md R-001, R-002).
 *
 * The JWT lives in an `httpOnly; Secure; SameSite=Lax` cookie on the Vercel origin. Every attribute
 * below is load-bearing, and one of them has bitten this project's design before it was written:
 * a cookie with no `Max-Age` is a *session* cookie, which mobile Safari discards when it evicts the
 * tab — a 30-day token would still have produced a weekly login prompt, and it would have looked
 * like a token bug.
 *
 * Server-side only. Nothing here is `NEXT_PUBLIC_`, so a client component importing it would read
 * `undefined` from every variable and silently fall back. The `server-only` package would turn that
 * into a build error, but its default export throws the moment it is imported outside a React
 * Server Component — including from the Playwright runner — which would make `maxAgeFromToken`
 * untestable. Convention plus the tests below, rather than a guard that costs the tests.
 */

/** Matches `.env.example` and the `frontend` service in docker-compose.yml. */
const DEFAULT_COOKIE_NAME = "ch_session";

/**
 * Used only when a token carries no readable `exp`, which would be a backend contract violation.
 * Mirrors `TOKEN_TTL_DAYS` in `.env.example`, but nothing depends on the two matching — see
 * `maxAgeFromToken`.
 */
const FALLBACK_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME ?? DEFAULT_COOKIE_NAME;
}

/**
 * Whether a session cookie value represents a session at all.
 *
 * **This is a presence check, not an authorisation check, and the difference is the design.** The
 * JWT's signing secret lives on Render and deliberately never reaches Vercel (research.md R-001),
 * so nothing on this side can tell a valid token from an expired or forged one. What this answers
 * is the cheap question — "is there something to try?" — and the expensive one stays where the
 * secret is. A present-but-dead cookie routes the creator to a page whose data load takes a 401,
 * whose handler in `lib/api.ts` sends them to `/login` while the proxy clears the cookie on the
 * way past. Guessing wrong costs one redirect and renders no content.
 *
 * The value matters, not merely the name: `cookies().has()` is true for an empty cookie, and an
 * empty session cookie is not a session.
 *
 * Two callers by design — the root route (T026) and the session guard (T027) — with a third
 * arriving at T033, where the calendar page re-asserts the guard in its own data load.
 */
export function hasSessionCookie(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Where the proxy forwards to. Read at call time, not at module load: the value is a runtime
 * concern on both Vercel and Render, and a module-level read invites it being captured at build.
 *
 * Unset is fatal in production and defaults to the docker-compose backend otherwise, so `pnpm dev`
 * and the Playwright web server need no local .env while a missing Vercel variable still fails
 * loudly instead of quietly proxying to nowhere.
 */
export function apiBaseUrl(): string {
  const configured = process.env.API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error("API_BASE_URL is not set. The proxy has nowhere to forward to.");
  }
  return "http://localhost:8000";
}

/**
 * `Secure` is on unless explicitly disabled, and local development is what disables it — a Secure
 * cookie is simply not stored over plain http://localhost, and the symptom is a login that appears
 * to succeed and then bounces straight back to /login.
 */
function cookieSecure(): boolean {
  const configured = process.env.SESSION_COOKIE_SECURE?.trim();
  if (configured) return configured.toLowerCase() === "true";
  return process.env.NODE_ENV === "production";
}

export interface SessionCookieAttributes {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

export function sessionCookieAttributes(maxAge: number): SessionCookieAttributes {
  return {
    // XSS anywhere in the app must not be able to read a 30-day credential (R-001).
    httpOnly: true,
    secure: cookieSecure(),
    // First-party, so Lax neutralises CSRF without a double-submit token.
    sameSite: "lax",
    // The session guard at T027 runs on every route, so the cookie has to be sent on every route.
    path: "/",
    maxAge,
  };
}

/**
 * How long the cookie should live, taken from the token's own `exp` claim.
 *
 * Deriving it removes a constant that would otherwise have to be kept equal to the backend's
 * `TOKEN_TTL_DAYS` across two deployments with no mechanism to notice when they drift. Cookie and
 * token then expire together by construction rather than by agreement.
 *
 * **The signature is deliberately not verified, and that is safe here.** The value decides a cookie
 * lifetime and nothing else; the backend remains the only authority on whether a token is valid,
 * and a forged `exp` buys an attacker a cookie that dies at a time of their choosing. Verifying
 * would mean shipping the signing secret to Vercel to learn a number we already trust the browser
 * to forget.
 */
export function maxAgeFromToken(token: string): number {
  const exp = decodeJwtPayload(token)?.["exp"];

  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    console.warn(
      "[proxy] access token carries no numeric exp claim; falling back to the documented 30-day Max-Age",
    );
    return FALLBACK_MAX_AGE_SECONDS;
  }

  // Negative clamps to 0, which tells the browser to drop the cookie now. An already-expired token
  // is worth exactly as much as no token, and keeping it invites a confusing 401 on the next load.
  return Math.max(0, Math.floor(exp - Date.now() / 1000));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split(".")[1];
  if (segment === undefined || segment === "") return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
