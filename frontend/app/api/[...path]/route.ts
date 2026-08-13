import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/proxy-allowlist";
import {
  apiBaseUrl,
  cookieSecure,
  maxAgeFromToken,
  sessionCookieAttributes,
  sessionCookieName,
} from "@/lib/session";
import { THEME_COOKIE_NAME, THEME_MAX_AGE_SECONDS, parseTheme } from "@/lib/theme";
import type { Theme } from "@/lib/api";

/**
 * The credential boundary (research.md R-001, R-002, R-008).
 *
 * The browser never speaks to the Render origin. Every API call goes to `/api/...` on the Vercel
 * origin, and this handler forwards it server-side with the JWT — which lives in an httpOnly cookie
 * the browser's JavaScript cannot read — attached as a bearer header.
 *
 * Four responsibilities, in order:
 *
 *   1. **Gate.** Anything not on `lib/proxy-allowlist.ts` returns 404 and no request leaves Vercel.
 *   2. **Attach.** The cookie becomes `Authorization: Bearer`. It is never forwarded as a cookie —
 *      the backend has no cookie handling and should not acquire any.
 *   3. **Capture.** `POST /auth/login` returns the token in its *body*. Passing that through would
 *      hand a 30-day credential to browser JavaScript and undo the whole of R-001, so the token is
 *      moved into the cookie here and removed from the body.
 *   4. **Slide.** Any authenticated response may carry `X-Access-Token` when the presented token is
 *      past half-life (R-002). The cookie is rewritten with a fresh `Max-Age` and the header is
 *      stripped. Without this half nothing writes the reissued token back and the creator is logged
 *      out on day 30.
 *
 * Nothing from the upstream response is copied except its status and content type. That is what
 * makes step 4's "strip the header" true by construction rather than by remembering to delete it.
 */

// Credential handling wants Node: `Buffer` decodes the token's exp claim in lib/session.ts.
export const runtime = "nodejs";
// GET Route Handlers are the one cacheable kind. A cached content-items list is one creator's data
// served to a later request, so the whole route opts out.
export const dynamic = "force-dynamic";

/** Sent upstream and nothing else — notably not `cookie`, `host`, or anything Vercel adds. */
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept"] as const;

/** Statuses that must not carry a body; `new Response(body, { status: 204 })` throws. */
const BODYLESS_STATUSES = new Set([204, 304]);

interface ProxyContext {
  // Written out rather than `RouteContext<'/api/[...path]'>`: that helper only exists once Next has
  // generated types, and CI's review:typecheck job runs `pnpm typecheck` with no build before it.
  readonly params: Promise<{ path?: string[] }>;
}

async function proxy(request: NextRequest, context: ProxyContext): Promise<NextResponse> {
  const { path } = await context.params;
  const segments = path ?? [];
  const method = request.method;

  if (!isAllowed(method, segments)) {
    // 404 rather than 403: an endpoint that exists but is off the list should be indistinguishable
    // from one that does not exist. 403 would confirm it is there.
    return NextResponse.json({ detail: "Not Found" }, { status: 404 });
  }

  const cookieName = sessionCookieName();
  const token = request.cookies.get(cookieName)?.value;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  const target = `${apiBaseUrl()}/${segments.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const body = await requestBody(request);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      // A redirect is not part of the contract, and following one could send the bearer header to
      // an origin the allowlist never approved.
      redirect: "manual",
    });
  } catch (error) {
    console.error("[proxy] upstream request failed", error);
    return NextResponse.json({ detail: "The API could not be reached." }, { status: 502 });
  }

  const { response, token: fresh, theme } = await relay(upstream, segments);
  applyCookie(response, upstream.status, segments, cookieName, fresh);
  applyThemeCookie(response, theme);
  return response;
}

/** GET and DELETE carry no body in this contract; an empty buffer would still set Content-Length. */
async function requestBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (request.method !== "POST" && request.method !== "PATCH") return undefined;

  const buffer = await request.arrayBuffer();
  return buffer.byteLength > 0 ? buffer : undefined;
}

interface Relayed {
  readonly response: NextResponse;
  /** The token this response produced, from the login body or the reissue header. */
  readonly token: string | null;
  /**
   * The account's presentation choice, from the login body's optional `preferences` (T035,
   * research.md R-002 rule 1). `null` on every response except a successful login — there is nowhere
   * else in the contract this could come from, and a stale value from an earlier request has no
   * business surviving into an unrelated one.
   */
  readonly theme: Theme | null;
}

/**
 * The upstream response, rebuilt rather than forwarded.
 *
 * Rebuilding is the point: `X-Access-Token` and any future header the backend grows cannot reach
 * the browser by default, and `content-encoding` / `content-length` cannot survive to describe a
 * body `fetch` has already decoded.
 *
 * The token comes back alongside the response rather than being re-read later, because the body is
 * a one-shot stream — a second read would need a clone taken before the first, which is a thing
 * that works until someone reorders two lines.
 */
async function relay(upstream: Response, segments: readonly string[]): Promise<Relayed> {
  if (isLogin(segments) && upstream.ok) {
    const credentials: unknown = await upstream.json().catch(() => null);

    if (!isLoginBody(credentials)) {
      // Never forward a 200 login body we could not parse — the token we failed to find may still
      // be in it, and forwarding is exactly the leak this handler exists to prevent.
      console.error("[proxy] login returned a body that does not match the contract");
      return {
        response: NextResponse.json({ detail: "The API could not be reached." }, { status: 502 }),
        token: null,
        theme: null,
      };
    }

    // `access_token` and `token_type` stop here; `expires_at` is not a credential and the login
    // page may want it. The contract still describes the FastAPI origin faithfully — this response
    // comes from the Vercel origin, which is deliberately not transparent about credentials.
    return {
      response: NextResponse.json({ expires_at: credentials.expires_at }, { status: upstream.status }),
      token: credentials.access_token,
      // `parseTheme` refuses anything that is not exactly "dark"/"light", so a missing or malformed
      // `preferences` (it is optional in the contract on purpose) yields `null` rather than a bad
      // cookie value — `applyThemeCookie` below treats `null` as "nothing to write".
      theme: parseTheme(extractPreferencesTheme(credentials)),
    };
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType !== null) headers.set("content-type", contentType);

  const response = BODYLESS_STATUSES.has(upstream.status)
    ? new NextResponse(null, { status: upstream.status, headers })
    : new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers });

  return { response, token: upstream.headers.get("x-access-token"), theme: null };
}

/**
 * Read `preferences.theme` out of an already-shape-checked login body, tolerant of it being absent
 * or malformed — `PreferencesRead` is declared optional in the contract precisely so a client that
 * ignores it is still correct (`specs/002-pixel-arcade-skin/contracts/openapi.yaml`), so this proxy
 * has to be equally tolerant rather than treating its absence as a parse failure worth a 502 over.
 */
function extractPreferencesTheme(credentials: { preferences?: unknown }): unknown {
  const preferences = credentials.preferences;
  if (typeof preferences !== "object" || preferences === null) return undefined;
  return (preferences as Record<string, unknown>)["theme"];
}

/**
 * The only place the session cookie is written.
 *
 * Clearing wins over setting: a sign-out and a 401 both mean the credential in hand is finished,
 * and a 401 that left the cookie in place would loop the creator through /login forever. The 401
 * case is also what makes T024's client-side handler possible at all — JavaScript cannot delete an
 * httpOnly cookie, so nothing but this route can.
 */
function applyCookie(
  response: NextResponse,
  status: number,
  segments: readonly string[],
  cookieName: string,
  token: string | null,
): void {
  if (isLogout(segments) || status === 401) {
    response.cookies.set(cookieName, "", sessionCookieAttributes(0));
    return;
  }

  if (token) response.cookies.set(cookieName, token, sessionCookieAttributes(maxAgeFromToken(token)));
}

/**
 * The only place the proxy writes `ch_theme` (T035, research.md R-002 rule 1) — the sign-in moment,
 * so the very first authenticated document is already correct rather than painting a default and
 * correcting afterward. Every other write happens client-side (`lib/theme.ts`'s `writeThemeCookie`),
 * because `ch_theme` is deliberately not `httpOnly` and the client owns every later change.
 *
 * `theme === null` (every response except a successful login that carried `preferences`) writes
 * nothing — this cookie has no "clear on refusal" case the way the session cookie does, because it
 * carries no credential to invalidate.
 */
function applyThemeCookie(response: NextResponse, theme: Theme | null): void {
  if (theme === null) return;

  response.cookies.set(THEME_COOKIE_NAME, theme, {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: THEME_MAX_AGE_SECONDS,
  });
}

function isLogin(segments: readonly string[]): boolean {
  return segments.length === 2 && segments[0] === "auth" && segments[1] === "login";
}

function isLogout(segments: readonly string[]): boolean {
  return segments.length === 2 && segments[0] === "auth" && segments[1] === "logout";
}

function isLoginBody(
  value: unknown,
): value is { access_token: string; expires_at: unknown; preferences?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "access_token" in value &&
    typeof (value as { access_token: unknown }).access_token === "string"
  );
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
