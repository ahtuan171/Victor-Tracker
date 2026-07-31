import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { parse } from "yaml";

import { INVARIANT_CODES, PLATFORMS, STATUSES } from "../../lib/api";

/**
 * `lib/api.ts` is hand-written from the contract, so this is what stops it drifting from one.
 *
 * The project installs no OpenAPI codegen — eight operations and four schemas is smaller than the
 * toolchain that would generate them (research.md R-007's "a typed fetch wrapper is enough").
 * Hand-written types buy simplicity and owe exactly one thing in return: a test that fails when the
 * contract gains a status, a platform, or an invariant code and the client does not.
 *
 * Only the closed enums are checked. Object shapes are not, because a TypeScript interface has no
 * runtime representation to compare — `tsc --noEmit` in the CI review stage is what holds those,
 * and the enums are the part that would otherwise silently accept an unknown value at runtime.
 */

const CONTRACT_PATH = resolve(__dirname, "../../../specs/001-content-calendar/contracts/openapi.yaml");

function contractEnum(schema: string): string[] {
  const document: unknown = parse(readFileSync(CONTRACT_PATH, "utf8"));
  const schemas = (document as { components?: { schemas?: Record<string, unknown> } }).components?.schemas;

  const target = schemas?.[schema];
  expect(target, `no components.schemas.${schema} in ${CONTRACT_PATH}`).toBeTruthy();

  const values = (target as { enum?: unknown }).enum;
  expect(Array.isArray(values), `components.schemas.${schema} declares no enum`).toBe(true);

  return values as string[];
}

test("Status matches the contract — FR-007's three states, in pipeline order", () => {
  expect([...STATUSES]).toEqual(contractEnum("Status"));
});

test("Platform matches the contract — FR-010's closed set", () => {
  expect([...PLATFORMS]).toEqual(contractEnum("Platform"));
});

test("InvariantCode matches the contract's 409 codes", () => {
  // Nested one level deeper: `code` is a property of InvariantError, not a schema of its own.
  const document: unknown = parse(readFileSync(CONTRACT_PATH, "utf8"));
  const schemas = (document as { components?: { schemas?: Record<string, unknown> } }).components?.schemas;
  const code = (schemas?.["InvariantError"] as { properties?: { code?: { enum?: unknown } } }).properties?.code;

  expect([...INVARIANT_CODES]).toEqual(code?.enum);
});
