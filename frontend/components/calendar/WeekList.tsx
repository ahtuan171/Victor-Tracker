"use client";

import { useDroppable } from "@dnd-kit/core";

import { ItemChip } from "@/components/item/ItemChip";
import type { ContentItem } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { groupByScheduledDate } from "@/lib/items";
import { periodDays, type PeriodDay } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * The week view (T043, FR-013, FR-021, research.md R-004).
 *
 * Built from the export's `Week view 375` panel (`1e`/`2e`): seven day sections stacked **vertically**,
 * each with its own header and full-size chips beneath it.
 *
 * ## Vertical sections, never seven columns
 *
 * R-004 settles this and FR-021 makes it a requirement rather than a preference. Seven columns at
 * 375px is ~53px each — the width the month grid's day cell already lives at, where a title cannot be
 * drawn at all and the chip falls back to a cue and a monogram. That is the right trade for a *month*,
 * where the creator is scanning a shape; it is the wrong one for a *week*, which is the view they open
 * when they want to read what is actually planned. So the week trades the horizontal axis away
 * entirely and spends the full 375px on each row, which is what makes `full` chips possible here.
 *
 * The alternative — seven columns that scroll sideways — is the one thing FR-021 names outright.
 *
 * ## No chip cap, unlike the day cell
 *
 * `DayCell` caps at two and offers `+N more`, because 42 cells share one screen's height and a third
 * chip pushes six rows past a 667px viewport. A week has seven sections in a scrolling container, so
 * there is no budget to protect and nothing to hide: every item on a day is drawn. FR-021 permits
 * exactly this — wide *or tall* content scrolls inside its own container, which `CalendarShell`'s
 * `<main>` already is.
 *
 * ## It narrows, it does not fetch
 *
 * Same rule as the month grid, and the same reason: the calendar issues **one unparameterised**
 * `GET /content-items` and every surface reads that state (R-007). A `date_from`/`date_to` read bounds
 * `scheduled_date`, so it returns no undated rows — and the backlog drawer narrows the same state, so a
 * ranged read here would silently empty the backlog. See the amendment under Phase 4 in `tasks.md`.
 */
export function WeekList({
  period,
  today,
  items,
  onOpenItem,
}: {
  /** Any day in the week to display. The list derives its own span from it. */
  readonly period: DateOnly;
  /**
   * The creator's own calendar day, or null before the browser's clock has been read.
   *
   * Read after mount by `CalendarShell` and passed down rather than read here, because
   * `dates.today()` throws outside the browser on purpose (research.md R-006 addendum) and a
   * `"use client"` component is still server-rendered for its first paint. Null simply means no
   * section is marked, which is honest for the one frame before the clock is known.
   */
  readonly today: DateOnly | null;
  /** Every loaded item. Narrowing to days is this component's job, not its caller's. */
  readonly items: readonly ContentItem[];
  /** Opens the item sheet (T052). Threaded down rather than reached for, like `items` and `today`. */
  readonly onOpenItem: (item: ContentItem) => void;
}) {
  const byDay = groupByScheduledDate(items);

  return (
    <section aria-label="Week" className="px-4" data-testid="week-list">
      {periodDays(period, "week").map((day) => (
        <DaySection
          key={day.date}
          day={day}
          today={today}
          items={byDay.get(day.date) ?? EMPTY}
          onOpenItem={onOpenItem}
        />
      ))}
    </section>
  );
}

/**
 * One day of the week: a header, then everything scheduled on it.
 *
 * The header's second line is the export's meta slot, and `today` takes it over when the day is
 * today. That looks like information being dropped and is the opposite: the chips are full-size and
 * stacked, so the count is already visible by looking, whereas "this is today" is not derivable from
 * anything on screen. It is plain text rather than a colour, so it survives the greyscale test SC-004
 * sets for the status cues (V3 in `quickstart.md`).
 */
function DaySection({
  day,
  today,
  onOpenItem,
  items,
}: {
  readonly day: PeriodDay;
  /** The creator's own calendar day: this section's marker, and the chips' overdue derivation. */
  readonly today: DateOnly | null;
  readonly onOpenItem: (item: ContentItem) => void;
  readonly items: readonly ContentItem[];
}) {
  const isToday = day.date === today;

  // A week section is a day, so it is a drop target on the same terms as a month grid cell — FR-014
  // says "from the calendar and backlog views", not "from the month view".
  const { setNodeRef, isOver } = useDroppable({ id: day.date });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "border-hairline/60 border-b py-3.5 last:border-b-0",
        isOver && "bg-brand-sunk ring-brand rounded-sm ring-2 ring-inset",
      )}
      data-over={isOver ? "" : undefined}
      data-date={day.date}
      data-today={isToday ? "" : undefined}
      data-testid="day-section"
    >
      <div className="mb-2 flex items-baseline gap-2">
        <h2
          className={cn(
            "font-display text-[13px] leading-none font-semibold tracking-[0.16em] uppercase",
            // Today is brighter, the rest of the week is plain. A dimmer treatment for the other six
            // would make a week look mostly disabled; this marks one day rather than de-emphasising
            // six.
            isToday ? "text-ink" : "text-ink-mid",
          )}
        >
          {day.weekday} {day.dayOfMonth}
        </h2>
        <span className="text-ink-lo text-[11px] leading-none" data-testid="day-meta">
          {isToday ? "today" : describe(items.length)}
        </span>
      </div>

      {items.length === 0 ? (
        /*
         * The export's dashed placeholder. It is `aria-hidden` and carries no text because the meta
         * above already says "empty" — a screen reader announcing an empty box after being told the
         * day is empty is noise. It stays as a *box* rather than nothing at all because it is the
         * drop target T054 needs: a day with no items still has to be somewhere a chip can land.
         */
        <div
          className="border-hairline/70 h-[34px] rounded-sm border border-dashed"
          aria-hidden="true"
          data-testid="day-empty"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <ItemChip item={item} size="full" today={today} onOpen={onOpenItem} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describe(count: number): string {
  if (count === 0) return "empty";
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/** One shared empty array, so seven mostly-empty sections do not allocate seven of them per render. */
const EMPTY: readonly ContentItem[] = [];
