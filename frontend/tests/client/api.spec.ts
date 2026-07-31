import { expect, test } from "@playwright/test";

import {
  ApiError,
  createContentItem,
  listContentItems,
  login,
  logout,
  type ContentItem,
} from "../../lib/api";

/**
 * The API client driven against a stubbed `fetch`.
 *
 * Browserless, like tests/proxy: what matters here is the shape of the request that leaves the
 * client and the shape of the value that comes back, both of which are invisible from a page. The
 * proxy is not involved — these assertions are about the browser side of the boundary, and
 * tests/proxy already covers the other side.
 *
 * Everything below is an R-007 or R-001 consequence rather than a taste: same-origin `/api`, no
 * credential in the client's hands, and one error type callers can catch.
 */

interface Recorded {
  readonly url: string;
  readonly init: RequestInit;
}

const recorded: Recorded[] = [];
let originalFetch: typeof globalThis.fetch;

/** The one call the stub saw. Fails loudly rather than returning undefined into an assertion. */
function onlyCall(): Recorded {
  expect(recorded).toHaveLength(1);
  const call = recorded[0];
  if (call === undefined) throw new Error("unreachable: length asserted above");
  return call;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Replaces `fetch` for one test. Restored in afterEach whatever the test does. */
function stub(responder: () => Response | Promise<Response>): void {
  globalThis.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    recorded.push({ url: String(input), init });
    return Promise.resolve(responder());
  };
}

test.beforeEach(() => {
  recorded.length = 0;
  originalFetch = globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.describe("the transport", () => {
  test("every request is same-origin under /api and carries no Authorization header", async () => {
    stub(() => json([]));
    await listContentItems();

    const { url, init } = onlyCall();

    // Relative, so it resolves against the Vercel origin. An absolute backend URL here would be
    // the browser talking to Render directly, which is the whole thing R-001 forbids.
    expect(url).toBe("/api/content-items");
    expect(url.startsWith("http")).toBe(false);

    // The cookie is the credential and the proxy turns it into a bearer. A header set here would
    // be one the client cannot read the value of.
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("authorization");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
  });

  test("a GET sends no body and no content-type", async () => {
    stub(() => json([]));
    await listContentItems();

    const { init } = onlyCall();
    expect(init.body).toBeUndefined();
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain("content-type");
  });

  test("a network failure becomes an ApiError, not a raw TypeError", async () => {
    globalThis.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

    const error = await login({ email: "a@b.com", password: "x" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    // Callers get one error type to handle. Two would mean every surface writing two catch arms.
    expect((error as ApiError).detail).toContain("connection");
  });

  test("an error body that is not the contract's shape still yields a readable sentence", async () => {
    stub(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const error = (await listContentItems().catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.detail).toContain("502");
  });
});

test.describe("login", () => {
  test("returns expires_at and nothing resembling a credential", async () => {
    // Exactly what the proxy forwards: it captured `access_token` into the httpOnly cookie.
    stub(() => json({ expires_at: "2026-08-30T02:00:00Z" }));

    const result = await login({ email: "creator@example.com", password: "hunter2" });

    expect(result).toEqual({ expires_at: "2026-08-30T02:00:00Z" });
    // The client must never grow a token field. If this fails, someone re-added one to the proxy.
    expect(Object.keys(result)).toEqual(["expires_at"]);

    const { url, init } = onlyCall();
    expect(init.method).toBe("POST");
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "creator@example.com",
      password: "hunter2",
    });
  });

  test("a 401 surfaces the backend's message, which does not say which field was wrong", async () => {
    stub(() => json({ detail: "Email or password is incorrect." }, 401));

    const error = (await login({ email: "a@b.com", password: "no" }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.status).toBe(401);
    expect(error.detail).toBe("Email or password is incorrect.");
  });
});

test.describe("logout", () => {
  test("resolves on the contract's 204, which carries no body to parse", async () => {
    stub(() => new Response(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();
    expect(onlyCall().url).toBe("/api/auth/logout");
  });

  test("resolves on a 401 too — signing out of an already-expired session must work (SC-006)", async () => {
    stub(() => json({ detail: "Not authenticated" }, 401));

    // The proxy clears the cookie on any 401, so the session really is over. Throwing here would
    // strand the creator in a signed-out state that the UI still believes is signed in.
    await expect(logout()).resolves.toBeUndefined();
  });

  test("still throws on any other failure", async () => {
    stub(() => json({ detail: "boom" }, 500));
    await expect(logout()).rejects.toThrow(ApiError);
  });
});

test.describe("listContentItems", () => {
  test("sends no query string when given no parameters", async () => {
    stub(() => json([]));
    await listContentItems();

    expect(onlyCall().url).toBe("/api/content-items");
  });

  test("sends only the parameters that are set", async () => {
    stub(() => json([]));
    await listContentItems({ date_from: "2026-08-01", date_to: "2026-09-06" });

    expect(onlyCall().url).toBe("/api/content-items?date_from=2026-08-01&date_to=2026-09-06");
  });

  test("the backlog read is scheduled=none (FR-011)", async () => {
    stub(() => json([]));
    await listContentItems({ scheduled: "none" });

    expect(onlyCall().url).toBe("/api/content-items?scheduled=none");
  });

  test("fills the contract's optional nullable fields so ContentItem is true as declared", async () => {
    // The contract's `required` list is [id, title, status, created_at, updated_at], so a response
    // is free to omit the other four rather than send null.
    stub(() =>
      json([
        {
          id: 1,
          title: "Morning routine",
          status: "idea",
          created_at: "2026-07-31T02:00:00Z",
          updated_at: "2026-07-31T02:00:00Z",
        },
      ]),
    );

    const [item] = await listContentItems();

    // Annotated rather than inline: the type is half the assertion — it fails to compile if
    // ContentItem ever stops requiring one of these fields.
    const expected: ContentItem = {
      id: 1,
      title: "Morning routine",
      hook: null,
      platform: null,
      scheduled_date: null,
      status: "idea",
      published_url: null,
      created_at: "2026-07-31T02:00:00Z",
      updated_at: "2026-07-31T02:00:00Z",
    };

    expect(item).toEqual(expected);
  });

  test("leaves a scheduled_date as the YYYY-MM-DD string it arrived as", async () => {
    stub(() =>
      json([
        {
          id: 2,
          title: "Launch teaser",
          hook: null,
          platform: "tiktok",
          scheduled_date: "2026-08-04",
          status: "draft",
          published_url: null,
          created_at: "2026-07-31T02:00:00Z",
          updated_at: "2026-07-31T02:00:00Z",
        },
      ]),
    );

    const [item] = await listContentItems();

    // A string, never a Date. `new Date("2026-08-04")` is UTC midnight and renders as the 3rd
    // west of Greenwich (research.md R-006) — lib/dates.ts at T028 is what formats this.
    expect(item?.scheduled_date).toBe("2026-08-04");
    expect(item?.platform).toBe("tiktok");
  });
});

test.describe("createContentItem", () => {
  test("sends title alone, because title alone is all FR-005 requires", async () => {
    stub(() =>
      json(
        {
          id: 3,
          title: "Idea from the car",
          status: "idea",
          created_at: "2026-07-31T02:00:00Z",
          updated_at: "2026-07-31T02:00:00Z",
        },
        201,
      ),
    );

    const item = await createContentItem({ title: "Idea from the car" });

    const { url, init } = onlyCall();
    expect(init.method).toBe("POST");
    expect(url).toBe("/api/content-items");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Idea from the car" });

    expect(item.status).toBe("idea");
    expect(item.platform).toBeNull();
  });

  test("a 409 arrives with its code, so a caller need not match on prose (INV-1, FR-009)", async () => {
    stub(() =>
      json({ code: "platform_required", detail: "Set a platform before moving this out of idea." }, 409),
    );

    const error = (await createContentItem({ title: "x", status: "draft" }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("platform_required");
    expect(error.detail).toContain("platform");
  });

  test("code is null when the body carries none — every non-409 error, and any 409 without one", async () => {
    stub(() => json({ detail: "Title must not be empty." }, 422));

    const error = (await createContentItem({ title: " " }).catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(422);
    expect(error.code).toBeNull();
  });
});
