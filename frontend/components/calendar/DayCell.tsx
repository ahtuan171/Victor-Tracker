"use client";

import { useState } from "react";

import { useDroppable } from "@dnd-kit/core";

import { ItemChip } from "@/components/item/ItemChip";
import type { ContentItem } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * One day in the month grid (T042, FR-012, FR-021, spec Edge Cases).
 *
 * Built from the export's `Month grid 375` panel (`1c`/`2c`): a 68px-tall cell with the day number in
 * its top-right corner and micro chips stacked below it.
 *
 * ## The overflow, which is a requirement rather than a nicety
 *
 * A 375px cell is ~53px wide and holds two chips before it would push the grid taller than the
 * screen. The spec's edge case — *"the day cell shows a bounded number of items plus a count of the
 * remainder, and the remainder is reachable"* — is met by a `+N more` button that expands **this cell
 * in place**. Expanding in place rather than opening a day sheet keeps FR-021 true (the grid grows
 * downward inside its own scroll container; the body never moves sideways) and keeps SC-002 true —
 * no navigation, no new surface, and nothing for T052's item sheet to compete with.
 *
 * It is a real `<button>` because it is the only way to reach those items, so it has to be
 * keyboard-reachable (FR-015b's spirit) — and at 14px tall it is deliberately *not* a primary action.
 * The chips it reveals are the same chips; nothing is summarised away.
 */
export function DayCell({
  date,
  dayNumber,
  inPeriod,
  today,
  items,
  onOpenItem,
}: {
  readonly date: DateOnly;
  /** The day of the month, already derived by the grid — this component does no date arithmetic. */
  readonly dayNumber: number;
  /** False for the adjacent-month days the six-week span pulls in at either end. */
  readonly inPeriod: boolean;
  /** The creator's own calendar day, or null before it is known. Only the chips read it (T045). */
  readonly today: DateOnly | null;
  readonly items: readonly ContentItem[];
  /** Opens the item sheet (T052). Threaded down rather than reached for, like `items` and `today`. */
  readonly onOpenItem: (item: ContentItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // The cell is the drop target, and its id **is** the date — so `onDragEnd` in `CalendarShell`
  // translates a drop into `{ scheduled_date }` with no lookup table to keep in step.
  const { setNodeRef, isOver } = useDroppable({ id: date });

  const overflowing = items.length > VISIBLE_CHIPS;
  const visible = expanded || !overflowing ? items : items.slice(0, VISIBLE_CHIPS);
  const hidden = items.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      data-over={isOver ? "" : undefined}
      // `border-hairline/60` rather than the full hairline: 42 cells of grid rule at full strength
      // reads as a table, and the export draws the internal rules lighter than its outer ones.
      className={cn(
        "border-hairline/60 relative flex min-h-[68px] flex-col gap-[3px] border-r border-b px-[3px] pt-4 pb-[3px] last:border-r-0",
        // Adjacent-month days are dimmer but present — they carry real items, and hiding those would
        // put an item on no visible day at all in the week it belongs to.
        inPeriod ? "bg-surface-1" : "bg-surface-0",
        // The cell under the finger. Solid, not dashed — dashed is the chip's own language for
        // overdue and for the ghost, and a third dashed thing would stop meaning anything.
        isOver && "bg-brand-sunk ring-brand ring-2 ring-inset",
      )}
      data-date={date}
      data-in-period={inPeriod ? "" : undefined}
      data-testid="day-cell"
    >
      <span
        className={cn(
          "absolute top-[3px] right-1 text-[10px] leading-none font-semibold",
          inPeriod ? "text-ink-mid" : "text-ink-lo/60",
        )}
        aria-hidden="true"
      >
        {dayNumber}
      </span>

      {visible.map((item) => (
        <ItemChip key={item.id} item={item} size="micro" today={today} onOpen={onOpenItem} />
      ))}

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="border-hairline bg-surface-3 text-ink-mid h-3.5 rounded-sm border text-[8px] leading-3 font-semibold"
          data-testid="day-overflow"
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}

/**
 * How many chips a cell shows before the remainder becomes a count.
 *
 * Two, because a third would take a 68px cell past the height six rows can have on a 667px screen
 * without the grid scrolling — and the grid scrolling is fine (FR-021 says wide content scrolls in
 * its own container) but a *default* view that always scrolls is a worse first impression than a
 * count that opens.
 */
const VISIBLE_CHIPS = 2;
