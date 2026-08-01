import { expect, test } from "@playwright/test";

import { PLATFORMS, STATUSES } from "@/lib/api";
import {
  PLATFORM_CUES,
  STATUS_CUES,
  STATUS_ORDER,
  platformCue,
  statusCue,
  type StatusCue,
} from "@/lib/status";

/**
 * `lib/status.ts` (T038, FR-017, FR-018, SC-004, research.md R-005).
 *
 * These tests assert the **encoding**, not the styling. The distinction matters because SC-004 is a
 * requirement about what a viewer can tell apart, and the only part of that a test without a browser
 * can hold on to is that the three statuses map to three genuinely different shape-and-fill
 * combinations — which is what survives the greyscale screenshot V3 takes by hand.
 *
 * The `client` project runs these with no browser and no renderer, which is why `lib/status.ts`
 * returns data rather than JSX (`tech-defaults.md` rules out Jest and RTL at v0.1).
 */

test.describe("status cues", () => {
  test("every status the contract defines has a cue", () => {
    // Not a tautology: `STATUSES` is checked against `openapi.yaml` by the contract project, so a
    // status added to the contract turns this red rather than rendering as a blank cue.
    for (const status of STATUSES) {
      expect(STATUS_CUES[status], `no cue for status ${status}`).toBeDefined();
      expect(statusCue(status).status).toBe(status);
    }
    expect(Object.keys(STATUS_CUES)).toHaveLength(STATUSES.length);
  });

  test("the three statuses are distinguishable without colour", () => {
    // The SC-004 assertion in the strongest form available without a browser: strip the colour
    // classes and the remaining encoding must still tell the three apart. If two statuses ever share
    // a fill *and* a check, the greyscale screenshot fails and this test says so first.
    const greyscale = STATUSES.map((status) => {
      const cue = statusCue(status);
      return `${cue.fill}/${cue.check}`;
    });

    expect(new Set(greyscale).size).toBe(STATUSES.length);
  });

  test("the fills progress outline → half → solid in pipeline order", () => {
    // R-005's reason for choosing these three: the progression reads as pipeline *progress*, which
    // three unrelated icons would not. The order is therefore part of the requirement, not an
    // arbitrary assignment of shapes to values.
    expect(STATUS_ORDER.map((status) => statusCue(status).fill)).toEqual([
      "outline",
      "half",
      "solid",
    ]);
    expect([...STATUS_ORDER]).toEqual([...STATUSES]);
  });

  test("only the end of the pipeline carries a check", () => {
    expect(statusCue("posted").check).toBe(true);
    expect(statusCue("idea").check).toBe(false);
    expect(statusCue("draft").check).toBe(false);
  });

  test("every status has an accessible name that is not the raw value", () => {
    // A shape announces as nothing, so the label is the whole of FR-017 for a screen-reader user.
    for (const status of STATUSES) {
      const { label } = statusCue(status);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(status);
    }
  });

  test("no cue carries a colour literal", () => {
    // `app/globals.css` is the only file in this project allowed to contain a colour. A hex reaching
    // this module would be a project-wide design decision taken in a mapping file — the design export
    // establishes the tokens for all four CreatorHub modules, not just this one.
    const classNames = STATUSES.flatMap((status): string[] => {
      const cue: StatusCue = statusCue(status);
      return [cue.borderClass, cue.fillClass, cue.textClass];
    });

    for (const className of classNames) {
      expect(className, `${className} looks like a literal colour`).not.toMatch(/#|rgb|hsl|oklch/);
      expect(className).toContain("status-");
    }
  });
});

test.describe("platform cues", () => {
  test("every platform the contract defines has a monogram and a name", () => {
    for (const platform of PLATFORMS) {
      const cue = platformCue(platform);
      expect(cue, `no cue for platform ${platform}`).not.toBeNull();
      expect(cue?.monogram).toHaveLength(1);
      expect(cue?.label.toLowerCase()).toBe(platform);
    }
    expect(Object.keys(PLATFORM_CUES)).toHaveLength(PLATFORMS.length);
  });

  test("the monograms are distinct", () => {
    // T, I and Y. A fourth platform sharing a letter would be indistinguishable at 16px, which is the
    // size this renders at — the failure would look like a styling bug rather than a naming one.
    const monograms = PLATFORMS.map((platform) => PLATFORM_CUES[platform].monogram);
    expect(new Set(monograms).size).toBe(PLATFORMS.length);
    expect(monograms).toEqual(["T", "I", "Y"]);
  });

  test("no platform is the normal case, not an edge case", () => {
    // FR-005 makes title the only required field, so an item with no platform is what capture
    // produces every single time. `platformCue` returns null rather than throwing so each surface
    // renders that state deliberately instead of guarding a lookup.
    expect(platformCue(null)).toBeNull();
  });
});
