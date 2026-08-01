"use client";

import { useEffect, useId, useState } from "react";

import { ItemChip } from "@/components/item/ItemChip";
import type { ContentItem } from "@/lib/api";
import { selectBacklog } from "@/lib/items";

/**
 * The backlog, as a drawer on the calendar surface (T035, FR-011, research.md R-003a).
 *
 * Built from the export's `Backlog expanded 375` panel (`1h`/`2h`) and the peek strip drawn along the
 * bottom of `Month grid 375` (`1c`), with the empty copy from `First run 375` (`1k`).
 *
 * ## Why this is a drawer and not a route
 *
 * R-003a, and the reason is structural rather than aesthetic: **a DOM node cannot be dragged between
 * routes.** With `/backlog` as its own page, US3 scenario 1 — "given an undated item in the backlog,
 * when the creator places it on a calendar day" — had no surface on which to happen, and SC-008 (five
 * undated ideas onto days in under 60 seconds) was unreachable rather than merely untested. One DOM
 * tree makes T054's drag a native `@dnd-kit` interaction with no cross-route machinery. **Do not
 * "tidy" this into a page.**
 *
 * ## It reads from state, it does not fetch
 *
 * `selectBacklog` narrows the items the calendar already loaded. A `scheduled=none` request alongside
 * the calendar's own read would double the round trips and let the two disagree — R-007 is explicit
 * that the period is loaded once and the drawer reads the same state. The endpoint's `scheduled=none`
 * parameter exists for a caller that wants only the backlog; this surface is not one.
 *
 * ## What is deliberately not here
 *
 * Rows are `ItemChip`s as of **T041**, so status and platform are legible here exactly as they are in
 * the grid. Drag is **T054**. Opening an item is **T052**. Each has a seam marked below rather than a
 * partial implementation.
 */
export function BacklogDrawer({
  items,
  onCapture,
}: {
  /** Every loaded item. Narrowing to the backlog is this component's job, not its caller's. */
  readonly items: readonly ContentItem[];
  /** Opens the capture sheet. The drawer's empty state and its expanded footer both point at it. */
  readonly onCapture: () => void;
}) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  const backlog = selectBacklog(items);

  useEffect(() => {
    if (!expanded) return;

    // Escape collapses. Cheap, and the alternative is a drawer covering the calendar that a keyboard
    // user can only leave by finding the button. Not a focus trap: the drawer is deliberately not a
    // modal — `+ CAPTURE` stays reachable inside it, which is what keeps FR-022 true while it is open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <>
      {expanded ? (
        <ExpandedBacklog
          panelId={panelId}
          backlog={backlog}
          onCollapse={() => setExpanded(false)}
          onCapture={onCapture}
        />
      ) : null}

      <PeekStrip
        panelId={panelId}
        backlog={backlog}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      />
    </>
  );
}

/**
 * The collapsed state: a count, the most recent titles, and a way in.
 *
 * Sits directly above the bottom action bar, which R-003a notes costs roughly 64px the month grid
 * would otherwise have — accepted there, and worth restating here so it is not "reclaimed" at T042.
 */
function PeekStrip({
  panelId,
  backlog,
  expanded,
  onToggle,
}: {
  panelId: string;
  backlog: readonly ContentItem[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      aria-label="Backlog"
      className="border-hairline bg-surface-1 notch-sheet relative border-t shadow-e2"
      data-testid="backlog-peek"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        // The whole header row is the target rather than the word EXPAND alone: at 375px a 40px-wide
        // text link beside a count is a miss waiting to happen, and there is nothing else on this row
        // to hit by accident.
        className="border-hairline flex min-h-11 w-full items-center gap-2.5 border-b px-4 py-3 text-left"
        data-testid="backlog-toggle"
      >
        <span className="bg-ink-lo/50 h-[3px] w-[34px] flex-none rounded-sm" aria-hidden="true" />
        <span className="font-display text-ink text-xs leading-none font-semibold tracking-[0.18em] uppercase">
          Backlog
        </span>
        <BacklogCount count={backlog.length} />
        <span className="flex-1" />
        <span className="font-display text-brand-hi text-[10px] leading-none font-semibold tracking-[0.16em] uppercase">
          {expanded ? "Collapse" : "Expand"}
        </span>
      </button>

      {backlog.length === 0 ? (
        <p className="text-ink-mid px-4 py-3 text-xs" data-testid="backlog-empty-peek">
          {/* The export's first-run copy. It names the capture action because T035 asks the empty
              state to point at it, and because "empty" on its own reads as something being broken. */}
          Empty. Everything you capture starts here — tap <b className="text-ink">+ Capture</b>.
        </p>
      ) : (
        <ul
          // Horizontal and clipped, not wrapped: this strip has one line of room, and wrapping would
          // grow it without bound as the backlog fills. `overflow-hidden` rather than a scroll,
          // because the expanded state is how you browse — the strip is a glance.
          className="flex gap-2 overflow-hidden px-4 py-2.5"
          data-testid="backlog-peek-list"
        >
          {backlog.slice(0, PEEK_LIMIT).map((item) => (
            <li key={item.id} className="flex-none">
              {/* T041: the peek strip carries the cues too. FR-017 says status is legible "in both
                  calendar and backlog views" without qualification, and this strip is the backlog
                  view a creator sees most — it is on screen whenever the calendar is. */}
              <ItemChip item={item} size="peek" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The most recent titles the peek strip shows before clipping.
 *
 * Four rather than "as many as fit": a count driven by measurement would need a resize observer to
 * stay right, and the strip clips anyway — this only bounds how many nodes are built for a row the
 * creator is glancing at.
 */
const PEEK_LIMIT = 4;

/** The expanded state: the whole backlog, browsable, over the calendar. */
function ExpandedBacklog({
  panelId,
  backlog,
  onCollapse,
  onCapture,
}: {
  panelId: string;
  backlog: readonly ContentItem[];
  onCollapse: () => void;
  onCapture: () => void;
}) {
  return (
    <>
      {/*
       * The scrim dims the calendar without blocking it. Clicking it collapses, which is the gesture
       * every creator already has. `aria-hidden` because the button below it does the same job for
       * anyone not using a pointer.
       */}
      <div
        className="absolute inset-0 z-10 bg-black/40"
        aria-hidden="true"
        onClick={onCollapse}
        data-testid="backlog-scrim"
      />

      <section
        id={panelId}
        aria-label="Backlog"
        // `top-32` leaves the period header visible, which is what stops the expanded drawer reading
        // as a different screen — R-003a's whole point is that this is one surface.
        className="border-hairline bg-surface-1 notch-sheet absolute inset-x-0 top-32 bottom-0 z-20 flex flex-col border-t shadow-e2"
        data-testid="backlog-expanded"
      >
        <header className="border-hairline border-b px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className="bg-ink-lo/50 h-[3px] w-[34px] flex-none rounded-sm"
              aria-hidden="true"
            />
            <span className="font-display text-ink text-[13px] leading-none font-semibold tracking-[0.18em] uppercase">
              Backlog
            </span>
            <BacklogCount count={backlog.length} />
          </div>

          <p className="text-ink-lo mt-2 text-[11px] leading-snug">
            {/*
             * The export's line here is "Undated ideas, newest first. Drag one onto a day to schedule
             * it." Only the first half is true today: there is no month grid until T042 and no drag
             * until T054, so the second half would instruct the creator to do something the product
             * cannot do. **T054 restores the full sentence** — it is a promise, not a description,
             * until then.
             */}
            Undated ideas, newest first.
          </p>
        </header>

        <ul className="flex-1 overflow-y-auto p-4" data-testid="backlog-list">
          {backlog.length === 0 ? (
            <li className="text-ink-mid py-6 text-center text-sm" data-testid="backlog-empty">
              Nothing here yet. Capture an idea and it lands in this list.
            </li>
          ) : (
            backlog.map((item) => <BacklogRow key={item.id} item={item} />)
          )}
        </ul>

        <div className="border-hairline flex items-center gap-2 border-t px-4 pt-2.5 pb-4">
          <button
            type="button"
            onClick={onCollapse}
            className="border-hairline bg-surface-2 text-ink-mid font-display h-11 flex-1 rounded-sm border text-xs font-semibold tracking-[0.16em] uppercase"
          >
            Close drawer
          </button>

          {/*
           * Capture is repeated inside the drawer rather than left behind the scrim. The action band
           * is covered while this is open, and a creator browsing their backlog is precisely the
           * person most likely to think of the next idea — FR-022 wants it in reach, not one
           * collapse away.
           */}
          <button
            type="button"
            onClick={onCapture}
            className="bg-brand notch-card font-display h-11 flex-none px-4 text-xs font-semibold tracking-[0.12em] whitespace-nowrap text-white uppercase shadow-e1"
            data-testid="backlog-capture-action"
          >
            + Capture
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * One backlog row — an `ItemChip` in a list item, since T041.
 *
 * **Why this was its own task rather than part of T035.** FR-017 requires status to be legible in the
 * backlog as well as the grid, and a `posted` item with no scheduled date legitimately lives here —
 * so "the drawer only holds ideas, and ideas need no cue" was a shortcut that was never available.
 * Until the cues existed there was nothing to put here, and half a chip would have had to be undone.
 *
 * The row keeps `data-testid` and drops everything else it used to own: `aria-busy`, the pending
 * dimming and the "Saving" label all live on the chip now, so the drawer and the grid mark a pending
 * item identically. **T052's tap-to-open and T054's drag both name an id the server has not issued
 * yet** and must skip these rows; `aria-busy` on the chip is what they read.
 */
function BacklogRow({ item }: { item: ContentItem }) {
  return (
    <li className="mb-2 last:mb-0" data-testid="backlog-row">
      <ItemChip item={item} />
    </li>
  );
}

/** The count badge, identical in both states — one definition so they cannot drift apart. */
function BacklogCount({ count }: { count: number }) {
  return (
    <span
      className="bg-surface-3 text-ink-mid flex-none rounded-sm px-1.5 py-1 text-[10px] leading-none font-semibold"
      data-testid="backlog-count"
    >
      {count}
    </span>
  );
}
