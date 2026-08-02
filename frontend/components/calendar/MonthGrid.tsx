"use client";

import { DayCell } from "@/components/calendar/DayCell";
import type { ContentItem } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { groupByScheduledDate } from "@/lib/items";
import { periodDays, WEEKDAY_INITIALS } from "@/lib/period";

/**
 * The month grid (T042, FR-012, FR-013, FR-021, research.md R-004).
 *
 * A seven-column CSS Grid built from `date-fns` primitives — no calendar library, because every
 * library's value is time-of-day layout and FR-012a removed time of day entirely (research.md R-004).
 *
 * ## Six weeks, always
 *
 * The span is fixed at 42 days from the Monday on or before the 1st, so the grid is the same height
 * in every month. A grid that renders five rows in one month and six in the next moves the backlog
 * drawer and the action band up and down as the creator navigates — on a 375px screen that is the
 * difference between a stable thumb target and a moving one. It also means the first and last rows
 * carry **adjacent-month days**, which are drawn dimmer but hold real items: an item on the 30th of
 * the previous month is genuinely in the week the creator is looking at.
 *
 * The span itself is `periodDays(period, "month")` in `lib/period.ts` as of T043, where the week list
 * derives its own seven days from the same function and the same Monday. Two components each computing
 * a span is how the grid's first column and the week list's first section come to disagree about
 * where a week begins; and a pure function is testable in this project, whereas a component is not
 * (`tech-defaults.md` rules out a renderer at v0.1).
 *
 * ## It does not query for its span, and that is the amendment
 *
 * T042 originally read "querying the full six-week span". The Phase 3 checkpoint's `/speckit-analyze`
 * pass found that this breaks the backlog: `date_from`/`date_to` bound `scheduled_date`, so a ranged
 * read returns **no undated rows**, and the drawer narrows the same loaded state (R-007). The first
 * month grid would have emptied the backlog — and no frontend test could have caught it, because every
 * one of them stubs the proxy and a stub ignores query parameters. So the calendar keeps one
 * unparameterised read and the grid narrows in memory. `tasks.md` records this under Phase 4.
 *
 * ## Dates never touch `Date` here
 *
 * Every value in and out of this component is a `YYYY-MM-DD` string. `lib/dates.ts` is the only module
 * allowed to construct a `Date` (eslint enforces it), and its `parseDateOnly` returns **local**
 * midnight, which is what makes `date-fns` arithmetic safe: `new Date("2026-03-01")` would be UTC
 * midnight and name February anywhere west of Greenwich.
 */
export function MonthGrid({
  period,
  items,
}: {
  /** Any day in the month to display. The grid derives its own span from it. */
  readonly period: DateOnly;
  /** Every loaded item. Narrowing to days is this component's job, not its caller's. */
  readonly items: readonly ContentItem[];
}) {
  const byDay = groupByScheduledDate(items);

  return (
    <section aria-label="Month" data-testid="month-grid">
      {/*
       * The weekday header is `aria-hidden`: every cell already carries its full date, and a screen
       * reader reading seven single letters before the grid is noise. It is a `div` grid rather than
       * a `<table>` for the same reason R-004 gives — this is a layout of days, and a table would
       * promise row and column semantics that the six-week span does not honestly have.
       */}
      <div
        className="border-hairline/60 bg-surface-0 grid grid-cols-7 border-y"
        aria-hidden="true"
        data-testid="month-weekdays"
      >
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span
            key={index}
            className="font-display text-ink-lo text-center text-[9px] leading-6 font-semibold tracking-[0.1em]"
          >
            {initial}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {periodDays(period, "month").map((day) => (
          <DayCell
            key={day.date}
            date={day.date}
            dayNumber={day.dayOfMonth}
            inPeriod={day.inPeriod}
            items={byDay.get(day.date) ?? EMPTY}
          />
        ))}
      </div>
    </section>
  );
}

/** One shared empty array, so 42 mostly-empty cells do not allocate 42 of them per render. */
const EMPTY: readonly ContentItem[] = [];
