import { expect, test } from "@playwright/test";

import { periodDays, periodEyebrow, periodTitle, shiftPeriod } from "@/lib/period";

/**
 * `lib/period.ts` (T043, T044, FR-013, FR-021, research.md R-004).
 *
 * The calendar's spans, its navigation and its titles, as pure functions — which is the only way they
 * can be tested at all in this project: `tech-defaults.md` rules out Jest and RTL at v0.1, so there is
 * **no renderer here**, and anything living inside `MonthGrid` or `WeekList` could only be exercised
 * through a browser at 375px. The cases worth covering are calendar boundaries, and enumerating a
 * dozen of those through a browser would be slow and would prove less.
 *
 * **These run under two real timezones**, for the same reason `dates.spec.ts` does. This module hands
 * `YYYY-MM-DD` strings to `date-fns` through `lib/dates.ts`, whose contract is that a parsed date is
 * at *local* midnight — a regression to `new Date(string)` would be UTC midnight and would shift every
 * span by a day west of Greenwich, invisibly on a UTC runner.
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

const dates = (period: string, view: "month" | "week") =>
  periodDays(period, view).map((day) => day.date);

test.describe("periodDays — month", () => {
  for (const tz of TIMEZONES) {
    test(`is a fixed six-week span, whatever the month, in ${tz}`, () => {
      inTimezone(tz, () => {
        // Every month, or the backlog drawer and the action band move up and down under the
        // creator's thumb as they navigate.
        for (const period of ["2026-02-01", "2026-03-01", "2026-11-30", "2027-01-15"]) {
          expect(periodDays(period, "month")).toHaveLength(42);
        }
      });
    });

    test(`opens on the Monday on or before the 1st, in ${tz}`, () => {
      inTimezone(tz, () => {
        // March 2026 begins on a Sunday, which is the worst case for a Monday-first grid: the span
        // opens six days early, on 23 February, and closes on 5 April.
        const march = dates("2026-03-17", "month");
        expect(march[0]).toBe("2026-02-23");
        expect(march[41]).toBe("2026-04-05");

        // June 2026 begins on a Monday — the case with no leading days at all.
        expect(dates("2026-06-10", "month")[0]).toBe("2026-06-01");
      });
    });

    test(`marks adjacent-month days out of period but still returns them, in ${tz}`, () => {
      inTimezone(tz, () => {
        const days = periodDays("2026-03-17", "month");
        // They carry real items — an item on the 27th of February is genuinely in the week the
        // creator is looking at, so the grid draws it dimmer rather than dropping it.
        expect(days[0]).toMatchObject({ date: "2026-02-23", inPeriod: false, dayOfMonth: 23 });
        expect(days[6]).toMatchObject({ date: "2026-03-01", inPeriod: true, dayOfMonth: 1 });
        expect(days[41]).toMatchObject({ date: "2026-04-05", inPeriod: false });
        expect(days.filter((day) => day.inPeriod)).toHaveLength(31);
      });
    });

    test(`crosses a DST transition without gaining or losing a day, in ${tz}`, () => {
      inTimezone(tz, () => {
        // America/Los_Angeles springs forward on 8 March 2026. A span built by adding 24-hour
        // intervals would emit 8 March twice or skip it; `date-fns` addDays is calendar arithmetic.
        const march = dates("2026-03-01", "month");
        expect(new Set(march).size).toBe(42);
        expect(march).toContain("2026-03-08");
      });
    });
  }
});

test.describe("periodDays — week", () => {
  for (const tz of TIMEZONES) {
    test(`is seven days from the same Monday the month grid uses, in ${tz}`, () => {
      inTimezone(tz, () => {
        const week = periodDays("2026-03-11", "week");
        expect(week.map((day) => day.date)).toEqual([
          "2026-03-09",
          "2026-03-10",
          "2026-03-11",
          "2026-03-12",
          "2026-03-13",
          "2026-03-14",
          "2026-03-15",
        ]);
        expect(week.map((day) => day.weekday)).toEqual([
          "Mon",
          "Tue",
          "Wed",
          "Thu",
          "Fri",
          "Sat",
          "Sun",
        ]);
      });
    });

    test(`treats every one of its days as in-period, in ${tz}`, () => {
      inTimezone(tz, () => {
        // A week that straddles two months belongs wholly to itself — dimming four of its days the
        // way the month grid dims its edges would be meaningless here.
        expect(periodDays("2026-04-01", "week").every((day) => day.inPeriod)).toBe(true);
      });
    });

    test(`a Sunday belongs to the week that started the previous Monday, in ${tz}`, () => {
      inTimezone(tz, () => {
        // The off-by-one a Sunday-first `startOfWeek` would produce: 15 March 2026 is a Sunday and
        // must close the 9th–15th week rather than open a new one.
        expect(dates("2026-03-15", "week")[0]).toBe("2026-03-09");
      });
    });
  }
});

test.describe("shiftPeriod", () => {
  for (const tz of TIMEZONES) {
    test(`steps a month and is reversible from any day of it, in ${tz}`, () => {
      inTimezone(tz, () => {
        expect(shiftPeriod("2026-03-17", "month", 1)).toBe("2026-04-01");
        expect(shiftPeriod("2026-03-17", "month", -1)).toBe("2026-02-01");

        // The reason the result is normalised to the 1st. Stepping forward from 31 January without
        // it lands on a date `addMonths` has to clamp to 28 February, and stepping back returns 28
        // January — so `next` then `previous` would not return where it started.
        const forward = shiftPeriod("2026-01-31", "month", 1);
        expect(forward).toBe("2026-02-01");
        expect(shiftPeriod(forward, "month", -1)).toBe("2026-01-01");
      });
    });

    test(`crosses a year boundary in both directions, in ${tz}`, () => {
      inTimezone(tz, () => {
        expect(shiftPeriod("2026-12-04", "month", 1)).toBe("2027-01-01");
        expect(shiftPeriod("2026-01-04", "month", -1)).toBe("2025-12-01");
      });
    });

    test(`steps a week to the adjacent Monday, in ${tz}`, () => {
      inTimezone(tz, () => {
        expect(shiftPeriod("2026-03-11", "week", 1)).toBe("2026-03-16");
        expect(shiftPeriod("2026-03-11", "week", -1)).toBe("2026-03-02");
        // Normalised, so the step is the same size wherever in the week the creator started.
        expect(shiftPeriod("2026-03-15", "week", 1)).toBe("2026-03-16");
      });
    });

    test(`steps a week across a DST transition, in ${tz}`, () => {
      inTimezone(tz, () => {
        // The week of 2 March 2026 contains America/Los_Angeles's spring-forward. A 7×24h step would
        // land on 8 March at 23:00 the previous day and format as the 8th rather than the 9th.
        expect(shiftPeriod("2026-03-02", "week", 1)).toBe("2026-03-09");
      });
    });
  }
});

test.describe("periodTitle and periodEyebrow", () => {
  for (const tz of TIMEZONES) {
    test(`name a month, in ${tz}`, () => {
      inTimezone(tz, () => {
        expect(periodTitle("2026-03-17", "month")).toBe("March 2026");
        expect(periodEyebrow("2026-03-17", "month")).toBe("Content Calendar");
      });
    });

    test(`name a week by its days and its ISO number, in ${tz}`, () => {
      inTimezone(tz, () => {
        // The export's `1e` header, exactly: eyebrow `Week 11`, title `9 – 15 March`.
        expect(periodTitle("2026-03-11", "week")).toBe("9 – 15 March");
        expect(periodEyebrow("2026-03-11", "week")).toBe("Week 11");
      });
    });

    test(`name both sides of a week that crosses a month, in ${tz}`, () => {
      inTimezone(tz, () => {
        // `30 – 5 April` is not a range. The months abbreviate because the full names do not fit at
        // 375px in the header's display face.
        expect(periodTitle("2026-04-01", "week")).toBe("30 Mar – 5 Apr");
      });
    });

    test(`name both years of a week that crosses New Year, in ${tz}`, () => {
      inTimezone(tz, () => {
        expect(periodTitle("2026-12-31", "week")).toBe("28 Dec 2026 – 3 Jan 2027");
      });
    });
  }
});
