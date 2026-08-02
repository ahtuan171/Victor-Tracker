/**
 * The typed API client (research.md R-007).
 *
 * Seven operations — login, logout, list, create, and the three by-id ones added at T051 for US3.
 * The eighth, `/health`, is Render's liveness probe and no screen reads it; `lib/proxy-allowlist.ts`
 * records that decision rather than leaving it implied.
 *
 * **The types below are hand-written from `specs/001-content-calendar/contracts/openapi.yaml`.**
 * This project installs no codegen tool: the contract has eight operations and four schemas, which
 * is smaller than the toolchain that would generate it. When the contract changes, this file is
 * edited by hand — `tests/client/api.spec.ts` asserts the enums still match the contract on disk,
 * so the two cannot drift silently.
 *
 * Three things about the transport, all decided at T021/T022 and none of them optional:
 *
 *   1. **Every request goes to `/api/...` on this origin.** The browser never speaks to the Render
 *      origin, so there is no base URL to configure and none should be added. The proxy at
 *      `app/api/[...path]/route.ts` attaches the credential server-side.
 *   2. **There is no token here, and nothing should look for one.** The JWT lives in an httpOnly
 *      cookie the browser's JavaScript cannot read (R-001), and the proxy strips `access_token`
 *      out of the login response before it reaches this code. `login()` returns `expires_at`
 *      alone, and that is the whole credential surface available to the client.
 *   3. **No `Authorization` header is set.** The cookie rides along on a same-origin request and
 *      the proxy turns it into a bearer. Setting one here would be setting a header we cannot
 *      read the value of.
 *
 * `lib/session.ts` must never be imported from this module or anything that reaches it: it reads
 * non-`NEXT_PUBLIC_` variables and a client bundle would get silent fallbacks.
 */

/** Everything this client talks to. Same-origin by construction — see note 1 above. */
const API_PREFIX = "/api";

/** Where an expired session lands. Also the one route that must never redirect to itself. */
const LOGIN_PATH = "/login";

/**
 * The two operations whose 401 is **not** an expired session, so neither triggers the redirect.
 *
 * `/auth/login` — a 401 here is a wrong password. Redirecting to `/login` from `/login` would
 * discard the very message the form has to show, and look like the page silently reloading.
 * `/auth/logout` — a 401 here means the session was already over, which is where logout was going
 * anyway. Its caller owns the navigation; see `logout()`.
 */
const SESSION_LIFECYCLE_PATHS = ["/auth/login", "/auth/logout"] as const;

// --- Contract schemas -----------------------------------------------------------------------
// Written as `as const` arrays rather than TypeScript enums so the runtime values exist for the
// contract test to compare against openapi.yaml, and so `Status[]` is iterable for the UI.

/** `Status` in the contract. FR-007 — exactly three; `overdue` is derived at render, never stored. */
export const STATUSES = ["idea", "draft", "posted"] as const;
export type Status = (typeof STATUSES)[number];

/** `Platform` in the contract. FR-010 — a closed set, not creator-editable. */
export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** `InvariantError.code`. Both arrive on a 409; only `platform_required` is reachable from create. */
export const INVARIANT_CODES = ["platform_required", "platform_locked"] as const;
export type InvariantCode = (typeof INVARIANT_CODES)[number];

/**
 * `ContentItem` in the contract.
 *
 * The four nullable fields are **not** in the contract's `required` list, so a response may omit
 * them rather than send null. They are typed as present-and-nullable here and `toContentItem`
 * makes that true on the way in — the alternative is `hook?: string | null`, which pushes a
 * `?? null` onto every read site in the calendar and the drawer for no gain.
 *
 * `scheduled_date` is a `YYYY-MM-DD` string and stays one. Never hand it to `new Date` — that
 * parses as UTC midnight and renders as the previous day west of Greenwich (research.md R-006).
 * eslint enforces this; `lib/dates.ts` is where date handling lives.
 */
export interface ContentItem {
  readonly id: number;
  readonly title: string;
  readonly hook: string | null;
  readonly platform: Platform | null;
  /** Date only, no time and no timezone (FR-012a). Null means the item is in the backlog. */
  readonly scheduled_date: string | null;
  readonly status: Status;
  readonly published_url: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * `ContentItemCreate` in the contract. Title is the only required field (FR-005) — that is the
 * whole point of the capture sheet at T034, and any second required field is friction enough to
 * send the creator back to a notes app.
 */
export interface ContentItemCreate {
  readonly title: string;
  readonly hook?: string | null;
  readonly platform?: Platform | null;
  readonly scheduled_date?: string | null;
  readonly status?: Status;
  readonly published_url?: string | null;
}

/**
 * `ContentItemUpdate` in the contract — every field optional, and *optional* means two things.
 *
 * **This type is why `exactOptionalPropertyTypes` is on** (see `frontend/AGENTS.md`). The backend
 * reads `model_dump(exclude_unset=True)`, so it distinguishes a key that was **omitted** — leave the
 * stored value alone — from one set to **explicit null** — clear it. `JSON.stringify` drops
 * `undefined` values, so those two intentions are two different requests, and without the flag
 * `{ platform: undefined }` would be assignable to `platform?: Platform | null` and collapse them.
 *
 * So the spelling below is load-bearing: `platform?: Platform | null`, never `| undefined`. Under
 * the flag a caller cannot pass an explicit `undefined` at all, which means an own property here is
 * always a field the caller meant to write.
 *
 * Two fields have no null spelling, and the contract agrees: `title` is `NOT NULL` with INV-2
 * forbidding an empty one, and `status` is `NOT NULL` with a default, so "clear the status" has no
 * meaning. Both `$ref` their type directly in `openapi.yaml` while every nullable field is a union
 * with `"null"`.
 *
 * The contract's `minProperties: 1` is not expressed here — TypeScript has no way to say it, and
 * the backend answers 422 rather than treating an empty body as a silent no-op 200.
 */
export interface ContentItemUpdate {
  readonly title?: string;
  readonly hook?: string | null;
  readonly platform?: Platform | null;
  /** `YYYY-MM-DD`, or null to send the item back to the backlog (FR-014). */
  readonly scheduled_date?: string | null;
  readonly status?: Status;
  readonly published_url?: string | null;
}

/** Query parameters on `GET /content-items`. */
export interface ListContentItemsParams {
  /** `none` returns only undated items — the backlog drawer (FR-011). */
  readonly scheduled?: "none";
  /** Inclusive lower bound on `scheduled_date` (FR-013). `YYYY-MM-DD`. */
  readonly date_from?: string;
  /** Inclusive upper bound on `scheduled_date` (FR-013). `YYYY-MM-DD`. */
  readonly date_to?: string;
  /** Restrict to one platform (FR-016). Items with no platform are excluded when set. */
  readonly platform?: Platform;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/**
 * What login returns **through the proxy** — which is not what the contract's `/auth/login`
 * returns, and the difference is deliberate.
 *
 * FastAPI answers with `{access_token, token_type, expires_at}`. The proxy captures the token into
 * the httpOnly cookie and forwards `expires_at` alone, because handing a 30-day credential to
 * browser JavaScript would undo the whole of R-001. The contract still describes the FastAPI
 * origin truthfully; this type describes the Vercel origin, which is deliberately not transparent
 * about credentials.
 */
export interface LoginResult {
  /** ISO 8601 timestamp, roughly 30 days out (FR-002a). A string — do not parse it into a Date. */
  readonly expires_at: string;
}

// --- Errors ---------------------------------------------------------------------------------

/**
 * Any non-2xx response.
 *
 * `detail` is safe to show verbatim: the contract makes every error body `{"detail": "<string>"}`
 * and the backend installs a handler that flattens FastAPI's validation array into one, so this
 * never renders `[object Object]`.
 *
 * `code` is present only on a 409 (`InvariantError`), which is how a caller distinguishes "needs a
 * platform first" from a generic conflict without matching on prose.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly code: InvariantCode | null;

  constructor(status: number, detail: string, code: InvariantCode | null = null) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

// --- Operations -----------------------------------------------------------------------------

/**
 * Exchange credentials for a session.
 *
 * On success the session cookie has already been set by the proxy on this response — there is
 * nothing for the caller to store. Navigate; do not try to persist anything.
 */
export function login(credentials: LoginRequest): Promise<LoginResult> {
  return request<LoginResult>("POST", "/auth/login", { body: credentials });
}

/**
 * End the session.
 *
 * The cookie is cleared by the proxy on the way back, and it clears it on a 401 too — so this
 * resolves rather than throwing when the token has already expired, which is what makes sign-out
 * work from a dead session (SC-006).
 */
export async function logout(): Promise<void> {
  try {
    await request<void>("POST", "/auth/logout");
  } catch (error) {
    // The one swallowed error in this client, and only this one: a 401 here means the credential
    // was already finished, which is the state logout is trying to reach. The proxy has cleared
    // the cookie either way, so the caller's next step — navigate to /login — is correct.
    if (error instanceof ApiError && error.status === 401) return;
    throw error;
  }
}

/** List content items. Newest-created first (the contract's documented ordering). */
export async function listContentItems(params: ListContentItemsParams = {}): Promise<ContentItem[]> {
  const items = await request<unknown[]>("GET", `/content-items${queryString(params)}`);
  return items.map(toContentItem);
}

/**
 * Create a content item.
 *
 * Throws `ApiError` with `code === "platform_required"` on a 409 — submitting a status past `idea`
 * with no platform (INV-1, FR-009).
 */
export async function createContentItem(item: ContentItemCreate): Promise<ContentItem> {
  return toContentItem(await request<unknown>("POST", "/content-items", { body: item }));
}

/**
 * Fetch one item.
 *
 * **No surface in v0.1 calls this on the happy path**, and that is not an oversight. R-007 holds
 * every item in client state loaded by one list read, so the item sheet at T052 opens on a row it
 * already has — refetching it would be a round trip to learn what is on screen, on a backend whose
 * free tier spins down. It exists because the contract declares it and because it is the honest
 * recovery for a surface that finds itself holding a stale row.
 *
 * Throws `ApiError` with `status === 404` for an id that does not exist.
 */
export async function getContentItem(id: number): Promise<ContentItem> {
  return toContentItem(await request<unknown>("GET", `/content-items/${id}`));
}

/**
 * Change some fields of an item (FR-023).
 *
 * The single mutation behind every edit: a tap in the item sheet (T052) and a drag onto a day
 * (T054) produce the identical request with one field set, which is what makes "both paths produce
 * an identical result" true by construction rather than by discipline.
 *
 * `changes` carries only what should change — see `ContentItemUpdate` for why an omitted field and
 * an explicit null are two different requests rather than two spellings of one.
 *
 * Throws `ApiError` on a 409 with `code === "platform_required"` (advancing past `idea` with no
 * platform) or `"platform_locked"` (clearing the platform of an item already past `idea`) — one
 * invariant, two codes, because the creator's next step differs (FR-009, FR-009a). T053 renders
 * both beside the platform control.
 */
export async function updateContentItem(
  id: number,
  changes: ContentItemUpdate,
): Promise<ContentItem> {
  return toContentItem(await request<unknown>("PATCH", `/content-items/${id}`, { body: changes }));
}

/**
 * Delete an item. Hard delete, and the contract answers 204 with no body.
 *
 * **A missing id is a 404, not an idempotent 204** — settled at T050, and this client reports it
 * rather than swallowing it. Whether a 404 is benign is a question about a *screen* (T056 is
 * reconciling a view, not committing a transaction), and that judgement belongs to the surface that
 * knows what the creator was told, not to the transport.
 *
 * The confirmation FR-020 requires happens before this is called; the API does not second-guess a
 * caller that has already confirmed.
 */
export async function deleteContentItem(id: number): Promise<void> {
  await request<void>("DELETE", `/content-items/${id}`);
}

// --- Transport ------------------------------------------------------------------------------

interface RequestOptions {
  readonly body?: unknown;
}

/**
 * The one place a request is made and the one place a failure becomes an `ApiError`.
 *
 * Single by design: the 401 redirect below (T024) is the reason. Do not grow a second fetch path —
 * a surface that bypasses this one also bypasses the session handling, and nothing will say so.
 */
async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      // The session cookie rides on this. `same-origin` is already fetch's default; stating it
      // means a future edit has to delete a line rather than forget one.
      credentials: "same-origin",
      // The proxy is `force-dynamic`, but a browser or bfcache replay of a list response would
      // still show one creator's stale data after an edit.
      cache: "no-store",
    });
  } catch {
    // A network failure, not an HTTP one — offline, or the proxy unreachable. Given a status so
    // callers have one error type to handle rather than two.
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 401) redirectToLogin(path);
    throw await toApiError(response);
  }

  // 204 is the contract's answer for logout and delete. `.json()` on an empty body throws, and
  // the caller's `Promise<void>` has nothing to receive anyway.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/**
 * The single 401 handler (T024, spec Edge Cases, FR-002, SC-006).
 *
 * A 401 on any content operation means the session ended underneath an open page — the token
 * expired, or it was signed out from another device. FR-002 says an unauthenticated visitor sees no
 * content at any address, and a page that stays put showing yesterday's calendar while its requests
 * quietly fail is exactly that violation, just slower.
 *
 * **Clearing the cookie is not part of this.** T024 originally owned that too; T022 moved it,
 * because an `httpOnly` cookie is by design unreachable from browser JavaScript (research.md R-001).
 * The proxy clears it on *every* 401, which is the only place that can. Do not add a cookie write
 * here — it would be a no-op that reads like a safeguard.
 *
 * Four conditions, each of which has a way of biting if dropped:
 *
 *   1. **Browser only.** `window` is absent in the Playwright runner and in any server context. A
 *      bare `window.location` would turn an expected 401 into a `ReferenceError`.
 *   2. **Not the session-lifecycle endpoints.** See `SESSION_LIFECYCLE_PATHS`.
 *   3. **Not when already on `/login`.** The login page's own failed request must not reload it.
 *   4. **A full navigation, not a router push.** The session guard at T027 is a server component,
 *      and App Router layouts are not re-executed on soft navigations — a client-side push could
 *      land on `/login` without the server ever re-reading the cookie. `lib/api.ts` is also not a
 *      React module, so there is no router to reach for.
 *
 * `replace` rather than `assign`: the page that just 401'd must not sit in history, because going
 * back to it would 401 again and bounce the creator straight back here.
 *
 * The caller still receives the thrown `ApiError`. Navigation is not instantaneous, so a surface
 * that swallowed the error would keep rendering for a beat — every caller should still handle it.
 */
function redirectToLogin(path: string): void {
  if (typeof window === "undefined") return;
  if (SESSION_LIFECYCLE_PATHS.some((exempt) => path.startsWith(exempt))) return;
  if (window.location.pathname === LOGIN_PATH) return;

  window.location.replace(LOGIN_PATH);
}

/**
 * Read an error body without trusting it to be the shape the contract promises.
 *
 * A 502 from the proxy's own failure path, or an upstream that returns HTML, must still produce a
 * sentence a human can read rather than a parse exception thrown from a catch block.
 */
async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);

  const detail =
    isRecord(body) && typeof body["detail"] === "string" && body["detail"].length > 0
      ? body["detail"]
      : `Request failed with status ${response.status}.`;

  const rawCode = isRecord(body) ? body["code"] : undefined;
  const code = INVARIANT_CODES.find((candidate) => candidate === rawCode) ?? null;

  return new ApiError(response.status, detail, code);
}

/**
 * Fill the contract's optional-but-nullable fields so `ContentItem` is true as declared.
 *
 * Deliberately not a validator: this client trusts the backend, which is the only thing that can
 * write these rows and is tested against the same contract. What it will not do is let `undefined`
 * reach a component typed to receive `null`.
 */
function toContentItem(value: unknown): ContentItem {
  const item = value as ContentItem & Partial<Record<keyof ContentItem, unknown>>;

  return {
    ...item,
    hook: item.hook ?? null,
    platform: item.platform ?? null,
    scheduled_date: item.scheduled_date ?? null,
    published_url: item.published_url ?? null,
  };
}

/**
 * `?a=b` for the parameters that are set, and an empty string when none are.
 *
 * `exactOptionalPropertyTypes` stops a caller passing an explicit `undefined`, so an own property
 * here is a value the caller meant. The empty-string check is still worth keeping: `date_from=`
 * is a parameter the backend has to interpret, and it means nothing.
 */
function queryString(params: ListContentItemsParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) search.set(key, value);
  }

  const query = search.toString();
  return query === "" ? "" : `?${query}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
