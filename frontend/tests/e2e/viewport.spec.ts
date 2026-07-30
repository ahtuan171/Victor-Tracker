import { expect, test } from "@playwright/test";

/**
 * Keeps the Phase 1 suite non-empty so the CI `test` stage does not read "no tests" as a failure,
 * and asserts the thing that makes every later assertion meaningful.
 *
 * Constitution principle I makes 375px a hard floor, not a preference. If the suite ever starts
 * running at a desktop width, T057's flow would keep passing while proving nothing about the
 * product the creator actually uses — a green build that means less than it looks like it means.
 * That is worth one test.
 *
 * Unlike backend/tests/test_placeholder.py, this one stays after T057 lands.
 */
test("the E2E suite runs at the 375px design floor", async ({ page }) => {
  expect(page.viewportSize()).toEqual({ width: 375, height: 667 });
});
