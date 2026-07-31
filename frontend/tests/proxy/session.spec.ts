import { expect, test } from "@playwright/test";

import { apiBaseUrl, maxAgeFromToken, sessionCookieAttributes, sessionCookieName } from "../../lib/session";

/**
 * The cookie's attributes and lifetime.
 *
 * `maxAgeFromToken` is the reason the frontend carries no copy of the backend's `TOKEN_TTL_DAYS`:
 * it reads the token's own `exp`, so the two cannot drift across two separate deployments.
 */

function tokenWithPayload(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

test.describe("maxAgeFromToken", () => {
  test("is the distance to the token's own exp claim", () => {
    const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const maxAge = maxAgeFromToken(tokenWithPayload({ sub: "1", exp }));

    expect(maxAge).toBeGreaterThan(30 * 24 * 60 * 60 - 5);
    expect(maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  test("an already-expired token clamps to zero, which drops the cookie", () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    expect(maxAgeFromToken(tokenWithPayload({ sub: "1", exp }))).toBe(0);
  });

  test("falls back to the documented 30 days when exp is missing or not a number", () => {
    const thirtyDays = 30 * 24 * 60 * 60;

    expect(maxAgeFromToken(tokenWithPayload({ sub: "1" }))).toBe(thirtyDays);
    expect(maxAgeFromToken(tokenWithPayload({ exp: "soon" }))).toBe(thirtyDays);
    expect(maxAgeFromToken(tokenWithPayload([1, 2, 3]))).toBe(thirtyDays);
    expect(maxAgeFromToken("not.a.jwt")).toBe(thirtyDays);
    expect(maxAgeFromToken("")).toBe(thirtyDays);
    expect(maxAgeFromToken("header.only")).toBe(thirtyDays);
  });
});

test.describe("cookie attributes", () => {
  test("are the four R-001 depends on, plus a Max-Age", () => {
    process.env.SESSION_COOKIE_SECURE = "true";

    expect(sessionCookieAttributes(600)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  });

  test("Secure is off only when explicitly disabled — plain http://localhost would not store it", () => {
    process.env.SESSION_COOKIE_SECURE = "false";
    expect(sessionCookieAttributes(600).secure).toBe(false);

    delete process.env.SESSION_COOKIE_SECURE;
    expect(sessionCookieAttributes(600).secure).toBe(process.env.NODE_ENV === "production");

    process.env.SESSION_COOKIE_SECURE = "true";
  });
});

test.describe("environment", () => {
  test("the cookie name matches .env.example's default when unset", () => {
    const configured = process.env.SESSION_COOKIE_NAME;
    delete process.env.SESSION_COOKIE_NAME;

    expect(sessionCookieName()).toBe("ch_session");

    if (configured !== undefined) process.env.SESSION_COOKIE_NAME = configured;
  });

  test("a trailing slash on API_BASE_URL does not become a double slash", () => {
    const configured = process.env.API_BASE_URL;
    process.env.API_BASE_URL = "http://api.test/";

    expect(apiBaseUrl()).toBe("http://api.test");

    if (configured === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = configured;
  });
});
