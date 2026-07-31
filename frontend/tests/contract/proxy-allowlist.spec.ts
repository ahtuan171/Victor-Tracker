import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { parse } from "yaml";

import {
  isAllowed,
  matchedRoute,
  NOT_PROXIED,
  PARAM_PATTERNS,
  PROXY_ALLOWLIST,
} from "../../lib/proxy-allowlist";

/**
 * R-008's other half.
 *
 * `lib/proxy-allowlist.ts` is only a boundary while it still describes the API it guards. This
 * file is what makes that true over time: it reads contracts/openapi.yaml directly and requires
 * every operation in it to be either proxied or explicitly excluded. Adding an endpoint to the
 * contract therefore turns this red until someone decides which — the failure mode R-008 exists to
 * prevent is an endpoint becoming browser-reachable because nobody was asked.
 *
 * Runs under Playwright's runner rather than a second toolchain (tech-defaults.md names Playwright
 * as the frontend test tool). It touches no browser, so no page fixture appears below.
 */

const CONTRACT_PATH = resolve(__dirname, "../../../specs/001-content-calendar/contracts/openapi.yaml");

// OpenAPI 3.1 fixed fields of a Path Item that are operations. Everything else under a path —
// `parameters`, `summary`, `$ref` — is not, and /content-items/{item_id} has a `parameters` key.
const OPERATION_KEYS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

function contractPaths(): Record<string, Record<string, unknown>> {
  const document: unknown = parse(readFileSync(CONTRACT_PATH, "utf8"));
  const paths = (document as { paths?: unknown }).paths;

  expect(paths, `no paths object in ${CONTRACT_PATH}`).toBeTruthy();
  return paths as Record<string, Record<string, unknown>>;
}

/** "POST /auth/login" for every operation the contract declares, sorted. */
function contractOperations(): string[] {
  const operations: string[] = [];

  for (const [path, item] of Object.entries(contractPaths())) {
    for (const key of Object.keys(item)) {
      if (OPERATION_KEYS.has(key)) operations.push(`${key.toUpperCase()} ${path}`);
    }
  }

  return operations.sort();
}

const proxied = PROXY_ALLOWLIST.flatMap((entry) =>
  entry.methods.map((method) => `${method} ${entry.path}`),
).sort();

const excluded = NOT_PROXIED.map((entry) => `${entry.method} ${entry.path}`).sort();

test.describe("allowlist and contract stay in sync", () => {
  test("every contract operation is either proxied or explicitly excluded", () => {
    const decided = new Set([...proxied, ...excluded]);
    const undecided = contractOperations().filter((operation) => !decided.has(operation));

    expect(
      undecided,
      "operations in openapi.yaml that lib/proxy-allowlist.ts neither allows nor excludes — add each to PROXY_ALLOWLIST or to NOT_PROXIED with a reason",
    ).toEqual([]);
  });

  test("the allowlist invents nothing the contract does not declare", () => {
    const declared = new Set(contractOperations());
    const invented = [...proxied, ...excluded].filter((operation) => !declared.has(operation));

    expect(
      invented,
      "entries in lib/proxy-allowlist.ts with no matching operation in openapi.yaml — the contract is the source of truth (CLAUDE.md non-negotiable 1)",
    ).toEqual([]);
  });

  test("no operation is both proxied and excluded", () => {
    expect(proxied.filter((operation) => excluded.includes(operation))).toEqual([]);
  });

  test("every path parameter the contract declares has an anchored pattern", () => {
    const parameters = new Set<string>();
    for (const path of Object.keys(contractPaths())) {
      for (const match of path.matchAll(/\{([^}]+)\}/g)) {
        const name = match[1];
        if (name !== undefined) parameters.add(name);
      }
    }

    const unpatterned = [...parameters].filter((name) => PARAM_PATTERNS[name] === undefined).sort();
    expect(
      unpatterned,
      "path parameters with no entry in PARAM_PATTERNS — an unconstrained parameter is an unconstrained proxy",
    ).toEqual([]);

    for (const [name, pattern] of Object.entries(PARAM_PATTERNS)) {
      expect(pattern.source.startsWith("^"), `${name} pattern is not anchored at the start`).toBe(true);
      expect(pattern.source.endsWith("$"), `${name} pattern is not anchored at the end`).toBe(true);
    }
  });

  test("every excluded operation carries a reason", () => {
    for (const entry of NOT_PROXIED) {
      expect(entry.reason.trim().length, `${entry.method} ${entry.path} excluded without a reason`).toBeGreaterThan(0);
    }
  });
});

test.describe("isAllowed", () => {
  test("admits exactly the allowlisted pairs", () => {
    expect(isAllowed("POST", ["auth", "login"])).toBe(true);
    expect(isAllowed("POST", ["auth", "logout"])).toBe(true);
    expect(isAllowed("GET", ["content-items"])).toBe(true);
    expect(isAllowed("POST", ["content-items"])).toBe(true);
    expect(isAllowed("GET", ["content-items", "42"])).toBe(true);
    expect(isAllowed("PATCH", ["content-items", "42"])).toBe(true);
    expect(isAllowed("DELETE", ["content-items", "42"])).toBe(true);
  });

  test("rejects a method the contract does not give that path", () => {
    expect(isAllowed("GET", ["auth", "login"])).toBe(false);
    expect(isAllowed("DELETE", ["content-items"])).toBe(false);
    expect(isAllowed("PATCH", ["content-items"])).toBe(false);
    expect(isAllowed("POST", ["content-items", "42"])).toBe(false);
  });

  test("rejects the excluded health probe", () => {
    expect(isAllowed("GET", ["health"])).toBe(false);
  });

  test("rejects paths the contract does not declare", () => {
    expect(isAllowed("GET", [])).toBe(false);
    expect(isAllowed("GET", ["content-items", "42", "comments"])).toBe(false);
    expect(isAllowed("GET", ["growth"])).toBe(false);
    expect(isAllowed("POST", ["auth"])).toBe(false);
    expect(isAllowed("POST", ["auth", "register"])).toBe(false);
  });

  test("rejects a path parameter that is not an integer", () => {
    // The contract types item_id as an integer. Anything else is either a client bug or someone
    // probing — and it is what stops a decoded `..` or an empty segment reaching FastAPI as a path.
    expect(isAllowed("GET", ["content-items", ".."])).toBe(false);
    expect(isAllowed("GET", ["content-items", ""])).toBe(false);
    expect(isAllowed("GET", ["content-items", "42abc"])).toBe(false);
    expect(isAllowed("GET", ["content-items", "4 2"])).toBe(false);
    expect(isAllowed("GET", ["content-items", "42/43"])).toBe(false);
  });

  test("rejects a method that is not one of the four the proxy speaks", () => {
    expect(isAllowed("post", ["auth", "login"])).toBe(false);
    expect(isAllowed("PUT", ["content-items", "42"])).toBe(false);
    expect(isAllowed("OPTIONS", ["content-items"])).toBe(false);
    expect(isAllowed("HEAD", ["content-items"])).toBe(false);
  });

  test("matchedRoute names the contract template it matched", () => {
    expect(matchedRoute("PATCH", ["content-items", "7"])).toBe("/content-items/{item_id}");
    expect(matchedRoute("GET", ["content-items"])).toBe("/content-items");
    expect(matchedRoute("GET", ["health"])).toBeNull();
  });
});
