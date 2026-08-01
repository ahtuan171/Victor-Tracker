/**
 * Date-only handling (T028, research.md R-006 and its addendum).
 *
 * A scheduled date in this product is a calendar day with **no time and no timezone** (FR-012a).
 * That is `DATE` in Postgres, `datetime.date` in Python, and `YYYY-MM-DD` on the wire — chosen so
 * the classic off-by-one is unrepresentable in the data rather than merely avoided.
 *
 * The one place it can still reappear is here, at the display boundary, because JavaScript's
 * `Date` is a timestamp pretending to be a date:
 *
 *     new Date("2026-08-04")            // 2026-08-04T00:00:00Z — UTC midnight
 *     new Date("2026-08-04").getDate()  // 3, anywhere west of Greenwich
 *
 * So this module is the **only** one allowed to touch `Date` directly; `eslint.config.mjs` makes
 * `new Date` and `Date.parse` errors everywhere else and exempts this file by name. Everything
 * below exists so no other module ever has to.
 *
 * Two rules hold throughout, and both are load-bearing:
 *
 *   1. A `Date` produced here is always at **local** midnight, never UTC midnight. That is what
 *      makes it safe to hand to `date-fns` (T042's month grid) and get the day back out.
 *   2. A `DateOnly` produced here is always read from **local** calendar parts, never from
 *      `toISOString()` — which is UTC and would undo rule 1 on the way back.
 */

/**
 * A calendar date as `YYYY-MM-DD`.
 *
 * A plain `string` alias rather than a branded type: `ContentItem.scheduled_date` in `lib/api.ts`
 * comes off the wire as a string, and branding it would push a cast onto every read site for a
 * guarantee the backend already enforces. `isDateOnly` is here for the boundaries that genuinely
 * do not know.
 */
export type DateOnly = string;

/**
 * Anchored, and both anchors matter — an unanchored pattern accepts `2026-08-04T00:00:00Z`, which
 * is exactly the value this module exists to keep out.
 */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether a string is a well-formed calendar date.
 *
 * Shape *and* validity: `2026-02-30` matches the pattern and is not a date. The round-trip check
 * catches it without a month-length table, because `parseParts` builds a local `Date` that rolls
 * over and therefore stops agreeing with its own input.
 */
export function isDateOnly(value: string): value is DateOnly {
  return parseParts(value) !== null;
}

/**
 * `YYYY-MM-DD` to a `Date` at **local** midnight — the bridge to `date-fns`.
 *
 * Built from calendar parts through the multi-argument constructor, which is local-time by
 * definition. The string form is never handed to `Date`, which is the whole point.
 *
 * Throws on a malformed or impossible date rather than returning `Invalid Date`, which would
 * propagate silently into a grid and render as `NaN` several components away from the cause.
 */
export function parseDateOnly(value: DateOnly): Date {
  const parts = parseParts(value);
  if (parts === null) {
    throw new RangeError(`Not a calendar date: ${JSON.stringify(value)}. Expected YYYY-MM-DD.`);
  }
  return parts;
}

/**
 * A `Date` back to `YYYY-MM-DD`, read from its **local** calendar parts.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which is the same bug from the other direction:
 * for a creator in UTC+7, local midnight on the 4th is 17:00 UTC on the *3rd*, so the obvious
 * one-liner would write back the previous day.
 */
export function toDateOnly(date: Date): DateOnly {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Cannot format an Invalid Date.");
  }
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/**
 * Today, from the **browser's** clock (research.md R-006 addendum).
 *
 * **This throws outside the browser, on purpose.** "Overdue" is derived by comparing a scheduled
 * date against today, and Vercel's clock is UTC: a creator in UTC+7 opening the app at 06:00 on
 * the 5th is at 23:00 UTC on the 4th, so an item dated the 4th would render *not overdue* in the
 * server HTML and *overdue* a moment later on hydration — a visible flip plus a React mismatch
 * warning, in a cue FR-017 says must be reliable.
 *
 * Note that a `"use client"` component is still server-rendered for the initial HTML, so calling
 * this from a render body throws rather than quietly working. That is the enforcement: read it
 * after mount and hold it in state —
 *
 *     const [today, setToday] = useState<DateOnly | null>(null);
 *     useEffect(() => setToday(dates.today()), []);
 *
 * — and treat `null` as "not yet known", rendering no overdue treatment until it is. A crash that
 * names the rule beats a wrong badge nobody notices.
 */
export function today(): DateOnly {
  if (typeof window === "undefined") {
    throw new Error(
      "dates.today() was called outside the browser. `today` must be read from the creator's own " +
        "clock after mount, never during server rendering — see research.md R-006's addendum. " +
        "Read it in a useEffect and hold it in state.",
    );
  }
  return toDateOnly(new Date());
}

/**
 * The current instant as an ISO 8601 timestamp — the shape `created_at` and `updated_at` arrive in.
 *
 * **This is not a `DateOnly` and must never be treated as one.** It carries a time and a `Z`, so
 * `parseDateOnly` rejects it by design (`DATE_ONLY_PATTERN` is anchored precisely so a timestamp
 * cannot sneak through a date-shaped hole). The two live in the same module because both are `Date`
 * access, and this module is the only one eslint lets touch `Date` — not because they are
 * interchangeable.
 *
 * Written for `lib/items.ts`, whose optimistic rows need timestamps shaped like the server's before
 * the server has assigned any (T032). Unlike `today()` this does **not** refuse to run outside the
 * browser: it is called from an event handler on a user action, never during render, so there is no
 * hydration flip to prevent — and the reducer that consumes it takes the value as an argument, which
 * is what keeps that reducer testable in a Node runner.
 *
 * `toISOString` is correct here and would be wrong in `toDateOnly`: an instant genuinely is a point
 * on the UTC timeline, whereas a calendar date is not.
 */
export function nowInstant(): string {
  return new Date().toISOString();
}

/**
 * Compare two calendar dates: negative if `a` is earlier, `0` if equal, positive if later.
 *
 * **Plain string comparison, and that is not a shortcut.** `YYYY-MM-DD` is fixed-width and
 * big-endian, so lexicographic order *is* chronological order. This is the safest comparison
 * available: no `Date`, no timezone, no DST, nothing to get wrong. Every ordering and range check
 * in the calendar should go through here or compare the strings directly.
 */
export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `true` when `a` falls strictly before `b`. See `compareDateOnly` for why this needs no `Date`. */
export function isBeforeDateOnly(a: DateOnly, b: DateOnly): boolean {
  return a < b;
}

/**
 * Parse to a local-midnight `Date`, or `null` if the string is not a real calendar date.
 *
 * The round-trip is the validity check: `new Date(2026, 1, 30)` silently becomes 2 March, so a
 * result whose parts no longer match the input was never a date to begin with. This also rejects
 * `0000-00-00` and month `13` without enumerating them.
 */
function parseParts(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  // Years 0-99 are the exception the round-trip alone would miss: the multi-argument constructor
  // maps them into 1900-1999, so `0026-08-04` would come back as 1926 and disagree anyway — but
  // setFullYear makes the intent explicit rather than relying on the mismatch.
  date.setFullYear(year);

  const roundTrips =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return roundTrips ? date : null;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
