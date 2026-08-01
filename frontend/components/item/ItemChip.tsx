import { PlatformCue } from "@/components/item/PlatformCue";
import { StatusCue } from "@/components/item/StatusCue";
import type { ContentItem } from "@/lib/api";
import { isPending } from "@/lib/items";
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
 * - **`full`** — the week list (T043) and the backlog drawer (T041), where the title leads and the
 *   cues bracket it.
 *
 * ## The title is always in the accessible name, even when it is not drawn
 *
 * The micro chip's `sr-only` title is not a nicety: without it the month grid announces as a row of
 * "Draft, TikTok" with no way to tell one item from another, and the requirement is that status is
 * legible *per item*. Sighted use recovers the title from the day cell's context; a screen reader has
 * no such context, so it is spelled out.
 *
 * ## What this deliberately does not do yet
 *
 * - **It is not a button.** Tapping an item to open it is **T052**, and it must skip pending rows —
 *   a pending item's id does not exist on the server yet, so a control naming it would 404. The row
 *   already exposes `aria-busy` for that, and `data-pending` for a test to read.
 * - **It is not draggable.** That is **T054**, with the activation constraint at T055.
 * - **It carries no overdue treatment.** **T045** adds the dashed left border, derived from
 *   `dates.today()` in the browser and never during server rendering (research.md R-006 addendum).
 *   The export draws it as a border on this element, so it lands here rather than on the day cell.
 *
 * Each is a seam rather than a partial build: half a drag is worse than none.
 */
export function ItemChip({
  item,
  size = "full",
  className,
}: {
  readonly item: ContentItem;
  readonly size?: "micro" | "full";
  readonly className?: string;
}) {
  const pending = isPending(item);

  return (
    <article
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
      data-item-id={item.id}
      data-size={size}
      data-testid="item-chip"
      className={cn(
        "border-hairline flex items-center rounded-sm border",
        size === "micro"
          ? "bg-surface-3 gap-[3px] px-[3px] py-0.5"
          : // 44px is the tap-target floor from `.claude/rules/design.md`, and the chip is a hair
            // under it at the export's padding. It is set here rather than at T052 so that turning
            // this into a button is a behaviour change and not a re-layout — the drawer row it
            // replaces is already 44px, and shrinking it now to grow it back later would be a
            // visible regression in between.
            "bg-surface-2 min-h-11 gap-2.5 px-3 py-2.5",
        // The optimistic row stays legible but visibly not-yet-saved. Dimming the whole chip rather
        // than the title alone keeps the cue from reading as a status the server has agreed to.
        pending && "opacity-60",
        className,
      )}
    >
      <StatusCue status={item.status} size={size} />

      {size === "micro" ? (
        <span className="sr-only">{item.title}</span>
      ) : (
        <span className="text-ink flex-1 truncate text-sm leading-snug">{item.title}</span>
      )}

      {/* T045's OVERDUE label sits here, between the title and the monogram, as the export draws it. */}

      <PlatformCue platform={item.platform} size={size} />

      {pending && size === "full" ? (
        <span className="text-ink-lo font-display flex-none text-[10px] tracking-[0.16em] uppercase">
          Saving
        </span>
      ) : null}
    </article>
  );
}
