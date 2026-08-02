import { addDays, addMonths, addWeeks, getISOWeek, startOfMonth, startOfWeek } from "date-fns";

import { parseDateOnly, toDateOnly, type DateOnly } from "./dates";

/**
 * The calendar's period vocabulary (T043, T044, FR-013, FR-021, research.md R-004).
 *
 * FR-013 asks for two views and for navigation to adjacent periods **in both**, which is three
 * questions a surface should not answer for itself: which days does this period span, what is the
 * period before or after it, and what is it called. Answered in one place, they cannot disagree —
 * `MonthGrid` and `WeekList` would otherwise each derive a span, and `PeriodNav` and the header would
 * each derive a title.
 *
 * ## Why this is a module and not three components' worth of local helpers
 *
 * `tech-defaults.md` rules out Jest and React Testing Library at v0.1, so **this project has no
 * renderer**: anything living inside a component can only be exercised through a browser. That is the
 * same constraint that split `lib/items.ts` into pure functions plus a thin hook, and it applies here
 * with more force — the interesting cases are calendar boundaries (a month that starts on a Sunday, a
 * week that straddles New Year), and enumerating those through a browser at 375px would be slow and
 * would prove less. As pure functions they are ordinary unit tests in `tests/client/period.spec.ts`.
 *
 * ## No `Date` escapes this module
 *
 * Every value in and out is a `YYYY-MM-DD` string. `lib/dates.ts` is the only module eslint lets touch
 * `Date` directly, and its `parseDateOnly` returns **local** midnight — which is what makes `date-fns`
 * arithmetic safe here. `new Date("2026-03-01")` would be UTC midnight and name February anywhere west
 * of Greenwich.
 */

/** The two views FR-013 requires. Named once so the shell, the nav and the header cannot disagree. */
export type CalendarView = "month" | "week";

/**
 * Monday-first, matching the export's `M T W T F S S`. Hard-coded rather than read from a locale: the
 * product has one creator, and a locale-derived first day would make the grid's shape depend on a
 * browser setting no test pins.
 */
const WEEK_STARTS_ON = 1;

/** The month grid's column header. Initials only — a 53px column has room for one letter. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * The week list's section labels, in the same Monday-first order.
 *
 * Three letters rather than initials because the week list has a full row per day and `Mon 9` is what
 * the export draws — and because two identical `T`s stacked vertically would be a puzzle rather than a
 * header.
 */
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The number of days each view draws.
 *
 * The month's span is **fixed at six weeks** rather than derived from the month's length, so the grid
 * is the same height in every month: a grid that renders five rows in one month and six in the next
 * moves the backlog drawer and the action band up and down as the creator navigates, and on a 375px
 * screen that is the difference between a stable thumb target and a moving one. The cost is that the
 * first and last rows carry adjacent-month days — see `inPeriod`.
 */
const SPAN_DAYS: Readonly<Record<CalendarView, number>> = { month: 42, week: 7 };

/** One day, with everything a surface needs to draw it and nothing it would have to re-derive. */
export interface PeriodDay {
  readonly date: DateOnly;
  /** The day of the month, so a cell never does date arithmetic of its own. */
  readonly dayOfMonth: number;
  /**
   * False for the adjacent-month days the month's six-week span pulls in at either end. They are drawn
   * dimmer but **hold real items** — an item on the 30th of the previous month is genuinely in the
   * week the creator is looking at, and hiding it would put it on no visible day at all.
   *
   * Always true in the week view, where every day is by definition part of the period.
   */
  readonly inPeriod: boolean;
  /** `Mon`, `Tue`, … — the week list's section label. */
  readonly weekday: string;
}

/**
 * The days this period draws, in order, starting on a Monday.
 *
 * Both views start from the Monday on or before their anchor, so the two share one notion of where a
 * week begins and the month grid's first column is the week list's first section.
 */
export function periodDays(period: DateOnly, view: CalendarView): readonly PeriodDay[] {
  const anchor = parseDateOnly(period);
  const start = startOfWeek(view === "month" ? startOfMonth(anchor) : anchor, {
    weekStartsOn: WEEK_STARTS_ON,
  });
  const month = startOfMonth(anchor).getMonth();

  return Array.from({ length: SPAN_DAYS[view] }, (_, offset) => {
    const date = addDays(start, offset);
    return {
      date: toDateOnly(date),
      dayOfMonth: date.getDate(),
      inPeriod: view === "week" || date.getMonth() === month,
      weekday: WEEKDAY_NAMES[offset % 7]!,
    };
  });
}

/**
 * The period `delta` steps away — one month or one week, forward or back (FR-013).
 *
 * **The result is normalised to the start of that period**, and that is what makes navigation
 * repeatable rather than merely correct once. Stepping forward from the 31st of a month without
 * normalising lands on a date `addMonths` has to clamp, so `next` followed by `previous` would not
 * return where it started. Anchoring on the 1st (or on the Monday) makes every step reversible.
 */
export function shiftPeriod(period: DateOnly, view: CalendarView, delta: number): DateOnly {
  const anchor = parseDateOnly(period);
  return toDateOnly(
    view === "month"
      ? addMonths(startOfMonth(anchor), delta)
      : addWeeks(startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON }), delta),
  );
}

/**
 * The small caps line above the period title, straight from the export: `Content Calendar` on the
 * month view (`1c`), the ISO week number on the week view (`1e`).
 *
 * ISO rather than any other week numbering, because it is the one that agrees with a Monday-first
 * week — which is the week this calendar draws.
 */
export function periodEyebrow(period: DateOnly, view: CalendarView): string {
  if (view === "month") return "Content Calendar";
  return `Week ${getISOWeek(parseDateOnly(period))}`;
}

/**
 * What the period is called: `March 2026`, or `9 – 15 March` for a week.
 *
 * A week that crosses a boundary names both sides — `30 March – 5 April`, and with both years when it
 * crosses New Year. The alternative is a title that reads `30 – 5 April`, which is not a range. The
 * year is left off the common case for the same reason the month view carries it: the month title has
 * room and a week title at 375px does not, and the eyebrow already says which week it is.
 */
export function periodTitle(period: DateOnly, view: CalendarView): string {
  if (view === "month") {
    const [year, month] = period.split("-");
    return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  }

  const days = periodDays(period, "week");
  const first = parseDateOnly(days[0]!.date);
  const last = parseDateOnly(days[6]!.date);

  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();

  if (sameMonth) {
    return `${first.getDate()} – ${last.getDate()} ${MONTH_NAMES[first.getMonth()]}`;
  }

  const open = `${first.getDate()} ${short(first)}${sameYear ? "" : ` ${first.getFullYear()}`}`;
  const close = `${last.getDate()} ${short(last)}${sameYear ? "" : ` ${last.getFullYear()}`}`;
  return `${open} – ${close}`;
}

/** Three letters, for the cross-boundary week title where the full names would not fit at 375px. */
function short(date: Date): string {
  return MONTH_NAMES[date.getMonth()]!.slice(0, 3);
}
