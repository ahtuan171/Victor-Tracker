"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

import { BacklogDrawer } from "@/components/backlog/BacklogDrawer";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { PeriodNav } from "@/components/calendar/PeriodNav";
import { WeekList } from "@/components/calendar/WeekList";
import { CaptureSheet } from "@/components/capture/CaptureSheet";
import { ItemSheet } from "@/components/item/ItemSheet";
import type { ContentItem } from "@/lib/api";
import { today, type DateOnly } from "@/lib/dates";
import { countOverdue, useContentItems } from "@/lib/items";
import { periodEyebrow, periodTitle, shiftPeriod, type CalendarView } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * The calendar surface's frame (T033, FR-022, research.md R-007).
 *
 * Built from the design export's `Month grid 375` panel (`1c` dark / `2c` light) in
 * `design/content-calendar/`, which is the source for this and every surface from here on. Three
 * bands, top to bottom: a **header** carrying the eyebrow, the period title and the derived counts;
 * a **content region**; and a **bottom action band** holding the primary actions in thumb reach.
 *
 * What T033 built was the frame and the data load — deliberately not what goes inside it. The capture
 * sheet arrived at T034, the backlog drawer at T035, the month grid at T042, and the week list and
 * period navigation at T043–T044. Still absent, with a place reserved below and a task that fills it:
 * the platform filter row (T061). Building it here because the export draws it would be letting a
 * picture reorder the task board.
 *
 * ## The period is state; `today` is not
 *
 * Two separate values, and collapsing them is the bug T044 exists to avoid. `today` is the creator's
 * own calendar day, read once from the browser's clock; **`period`** is whichever month or week is on
 * screen, which starts at `today` and then moves as the creator navigates. `anchor` holds the moved
 * value and stays null until they move it, so "the calendar opens on this month" needs no effect to
 * synchronise state against a clock that is not known during the first render.
 *
 * `today` is still passed down separately — the week list marks today's section with it, and T045's
 * overdue treatment derives from it. Neither would be correct against a `period` the creator has
 * navigated away from.
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
 * ## Navigating a period issues no request, and that is deliberate
 *
 * `date_from`/`date_to` exist on the endpoint (T037) and the calendar still does not send them. The
 * Phase 3 checkpoint's amendment to T042 is the reason: a ranged read bounds `scheduled_date` and so
 * returns **no undated rows**, and the backlog drawer narrows this same state — so a range would empty
 * the backlog. The whole list is read once and every surface narrows it in memory (R-007), which the
 * spec's Volume assumption (hundreds of items for one creator) is what makes affordable.
 *
 * The consequence worth stating: **stepping to another month re-narrows, it does not re-fetch.** A
 * round trip behind every arrow tap is exactly what R-007 rejects, and on Render's free tier the first
 * one of the day can take tens of seconds. `reload()` therefore still has no caller here.
 */
export function CalendarShell() {
  const { items, status, error, createItem, updateItem } = useContentItems();

  /** Null on the server and during hydration, the creator's own day afterwards — see the note above. */
  const today = useSyncExternalStore(subscribeToNothing, readToday, readNoToday);

  const [view, setView] = useState<CalendarView>("month");

  /**
   * Where the creator has navigated to, or null while they are still on the current period. Not
   * initialised from `today` because `today` is null during the first render — an effect to
   * synchronise them afterwards would be the same "set state from an effect" the store read exists to
   * avoid, and would render the wrong period once on the way.
   */
  const [anchor, setAnchor] = useState<DateOnly | null>(null);
  const period = anchor ?? today;

  /**
   * Owned here rather than inside `CaptureSheet` because the trigger lives in the action band and
   * the sheet does not render one of its own — the export puts capture in the bottom bar, which is
   * also the only place `.claude/rules/design.md` allows a primary action to be.
   */
  const [capturing, setCapturing] = useState(false);

  /**
   * The item open in the editing sheet (T052), or null.
   *
   * **The id is held, not the row.** The store replaces an item's object on every optimistic edit and
   * on every reconciliation, so a captured object would be the version that was on screen when the
   * chip was tapped — stale the instant the save it is showing lands. Looking it up each render keeps
   * the sheet on the live row, and makes it close by itself if that row disappears (a deletion at
   * T056, or a list read that no longer returns it).
   */
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = items.find((item) => item.id === editingId) ?? null;

  /**
   * A pending row never reaches here — `ItemChip` refuses to render as a button for one, because the
   * id the sheet would name does not exist on the server yet.
   */
  function openItem(item: ContentItem): void {
    setEditingId(item.id);
  }

  return (
    // `relative` is load-bearing rather than defensive: the expanded backlog drawer positions itself
    // against this element, which is what keeps it *on* the calendar surface (R-003a) instead of
    // becoming a full-screen overlay that reads as a second screen.
    //
    // **`h-dvh`, not `min-h-dvh`** — and the difference is the whole of FR-022 on this surface. With a
    // minimum, the column's height is still its content's, so `flex-1` on `<main>` has nothing to
    // shrink against: six rows of grid plus the drawer push the action band *below* the fold and the
    // page scrolls vertically to reach it. A fixed height is what gives `<main>` a size to be
    // `min-h-0` against, so the grid scrolls inside its own container the way
    // `.claude/rules/design.md` requires and the band stays under the thumb.
    <div className="bg-surface-0 text-ink relative flex h-dvh flex-col overflow-hidden">
      <CalendarHeader
        period={period}
        view={view}
        itemCount={items.length}
        overdueCount={countOverdue(items, today)}
        loading={status === "loading"}
      />

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
         * The month grid (T042) or the week list (T043), chosen by the toggle in the action band
         * (T044). The backlog drawer is *not* in this region — it is anchored to the bottom of the
         * surface, below.
         *
         * `period === null` until the browser's clock has been read, so there is nothing to draw yet
         * — a grid built from a server-side "today" would be the wrong month for a moment, which is
         * the whole reason the period is read after mount (research.md R-006 addendum).
         */}
        {period === null ? (
          <p className="text-ink-mid px-4 py-6 text-sm" data-testid="calendar-placeholder">
            {status === "loading" ? "Loading your items…" : ""}
          </p>
        ) : view === "month" ? (
          <MonthGrid period={period} today={today} items={items} onOpenItem={openItem} />
        ) : (
          <WeekList period={period} today={today} items={items} onOpenItem={openItem} />
        )}
      </main>

      {/*
       * Between the content region and the action band, which is where the export puts it and where
       * R-003a's peek strip has to be for a backlog item to be dragged a short distance onto a day
       * at T054.
       */}
      <BacklogDrawer items={items} onCapture={() => setCapturing(true)} onOpenItem={openItem} />

      <CalendarActionBar onCapture={() => setCapturing(true)}>
        <PeriodNav
          view={view}
          onViewChange={setView}
          // Stepping from `period` rather than from `anchor` is what makes the first tap work: until
          // the creator has navigated, `anchor` is null and the period on screen is `today`.
          onShift={(delta) => {
            if (period !== null) setAnchor(shiftPeriod(period, view, delta));
          }}
          disabled={period === null}
        />
      </CalendarActionBar>

      <CaptureSheet open={capturing} onOpenChange={setCapturing} onCapture={createItem} />

      {/*
       * Mounted always, opened by `editing` being non-null, so the sheet keeps its exit animation and
       * so the draft it holds survives the optimistic re-render its own save causes.
       */}
      <ItemSheet
        item={editing}
        today={today}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        onSave={updateItem}
      />
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
 * was needed. The export's second count, `3 overdue`, arrived at **T045** with the treatment that
 * uses it: `countOverdue` in `lib/items.ts` is the one definition, shared with every chip.
 *
 * It counts **every loaded item, not the visible period's**. An overdue item two months back is
 * exactly the one the creator has lost track of, and a count that emptied itself as they navigated
 * away from the problem would be the opposite of what the treatment is for.
 */
function CalendarHeader({
  period,
  view,
  itemCount,
  overdueCount,
  loading,
}: {
  period: DateOnly | null;
  view: CalendarView;
  itemCount: number;
  overdueCount: number;
  loading: boolean;
}) {
  return (
    <header className="border-hairline flex items-end justify-between border-b px-4 pt-5 pb-3">
      <div>
        {/*
         * `Content Calendar` on the month view, `Week 11` on the week view — the export's `1c` and
         * `1e` headers. The eyebrow carries the week number rather than the title, because the title
         * has to name the actual days and there is not room at 375px for both.
         */}
        <p
          className="text-brand font-display mb-1.5 text-[10px] leading-none font-semibold tracking-[0.24em] uppercase"
          data-testid="calendar-eyebrow"
        >
          {period === null ? "Content Calendar" : periodEyebrow(period, view)}
        </p>
        {/*
         * `-skew-x-6` and the uppercase Oswald are the export's display treatment, not decoration
         * added here. An empty string rather than a fallback month while `period` is null: a
         * placeholder month would be a wrong month for a moment, which is the exact failure the
         * after-mount read exists to prevent.
         */}
        <h1
          className={cn(
            "font-display -skew-x-6 leading-none font-bold tracking-wide uppercase",
            // The week title names days and a month, so it is longer than `MARCH 2026` and drops a
            // size — the export's own `1c`/`1e` difference. A cross-boundary week is longer still,
            // which is why the range abbreviates its months in `lib/period.ts`.
            view === "month" ? "text-[27px]" : "text-2xl",
          )}
          data-testid="calendar-period"
        >
          {period === null ? "" : periodTitle(period, view)}
        </h1>
      </div>

      <p className="text-ink-mid text-right text-xs leading-snug" data-testid="calendar-counts">
        {loading ? (
          "…"
        ) : (
          <>
            {itemCount} {itemCount === 1 ? "item" : "items"}
            {/*
              * Zero overdue prints nothing rather than "0 overdue". A standing line that usually
              * reads zero is one the creator stops seeing, which is the whole failure mode this
              * count exists to catch.
              */}
            {overdueCount > 0 ? (
              <>
                <br />
                <span className="text-overdue" data-testid="calendar-overdue-count">
                  {overdueCount} overdue
                </span>
              </>
            ) : null}
          </>
        )}
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
 * The period controls (T044) sit to the left of the spacer, exactly where the export places them.
 * They are passed in as children rather than built here so this band stays what it is — a layout with
 * one rule about where a thumb can reach — while `PeriodNav` owns what the controls do.
 *
 * **The band is the tightest row in the product**: toggle, two arrows and `+ CAPTURE` inside 375px
 * with 16px of padding either side. `gap-1.5` rather than the export's 8px buys the margin that keeps
 * it from clipping, and `tests/e2e/viewport.spec.ts` asserts the body never scrolls sideways.
 */
function CalendarActionBar({
  onCapture,
  children,
}: {
  onCapture: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-hairline bg-surface-0 flex items-center gap-1.5 border-t px-4 pt-2.5 pb-4">
      {children}

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
