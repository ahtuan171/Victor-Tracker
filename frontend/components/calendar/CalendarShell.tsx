"use client";

import { useState, useSyncExternalStore } from "react";

import { BacklogDrawer } from "@/components/backlog/BacklogDrawer";
import { CaptureSheet } from "@/components/capture/CaptureSheet";
import { today, type DateOnly } from "@/lib/dates";
import { useContentItems } from "@/lib/items";

/**
 * The calendar surface's frame (T033, FR-022, research.md R-007).
 *
 * Built from the design export's `Month grid 375` panel (`1c` dark / `2c` light) in
 * `design/content-calendar/`, which is the source for this and every surface from here on. Three
 * bands, top to bottom: a **header** carrying the eyebrow, the period title and the derived counts;
 * a **content region**; and a **bottom action band** holding the primary actions in thumb reach.
 *
 * What T033 built was the frame and the data load — deliberately not what goes inside it. The capture
 * sheet arrived at T034 and the backlog drawer at T035. Still absent, each with a place reserved
 * below and a task that fills it: the month grid (T042), the week list (T043), period navigation
 * (T044) and the platform filter row (T061). Building any of them here because the export draws them
 * would be letting a picture reorder the task board.
 *
 * ## Why the period is not resolved during render
 *
 * `dates.today()` **throws** outside the browser, on purpose (research.md R-006 addendum): Vercel's
 * clock is UTC, so a creator in UTC+7 would get one month in the server HTML and possibly another on
 * hydration. A `"use client"` component is still server-rendered for its first paint, so this cannot
 * be worked around by adding the directive — the value has to come from the browser only.
 *
 * `useSyncExternalStore` is React's own answer to exactly this: `getServerSnapshot` returns `null`
 * for the server render and the hydration pass, and `getSnapshot` reads the real clock afterwards.
 * R-006's addendum describes the `useEffect` + `useState` form instead, and that form is *also*
 * correct — but it sets state from an effect, which React 19's compiler lint flags, and it renders
 * once with the wrong value before correcting itself. This has neither problem and the same
 * guarantee. `period === null` is the honest "not known yet" state; the header shows no month until
 * it is known, because a placeholder month would be a *wrong* month for a moment.
 *
 * ## Why the item load does not wait for the period
 *
 * The two effects are independent, and that is a US1 decision rather than an oversight. `date_from`
 * and `date_to` do not exist on the endpoint until T037, so the read is unparameterised: everything
 * is fetched and the surfaces narrow it client-side, exactly as R-007 describes. Coupling the fetch
 * to the period now would mean building the coupling twice.
 */
export function CalendarShell() {
  const { items, status, error, createItem } = useContentItems();

  /** Null on the server and during hydration, the real month afterwards — see the note above. */
  const period = useSyncExternalStore(subscribeToNothing, readToday, readNoToday);

  /**
   * Owned here rather than inside `CaptureSheet` because the trigger lives in the action band and
   * the sheet does not render one of its own — the export puts capture in the bottom bar, which is
   * also the only place `.claude/rules/design.md` allows a primary action to be.
   */
  const [capturing, setCapturing] = useState(false);

  return (
    // `relative` is load-bearing rather than defensive: the expanded backlog drawer positions itself
    // against this element, which is what keeps it *on* the calendar surface (R-003a) instead of
    // becoming a full-screen overlay that reads as a second screen.
    <div className="bg-surface-0 text-ink relative flex min-h-dvh flex-col overflow-hidden">
      <CalendarHeader period={period} itemCount={items.length} loading={status === "loading"} />

      {/*
       * `min-h-0` is what keeps the promise in `.claude/rules/design.md` that the page body never
       * scrolls at 375px: without it a flex child refuses to shrink below its content and pushes the
       * action band off the bottom of the screen. The grid that lands here at T042 is the wide
       * content that must scroll inside this container rather than moving the page.
       */}
      <main className="min-h-0 flex-1 overflow-y-auto" aria-busy={status === "loading"}>
        {status === "error" ? (
          <p
            id="calendar-error"
            role="alert"
            className="border-brand-hi bg-brand-sunk text-ink m-4 border-l-4 px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {/*
         * The month grid (T042) and the week list (T043) render here. The backlog drawer is *not*
         * in this region — it is anchored to the bottom of the surface, below.
         */}
        <p className="text-ink-mid px-4 py-6 text-sm" data-testid="calendar-placeholder">
          {status === "loading"
            ? "Loading your items…"
            : "The month grid arrives at T042. Undated ideas are in the backlog below."}
        </p>
      </main>

      {/*
       * Between the content region and the action band, which is where the export puts it and where
       * R-003a's peek strip has to be for a backlog item to be dragged a short distance onto a day
       * at T054.
       */}
      <BacklogDrawer items={items} onCapture={() => setCapturing(true)} />

      <CalendarActionBar onCapture={() => setCapturing(true)} />

      <CaptureSheet open={capturing} onOpenChange={setCapturing} onCapture={createItem} />
    </div>
  );
}

/**
 * The three arguments to `useSyncExternalStore`, hoisted to module scope so their identities are
 * stable across renders — an inline `() => today()` would be a new function every render, which is
 * the subscription equivalent of the unstable-params bug `useContentItems` guards against.
 *
 * Nothing subscribes: the calendar day does not change under a creator mid-session in any way this
 * surface needs to react to. If T045's overdue treatment ever needs to roll over at midnight, this
 * is the function that grows a timer — and every consumer would update at once, which is the reason
 * to put it here rather than in a component.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * `getSnapshot`. Safe to call repeatedly: `today()` returns a `YYYY-MM-DD` string, and React
 * compares snapshots with `Object.is`, so the same day yields the same value and no re-render loop.
 */
function readToday(): DateOnly | null {
  return today();
}

/** `getServerSnapshot`. The whole point — the server never reads a clock for this. */
function readNoToday(): DateOnly | null {
  return null;
}

/**
 * The header band: eyebrow, period, and the counts the export shows at the right.
 *
 * The counts are **derived from the item list already fetched**, never stored — the stage-2 audit in
 * `design/content-calendar/BRIEF.md` examined exactly this and cleared it, so no `spec.md` amendment
 * was needed. The export's second count, `3 overdue`, is deliberately absent here: overdue is derived
 * from `scheduled_date < today AND status != posted`, and that derivation arrives with the treatment
 * that uses it at **T045**. One definition, introduced once.
 */
function CalendarHeader({
  period,
  itemCount,
  loading,
}: {
  period: DateOnly | null;
  itemCount: number;
  loading: boolean;
}) {
  return (
    <header className="border-hairline flex items-end justify-between border-b px-4 pt-5 pb-3">
      <div>
        <p className="text-brand font-display mb-1.5 text-[10px] leading-none font-semibold tracking-[0.24em] uppercase">
          Content Calendar
        </p>
        {/*
         * `-skew-x-6` and the uppercase Oswald are the export's display treatment, not decoration
         * added here. An empty string rather than a fallback month while `period` is null: a
         * placeholder month would be a wrong month for a moment, which is the exact failure the
         * after-mount read exists to prevent.
         */}
        <h1
          className="font-display -skew-x-6 text-[27px] leading-none font-bold tracking-wide uppercase"
          data-testid="calendar-period"
        >
          {period === null ? "" : formatPeriod(period)}
        </h1>
      </div>

      <p className="text-ink-mid text-right text-xs leading-snug" data-testid="calendar-counts">
        {loading ? "…" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      </p>
    </header>
  );
}

/**
 * The bottom action band (FR-022, `.claude/rules/design.md`).
 *
 * "Primary actions sit within thumb reach — bottom half of the screen, not a top-right toolbar" is a
 * structural rule, so the band is anchored to the bottom of the flex column and
 * `tests/e2e/calendar.spec.ts` asserts the position rather than leaving it to review. `h-11` is 44px,
 * the minimum tap target, because every shadcn size variant is desktop-scaled.
 *
 * **The month/week toggle and the adjacent-period controls belong in this band and arrive at T044**,
 * where the export places them to the left of the spacer. The band is laid out to receive them —
 * that is why the capture button is pushed right by a spacer that currently has nothing to its left.
 */
function CalendarActionBar({ onCapture }: { onCapture: () => void }) {
  return (
    <div className="border-hairline bg-surface-0 flex items-center gap-2 border-t px-4 pt-2.5 pb-4">
      {/* T044's period controls land here, to the left of this spacer. */}
      <span className="flex-1" />

      <button
        type="button"
        onClick={onCapture}
        className="bg-brand notch-card font-display h-11 flex-none px-4 text-xs font-semibold tracking-[0.12em] whitespace-nowrap text-white uppercase shadow-e1"
        data-testid="capture-action"
      >
        + Capture
      </button>
    </div>
  );
}

/**
 * `2026-03-04` to `March 2026`.
 *
 * Built from the string's own parts rather than through `Date`, which is what `lib/dates.ts` and the
 * eslint rule exist to enforce — a `new Date("2026-03-04")` here would land on UTC midnight and name
 * the previous month on the first of any month, west of Greenwich.
 */
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

function formatPeriod(date: DateOnly): string {
  const [year, month] = date.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}
