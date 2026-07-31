import { expect, test } from "@playwright/test";

import {
  compareDateOnly,
  isBeforeDateOnly,
  isDateOnly,
  parseDateOnly,
  toDateOnly,
  today,
} from "@/lib/dates";

/**
 * `lib/dates.ts` (T028, research.md R-006).
 *
 * **These run under two real timezones, and that is the whole point.** The bug this module exists
 * to prevent — `new Date("2026-08-04")` landing on UTC midnight and rendering as the 3rd — is
 * *invisible* when the test process runs in UTC, which is exactly what GitLab's runner does. A
 * suite that only ever ran in UTC would stay green through a regression straight back to the
 * one-liner, in both directions: `new Date(string)` on the way in, `toISOString().slice(0, 10)` on
 * the way out. So each assertion is made once east of Greenwich and once west of it.
 *
 * Node re-reads `process.env.TZ` on assignment, so this works in-process. It is a worker-global
 * mutation, which is why the `client` project runs `workers: 1` with `fullyParallel: false`.
 */

/** UTC+7 and UTC-7: one on each side, so a sign error cannot pass both. */
const TIMEZONES = ["Asia/Ho_Chi_Minh", "America/Los_Angeles"] as const;

function inTimezone(tz: string, body: () => void): void {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    body();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test.describe("parseDateOnly", () => {
  test("lands on local midnight in every timezone, never UTC midnight", () => {
    for (const tz of TIMEZONES) {
      inTimezone(tz, () => {
        const date = parseDateOnly("2026-08-04");

        // The four assertions that fail the moment someone writes `new Date(value)`.
        expect(date.getFullYear(), tz).toBe(2026);
        expect(date.getMonth(), tz).toBe(7);
        expect(date.getDate(), tz).toBe(4);
        expect(date.getHours(), tz).toBe(0);
      });
    }
  });

  test("round-trips through toDateOnly in every timezone", () => {
    for (const tz of TIMEZONES) {
      inTimezone(tz, () => {
        for (const value of ["2026-01-01", "2026-08-04", "2026-12-31", "2024-02-29"]) {
          expect(toDateOnly(parseDateOnly(value)), `${value} in ${tz}`).toBe(value);
        }
      });
    }
  });

  test("throws on a malformed or impossible date rather than returning Invalid Date", () => {
    // An Invalid Date propagates silently and surfaces as NaN in a grid cell several components
    // away from the cause, which is a far worse afternoon than an exception at the boundary.
    for (const value of ["", "2026-8-4", "04-08-2026", "2026-13-01", "2026-02-30", "not a date"]) {
      expect(() => parseDateOnly(value), value).toThrow(RangeError);
    }
  });

  test("rejects a full timestamp, which is what the anchors are for", () => {
    // FR-012a: there is no time of day anywhere in this product. An unanchored pattern would
    // happily accept the prefix of a value that carries one.
    expect(() => parseDateOnly("2026-08-04T00:00:00Z")).toThrow(RangeError);
    expect(isDateOnly("2026-08-04T00:00:00Z")).toBe(false);
  });
});

test.describe("toDateOnly", () => {
  test("reads local calendar parts, not toISOString", () => {
    for (const tz of TIMEZONES) {
      inTimezone(tz, () => {
        // 23:30 local. East of Greenwich this is still the 4th in UTC; west of it, it is already
        // the 5th. `toISOString().slice(0, 10)` therefore gives the wrong day in one of the two,
        // and this assertion is what notices.
        const lateEvening = new Date(2026, 7, 4, 23, 30);
        expect(toDateOnly(lateEvening), tz).toBe("2026-08-04");

        // And the mirror case: 00:30 local, which crosses the other way.
        const earlyMorning = new Date(2026, 7, 4, 0, 30);
        expect(toDateOnly(earlyMorning), tz).toBe("2026-08-04");
      });
    }
  });

  test("throws on an Invalid Date", () => {
    expect(() => toDateOnly(new Date(Number.NaN))).toThrow(RangeError);
  });
});

test.describe("isDateOnly", () => {
  test("accepts real calendar dates and rejects impossible ones", () => {
    expect(isDateOnly("2026-08-04")).toBe(true);
    expect(isDateOnly("2024-02-29")).toBe(true);

    // 2026 is not a leap year, so this matches the pattern and is still not a date.
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2026-04-31")).toBe(false);
    expect(isDateOnly("2026-00-10")).toBe(false);
    expect(isDateOnly("2026-08-00")).toBe(false);
  });
});

test.describe("comparison", () => {
  test("orders chronologically without constructing a Date", () => {
    expect(compareDateOnly("2026-08-04", "2026-08-05")).toBeLessThan(0);
    expect(compareDateOnly("2026-08-05", "2026-08-04")).toBeGreaterThan(0);
    expect(compareDateOnly("2026-08-04", "2026-08-04")).toBe(0);

    // The cases a naive comparison would get wrong if the format were not fixed-width: month and
    // year boundaries, where the later date has the smaller day number.
    expect(isBeforeDateOnly("2026-08-31", "2026-09-01")).toBe(true);
    expect(isBeforeDateOnly("2026-12-31", "2027-01-01")).toBe(true);
    expect(isBeforeDateOnly("2026-09-01", "2026-08-31")).toBe(false);
  });

  test("sorts correctly as plain strings, which is why the helpers are thin", () => {
    const dates = ["2026-12-31", "2026-01-05", "2026-08-04", "2025-11-30"];
    expect([...dates].sort(compareDateOnly)).toEqual([
      "2025-11-30",
      "2026-01-05",
      "2026-08-04",
      "2026-12-31",
    ]);
  });
});

test.describe("today", () => {
  test("refuses to run outside the browser", () => {
    // R-006's addendum: Vercel's clock is UTC, so a `today` computed during server rendering makes
    // the overdue cue flip between the server HTML and hydration. This throw is what turns that
    // into a stack trace naming the rule instead of a wrong badge nobody notices.
    expect(typeof window).toBe("undefined");
    expect(() => today()).toThrow(/outside the browser/);
  });

  test("returns a well-formed local date when a browser is present", () => {
    // The Playwright runner is Node, so the browser is stubbed. `workers: 1` on this project is
    // what makes mutating a global safe; the finally block is what keeps it that way.
    const globals = globalThis as { window?: unknown };
    globals.window = {};
    try {
      // Sandwiched rather than compared to a single reading: a run that straddles local midnight
      // would otherwise fail once a year or so, and a suite that gates merges cannot afford a
      // flake nobody can reproduce.
      const before = toDateOnly(new Date());
      const value = today();
      const after = toDateOnly(new Date());

      expect(isDateOnly(value)).toBe(true);
      expect([before, after]).toContain(value);
    } finally {
      delete globals.window;
    }
  });
});
