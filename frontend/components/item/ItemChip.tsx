import { PlatformCue } from "@/components/item/PlatformCue";
import { StatusCue } from "@/components/item/StatusCue";
import type { ContentItem } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { isOverdue, isPending } from "@/lib/items";
import type { CueSize } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * One item, as it appears wherever items appear (T040, FR-017, FR-018, FR-021).
 *
 * Built from the export's `Item chip` panel (`1b`/`2b`), which draws it at two sizes because it has
 * two homes with very different budgets:
 *
 * - **`micro`** — a 50px-wide day cell in the month grid (T042). The **title is dropped**: at that
 *   width it would render two or three characters, which is worse than nothing because it looks like
 *   a truncation bug. What survives is the cue and the monogram, which is exactly what FR-017 and
 *   FR-018 require to be legible without opening the item.
 * - **`peek`** — the backlog drawer's collapsed strip, one clipped horizontal row. Title present but
 *   bounded, because the strip is a glance rather than a list.
 * - **`full`** — the week list (T043) and the expanded backlog drawer (T041), where the title leads
 *   and the cues bracket it.
 *
 * ## The title is always in the accessible name, even when it is not drawn
 *
 * The micro chip's `sr-only` title is not a nicety: without it the month grid announces as a row of
 * "Draft, TikTok" with no way to tell one item from another, and the requirement is that status is
 * legible *per item*. Sighted use recovers the title from the day cell's context; a screen reader has
 * no such context, so it is spelled out.
 *
 * ## Overdue is a border, never a fourth cue (T045)
 *
 * A scheduled day that has passed with the item still unpublished gets a **dashed left border** and,
 * where there is room, the word OVERDUE — the export's `1b` panel draws exactly this. It is
 * deliberately not a fourth status shade: FR-007 fixes the pipeline at three, and overdue is
 * *orthogonal* to status rather than a value of it — an `idea` and a `draft` can both be overdue, and
 * the creator needs to keep telling them apart while they are. Dashed rather than solid so it reads as
 * a condition on the row rather than as another border on a chip that already has one, and so it
 * survives the greyscale test SC-004 sets (a dash pattern is a shape, not a colour).
 *
 * The derivation lives in `lib/items.ts`; `today` arrives as a **prop** and is `null` until the
 * browser's clock has been read. That is what makes "never during server rendering" true by
 * construction rather than by convention — see `isOverdue` and research.md R-006's addendum.
 *
 * ## What this deliberately does not do yet
 *
 * - **It is not a button.** Tapping an item to open it is **T052**, and it must skip pending rows —
 *   a pending item's id does not exist on the server yet, so a control naming it would 404. The row
 *   already exposes `aria-busy` for that, and `data-pending` for a test to read.
 * - **It is not draggable.** That is **T054**, with the activation constraint at T055.
 *
 * Each is a seam rather than a partial build: half a drag is worse than none.
 */
export function ItemChip({
  item,
  size = "full",
  today = null,
  className,
}: {
  readonly item: ContentItem;
  readonly size?: CueSize;
  /**
   * The creator's own calendar day, or null before the browser's clock has been read.
   *
   * Defaults to null rather than being required, and the default is *correct* for the one surface
   * that omits it: the backlog drawer holds only undated items (`selectBacklog`), and an item with no
   * scheduled date can never be overdue. Requiring it there would mean threading a value through a
   * component to be ignored.
   */
  readonly today?: DateOnly | null;
  readonly className?: string;
}) {
  const pending = isPending(item);
  const overdue = isOverdue(item, today);

  return (
    <article
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
      data-overdue={overdue ? "" : undefined}
      data-item-id={item.id}
      data-size={size}
      data-testid="item-chip"
      className={cn(
        "border-hairline flex items-center rounded-sm border",
        FRAME[size],
        // `border-l-dashed` is not a Tailwind utility — border *style* has no per-side variant — so
        // the one arbitrary property in this file. Without it `border-dashed` would dash all four
        // sides and the chip would read as the drag ghost the export draws with exactly that.
        overdue && OVERDUE_FRAME[size],
        // The optimistic row stays legible but visibly not-yet-saved. Dimming the whole chip rather
        // than the title alone keeps the cue from reading as a status the server has agreed to.
        pending && "opacity-60",
        className,
      )}
    >
      <StatusCue status={item.status} size={size} />

      {size === "micro" ? (
        <span className="sr-only" data-testid="item-title">
          {item.title}
        </span>
      ) : (
        <span
          data-testid="item-title"
          className={cn(
            "text-ink truncate",
            size === "peek" ? "text-xs leading-tight" : "flex-1 text-sm leading-snug",
          )}
        >
          {item.title}
        </span>
      )}

      {/*
       * Between the title and the monogram, as the export draws it. `sr-only` at `micro`, where the
       * cell has no room for a word — but still *said*, because the dashed border is nothing at all
       * to a screen reader and FR-017's "without opening the item" has to hold for one too.
       */}
      {overdue ? (
        <span
          className={cn(
            "font-display text-overdue flex-none leading-none font-semibold tracking-[0.14em] uppercase",
            size === "full" ? "text-[10px]" : "sr-only",
          )}
          data-testid="item-overdue"
        >
          Overdue
        </span>
      ) : null}

      <PlatformCue platform={item.platform} size={size} />

      {pending && size === "full" ? (
        <span className="text-ink-lo font-display flex-none text-[10px] tracking-[0.16em] uppercase">
          Saving
        </span>
      ) : null}
    </article>
  );
}

/**
 * The chip's own box at each size, straight from the export.
 *
 * `full` is `min-h-11` — 44px, the tap-target floor in `.claude/rules/design.md` — rather than the
 * export's slightly shorter padding. This becomes a button at **T052**, and the drawer row it
 * replaces is already 44px, so sizing it correctly now makes that a behaviour change instead of a
 * re-layout. `peek` is bounded at 170px like the export's, because the strip clips rather than wraps:
 * one long title must not push the rest of the backlog out of view.
 */
const FRAME: Readonly<Record<CueSize, string>> = {
  micro: "bg-surface-3 gap-[3px] px-[3px] py-0.5",
  peek: "bg-surface-3 max-w-[170px] flex-none gap-2 px-2.5 py-2",
  full: "bg-surface-2 min-h-11 gap-2.5 px-3 py-2.5",
};

/**
 * The overdue border at each size, and the left padding it eats back.
 *
 * The border thickens from the frame's 1px to 3px (micro) or 4px (full), so the padding drops by the
 * difference — otherwise the row's contents shift right by 3px when an item goes overdue, which on a
 * 53px day cell is the whole gap between the cue and the monogram.
 *
 * `peek` carries the treatment too even though the backlog drawer never passes a `today`: the chip
 * must not be the thing that decides an undated item cannot be overdue. `isOverdue` decides that, in
 * one place, from the data.
 */
const OVERDUE_FRAME: Readonly<Record<CueSize, string>> = {
  micro: "border-l-[3px] border-l-overdue [border-left-style:dashed] pl-0.5",
  peek: "border-l-[3px] border-l-overdue [border-left-style:dashed] pl-2",
  full: "border-l-4 border-l-overdue [border-left-style:dashed] pl-2.5",
};
