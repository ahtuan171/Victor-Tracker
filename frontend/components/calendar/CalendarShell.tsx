"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { BACKLOG_DROP_ID, BacklogDrawer } from "@/components/backlog/BacklogDrawer";
import { FirstRun } from "@/components/calendar/FirstRun";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { PeriodNav } from "@/components/calendar/PeriodNav";
import { WeekList } from "@/components/calendar/WeekList";
import { CaptureSheet } from "@/components/capture/CaptureSheet";
import { DeleteConfirm } from "@/components/item/DeleteConfirm";
import { FilteredEmpty } from "@/components/item/FilteredEmpty";
import { ItemChip } from "@/components/item/ItemChip";
import { ItemSheet } from "@/components/item/ItemSheet";
import { PlatformFilter } from "@/components/item/PlatformFilter";
import {
  ApiError,
  logout,
  type ContentItem,
  type ContentItemUpdate,
  type Platform,
} from "@/lib/api";
import { isDateOnly, today, type DateOnly } from "@/lib/dates";
import { countOverdue, selectByPlatform, useContentItems } from "@/lib/items";
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
 * sheet arrived at T034, the backlog drawer at T035, the month grid at T042, the week list and period
 * navigation at T043–T044, the item sheet and the drag path at T052–T056, and the platform filter at
 * T061. Every band the export draws now exists.
 *
 * ## `items` and `visible` are two lists
 *
 * The filter narrows loaded state (T061), so this component holds both the full list and the filtered
 * one. The rule for which a consumer gets: **anything that displays a set takes `visible`; anything
 * that acts on a row takes `items`.** The grid, the week list and the header counts are the first
 * kind; the item sheet, the delete confirmation and the drag overlay are the second. Look `editing`
 * up in `visible` and the sheet closes itself the moment the creator gives that item a platform the
 * filter excludes — a normal edit that would read as a crash.
 *
 * **`BacklogDrawer` is the one exception**, and it is a considered one: it takes `items` *and* the
 * filter, and narrows by both itself. T062 gives it two opposite empty states — "nothing captured
 * yet" versus "the filter is hiding your backlog" — and the filtered list alone cannot distinguish
 * them, so it would tell a creator with a full backlog to go and capture something.
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
  const { items, status, error, createItem, updateItem, deleteItem } = useContentItems();

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
   * The item awaiting a delete confirmation (T056).
   *
   * A **captured row**, not an id looked up in `items` — the opposite of `editing`, and deliberately
   * so. The optimistic delete removes the row from `items` immediately, so an id lookup would go null
   * the instant the request left and close the dialog before it could render a refusal. This is the
   * one place holding a copy is correct: it is also the value `itemRestored` puts back if the server
   * says no.
   */
  const [deletingItem, setDeletingItem] = useState<ContentItem | null>(null);

  /** The row being dragged, so `DragOverlay` has something to draw following the finger. */
  const [dragging, setDragging] = useState<ContentItem | null>(null);

  /**
   * The item that turned out to be already deleted, named in a notice (T070, FR-023a).
   *
   * **Held here rather than in the store**, which is the existing rule and not a new one: a failed
   * *write* is the surface's to report, while `state.error` describes a failed *read* of the whole
   * list — folding the two together would blank the calendar because one save was refused.
   *
   * It exists because the store now *removes* the row on a 404, and a removal with nothing said is
   * indistinguishable from a successful save. On the sheet path the sheet closes by itself (its item
   * is gone from `items`), so without this the creator sees a save close the sheet and the chip
   * disappear — which reads as the save having worked. On the drag path there is no sheet at all.
   */
  const [staleTitle, setStaleTitle] = useState<string | null>(null);

  /**
   * The one place a 404 becomes a sentence, so both write paths report it identically.
   *
   * Anything else is passed straight through: the sheet renders a 409 beside the control that
   * resolves it (T053) and the drag path's own feedback is the row visibly returning to its day.
   */
  function noticeIfGone(error: unknown, item: ContentItem): void {
    if (error instanceof ApiError && error.status === 404) setStaleTitle(item.title);
  }

  /**
   * The platform filter (T061), or null for all platforms.
   *
   * State, not a URL parameter and not a request: `selectByPlatform` narrows the list already in
   * memory, which is what makes SC-005's one-second budget trivially met and what R-007 asks for.
   */
  const [platform, setPlatform] = useState<Platform | null>(null);

  /**
   * What every *view* draws — the grid, the week list, the drawer, and the header counts.
   *
   * **`items` and `visible` are two values, and which one a consumer gets is a decision each time.**
   * The rule: anything that *displays a set* takes `visible`; anything that *acts on a row* takes
   * `items`. `editing` below is the clearest case — looking the open item up in `visible` would close
   * the sheet the moment the creator changed that item's platform to one the filter excludes, which
   * is a normal thing to do with the sheet open and would read as the app crashing.
   */
  const visible = selectByPlatform(items, platform);

  /**
   * Both sensors, and the `PointerSensor`'s constraint is the whole of T055.
   *
   * Without an activation constraint the sensor claims the gesture the instant a finger moves on a
   * chip, so a creator swiping up to scroll the month grid lifts the chip instead and drops it on
   * whatever cell they release over — **silently rescheduling an item they were only trying to scroll
   * past**. 8px of travel is enough that a scroll wins and a deliberate drag still feels immediate.
   *
   * A **delay** was the other option and is worse here: long-press collides with the browser's own
   * context menu, and `.claude/rules/design.md` forbids putting a consequential action next to a
   * common gesture. `touch-none` on the chip is the other half of the arbitration; neither works
   * alone.
   *
   * **No `KeyboardSensor`, and that is an amendment to research.md R-003 rather than an oversight.**
   * Its activation codes are `Space` and `Enter`, and T052 made the chip a `<button>` whose own keys
   * those are — registering it means the item sheet can no longer be opened from a keyboard, trading
   * the primary path for the secondary one. FR-015b and SC-011 ask that date changes be reachable
   * *without a drag*, which the sheet's date input satisfies completely. R-003 and `tasks.md` T054 are
   * amended in the same merge request, because an amendment applied to one artifact is not applied.
   */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /**
   * A drop is one `PATCH` of one field, and that is the whole handler.
   *
   * Day cells use their own date as their droppable id and the backlog uses `BACKLOG_DROP_ID`, so
   * translating a drop into `{ scheduled_date }` needs no lookup table that could fall out of step
   * with the grid. Both branches end at `updateItem` — the same function the item sheet calls — which
   * is what makes FR-014a's "both produce an identical result" true by construction.
   */
  function onDragEnd(event: DragEndEvent): void {
    setDragging(null);

    const item = event.active.data.current?.["item"] as ContentItem | undefined;
    const target = event.over?.id;
    if (item === undefined || target === undefined) return;

    const scheduled_date = target === BACKLOG_DROP_ID ? null : String(target);
    // A droppable id that is neither the backlog nor a date is a wiring bug, not a date to send.
    if (scheduled_date !== null && !isDateOnly(scheduled_date)) return;
    // Dropping a chip back where it started is a no-op, not an empty PATCH the backend would 422.
    if (scheduled_date === item.scheduled_date) return;

    // An ordinary refusal still needs no message here: `updateItem` rolls the optimistic move back
    // and the row visibly returning to its old day is the feedback. **A 404 is the exception T070
    // added** — the row does not return, it is removed, and a chip that silently disappears mid-drag
    // is the one outcome a creator would read as the app losing their item.
    void updateItem(item, { scheduled_date }).catch((error: unknown) => noticeIfGone(error, item));
  }

  /**
   * The sheet's save, wrapped so the shell learns about a 404 the sheet cannot report.
   *
   * The rejection is **rethrown**, so `ItemSheet` keeps every one of its own behaviours — the draft
   * intact, the 409 rendered against the control that resolves it. It simply cannot render *this*
   * one: removing the row from the store makes `editing` null, which closes the sheet before the
   * message it just set could be read. So the surface that survives the close carries it.
   */
  async function saveItem(item: ContentItem, changes: ContentItemUpdate): Promise<ContentItem> {
    try {
      return await updateItem(item, changes);
    } catch (error) {
      noticeIfGone(error, item);
      throw error;
    }
  }

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
    // **`h-full`, not `min-h-*` — the difference is still the whole of FR-022 on this surface, only
    // the *source* of the fixed height moved.** `002-pixel-arcade-skin` wired `Frame` in at
    // `app/layout.tsx`, and `body` is now the one true `h-dvh` (`Frame.tsx`'s docstring has the full
    // chain). This component just has to keep passing that height through rather than re-establishing
    // it — `h-full` fills whatever `Frame` gives it. Using `h-dvh` again here would work by accident
    // (it would still be a real pixel height), but it would be a *second* viewport-height authority
    // nested inside the frame's padding, which is redundant now and wrong the day the frame's own
    // thickness changes at a wider breakpoint. A `min-h-*` here reproduces the original bug regardless
    // of what sits above it: with a minimum, the column's height is still its content's, so `flex-1`
    // on `<main>` has nothing to shrink against — six rows of grid plus the drawer push the action
    // band *below* the fold and the page scrolls vertically to reach it, which is exactly what
    // `min-h-0` on `<main>` and a fixed height up the whole chain exist to prevent.
    <DndContext
      sensors={sensors}
      /*
       * **Pointer-based, not rectangle-based, and this is a correctness fix rather than a preference.**
       * dnd-kit's default intersects the *dragged overlay's* rectangle with the droppables. The
       * overlay is a `full` chip — far wider than a 53px day cell — so it overlaps three or four days
       * at once and the first intersection wins: aiming at the 12th scheduled the 13th. `pointerWithin`
       * makes the answer "the cell under the finger", which is the only rule a creator can predict.
       * It also returns nothing outside every droppable, so a drop into empty space is correctly no
       * change rather than a nearest-neighbour guess.
       */
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) =>
        setDragging((event.active.data.current?.["item"] as ContentItem | undefined) ?? null)
      }
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="bg-surface-0 text-ink relative flex h-full flex-col overflow-hidden">
        {/*
         * Both counts describe **what is on screen**, so both narrow with the filter.
         *
         * This is not the same question as period navigation, where `countOverdue` deliberately
         * counts every loaded item rather than the visible period's. Moving to another month does not
         * change which items exist to the creator — it changes which days they are looking at, and an
         * overdue item two months back is exactly the one they have lost track of. A filter is the
         * creator saying "show me fewer items", and a header reading `12 items` above a grid drawing
         * three is simply wrong.
         */}
        <CalendarHeader
          period={period}
          view={view}
          itemCount={visible.length}
          overdueCount={countOverdue(visible, today)}
          loading={status === "loading"}
        />

        {/*
         * The stale-item notice (T070, FR-023a, spec Edge Cases).
         *
         * **Outside `<main>`, above the scroll region.** `<main>` scrolls, so a message at the top of
         * it is off screen for a creator who has scrolled down the grid — which is exactly the
         * creator who just dragged a chip. Here it is always in view, and because it is another row
         * of an `h-dvh` flex column it shrinks `<main>` rather than moving the action band: the band
         * stays under the thumb (FR-022) and nothing leaves the 375px width.
         *
         * `role="status"`, not `role="alert"`: the item is already gone and the calendar is correct:
         * this explains what happened rather than demanding a fix. `alert` is reserved for the
         * refusals the creator has to act on.
         */}
        {staleTitle === null ? null : (
          <p
            role="status"
            className="border-hairline text-ink-mid flex items-start gap-3 border-b px-4 py-2 text-xs leading-relaxed"
            data-testid="stale-notice"
          >
            {/*
             * The title is named because the row it describes is no longer on screen to point at —
             * on the drag path nothing else closed or moved, so an unnamed message would leave the
             * creator to work out which chip disappeared.
             */}
            <span className="min-w-0 flex-1">
              “{staleTitle}” was already deleted somewhere else, so that change could not be saved. It
              has been removed from your calendar.
            </span>
            {/*
             * Dismissed explicitly rather than on a timer. A notice that vanishes on its own is one
             * the creator can miss entirely, and a timer is the kind of thing that makes a suite
             * flaky. `h-11` is the 44px floor, as everywhere else.
             */}
            <button
              type="button"
              onClick={() => setStaleTitle(null)}
              className="border-hairline bg-surface-2 text-ink-mid font-display focus-ring -my-0.5 h-11 flex-none rounded-sm border px-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase"
              data-testid="stale-notice-dismiss"
            >
              Dismiss
            </button>
          </p>
        )}

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
          ) : /*
             * The filtered empty state (T062, spec Edge Cases) replaces the grid rather than sitting
             * above it, which is what the export's `1i` draws — an empty six-week grid under an
             * explanation is still a blank screen, and the region is the explanation.
             *
             * The condition is "the filter hid everything", not "this period is empty": an empty
             * month with items in April is a normal calendar showing nothing planned, and the period
             * arrows already answer it. See `FilteredEmpty.tsx`.
             *
             * `items.length > 0` keeps it away from the genuinely empty account — a creator with no
             * items at all meets T068's first-run panel and the drawer's matching copy, both
             * pointing at `+ CAPTURE`, rather than a message about a filter that is not why their
             * calendar is empty.
             */
          platform !== null && visible.length === 0 && items.length > 0 ? (
            <FilteredEmpty platform={platform} onClear={() => setPlatform(null)} />
          ) : (
            <>
              {/*
               * The first-run state (T068, spec Edge Cases). It sits **above** the view rather than
               * in place of it — see `FirstRun.tsx` for why this one accompanies the grid where the
               * filtered one replaces it.
               *
               * **`status === "ready"` is half the condition, not a nicety.** `items` is empty while
               * the first read is in flight too, so `items.length === 0` alone tells every creator
               * they have captured nothing for as long as their calendar takes to load — which on
               * Render's free tier is the tens of seconds R-007 is written around.
               */}
              {status === "ready" && items.length === 0 ? <FirstRun /> : null}

              {view === "month" ? (
                <MonthGrid period={period} today={today} items={visible} onOpenItem={openItem} />
              ) : (
                <WeekList period={period} today={today} items={visible} onOpenItem={openItem} />
              )}
            </>
          )}
        </main>

        {/*
         * The platform filter (T061), above the drawer rather than under the header where the export
         * draws it. T061 requires it "within thumb reach (FR-022)", and at the 375×667 floor the
         * export's position is in the top fifth of the screen — see the note in `PlatformFilter.tsx`
         * for the full reasoning and the test that pins the position.
         */}
        <PlatformFilter platform={platform} onChange={setPlatform} />

        {/*
         * Between the content region and the action band, which is where the export puts it and where
         * R-003a's peek strip has to be for a backlog item to be dragged a short distance onto a day
         * at T054.
         *
         * **The one consumer handed `items` rather than `visible`**, and it applies the filter itself.
         * The filter does narrow the drawer — US4 scenario 1 names both surfaces — but T062 gives this
         * component two opposite empty states ("nothing captured yet" and "the filter is hiding it"),
         * and it cannot tell them apart from the filtered list alone. Handing it both inputs keeps
         * that judgement in the component that renders the sentence.
         */}
        <BacklogDrawer
          items={items}
          platformFilter={platform}
          onCapture={() => setCapturing(true)}
          onOpenItem={openItem}
        />

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
          onSave={saveItem}
          onRequestDelete={(item) => {
            // The sheet closes first. Two modal surfaces at once on a 375px screen is the layout
            // problem, and leaving the sheet open behind a confirmation about the same item is the
            // comprehension one.
            setEditingId(null);
            setDeletingItem(item);
          }}
        />

        <DeleteConfirm
          item={deletingItem}
          today={today}
          onOpenChange={(open: boolean) => {
            if (!open) setDeletingItem(null);
          }}
          onDelete={deleteItem}
        />

        {/*
         * The thing that follows the finger. A portal-free overlay so it is not clipped by `<main>`'s
         * `overflow-y-auto` — a chip dragged out of a scrolling grid would otherwise disappear at the
         * container's edge. Sized `full` whatever the source chip was: a 50px micro chip under a finger
         * is smaller than the finger.
         */}
        <DragOverlay dropAnimation={null}>
          {dragging === null ? null : (
            <ItemChip item={dragging} size="full" today={today} onOpen={openItem} ghost />
          )}
        </DragOverlay>
      </div>
    </DndContext>
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
 *
 * ## Sign-out lives here, and the task line said the action band
 *
 * T077, and the amendment is recorded in `tasks.md` with the measurement behind it. The action band
 * carries the view toggle, two arrows and `+ CAPTURE`: **300px of content, 24px of gaps and 32px of
 * padding — 356px of the 375px floor, leaving 19px.** A 44px target and its gap need 50px, so
 * putting sign-out there means breaking either `.claude/rules/design.md`'s tap floor or FR-021's
 * "the page body MUST NOT scroll horizontally". FR-022 asks thumb reach for the actions the creator
 * performs **frequently** — it names them: "capture, status change, date change" — and sign-out is
 * none of the three. Distance from the thumb is a *feature* here for the same reason it is a cost
 * there: this is the one control whose mis-tap ends the session.
 *
 * It sits **above** the counts rather than beside them, which is what makes it nearly free: the
 * right-hand column is then `max(button, counts)` wide instead of their sum, so the period title
 * loses ~5px rather than ~91px. The longest title this product can produce is a cross-boundary week
 * (`28 Dec 2026 – 3 Jan 2027`), and both `period-nav.spec.ts` and `sign-out.spec.ts` pin it against
 * horizontal overflow.
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
  /**
   * Set only when the request is refused, and it keeps the creator here.
   *
   * Only the proxy can clear an httpOnly cookie, so a refused logout leaves the session **alive** —
   * navigating to `/login` anyway would report an ending that did not happen. `logout()` already
   * swallows a 401 (the session was over, which is where this was going), so anything reaching this
   * branch is a session that is still open.
   */
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /** Disables the control for the moment before the page swaps, as `login-form.tsx` does on submit. */
  const [signingOut, setSigningOut] = useState(false);

  async function signOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);

    try {
      await logout();
    } catch {
      setSignOutError("Could not sign you out. Your session is still open — try again.");
      setSigningOut(false);
      return;
    }

    // `window.location.replace`, never a router push: the `(app)` guard is a server component and
    // App Router layouts are not re-executed on soft navigations, so a client-side push could land
    // on `/login` with the server never re-reading the now-cleared cookie. `replace` also keeps the
    // signed-in page out of history, where going back would only bounce off the guard.
    window.location.replace("/login");
  }

  return (
    <header className="border-hairline border-b px-4 pt-5 pb-3">
      <div className="flex items-end justify-between gap-3">
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

        <div className="flex flex-none flex-col items-end gap-1.5">
          {/*
           * `h-11` is the 44px floor, as everywhere else — every shadcn size variant is desktop-scaled,
           * so the height is explicit rather than inherited. The label is a written word for the same
           * reason the rest of the product's controls are (`+ CAPTURE`, `MONTH`, `CLEAR`): a lone glyph
           * would be the only icon-only control here, and this is the worst one to leave ambiguous.
           */}
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="border-hairline bg-surface-2 text-ink-mid font-display focus-ring h-11 flex-none rounded-sm border px-2.5 text-[10px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase disabled:opacity-40"
            data-testid="sign-out-action"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>

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
        </div>
      </div>

      {/*
       * Full width rather than inside the right-hand column, which is 44px wide by design — a
       * sentence there would push the period title and break the very constraint that put the
       * control in this band. It renders only on a refusal, so the header's height is unchanged in
       * the case that always happens.
       */}
      {signOutError === null ? null : (
        <p
          role="alert"
          className="text-brand-hi pt-2 text-xs leading-relaxed"
          data-testid="sign-out-message"
        >
          {signOutError}
        </p>
      )}
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
        className="bg-brand notch-card font-display focus-ring-inset h-11 flex-none px-4 text-xs font-semibold tracking-[0.12em] whitespace-nowrap text-white uppercase shadow-e1"
        data-testid="capture-action"
      >
        + Capture
      </button>
    </div>
  );
}
