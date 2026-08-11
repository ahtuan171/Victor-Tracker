"use client";

import { useDraggable } from "@dnd-kit/core";

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
 * ## Tapping it opens the item sheet (T052), unless the row is pending
 *
 * The chip renders as a **button** rather than an `<article>` — one element, not a wrapper, so the
 * 44px `full` frame *is* the tap target rather than sitting inside one.
 *
 * **A pending row is never openable**, and the check is here rather than at each of the four call
 * sites: its id does not exist on the server yet, so every control the sheet offers would name an id
 * that 404s. The row keeps `aria-busy` so the reason is announced rather than merely felt, and it
 * stays an `<article>` — a disabled button would still be a tab stop promising something.
 *
 * ## Dragging it schedules it (T054, FR-014a)
 *
 * The chip is the draggable and day cells and the backlog are the drop targets — the drag half of
 * FR-014, whose tap half is the same sheet the chip opens. Both end at `updateItem`, which is what
 * makes "both paths produce an identical result" true by construction rather than by discipline.
 *
 * **The same `isPending` guard covers both**, and it has to: a drop names an id the server has not
 * issued. `useDraggable`'s `disabled` is what expresses that, rather than a conditional hook.
 *
 * `touch-none` on every chip is not a nicety (T055). Without it a vertical swipe starting on a chip
 * is claimed by the pointer sensor, the chip lifts instead of the grid scrolling, and it lands on
 * whatever cell the finger released over — silently rescheduling an item. The activation constraint
 * in `CalendarShell` is the other half; neither works alone.
 *
 * ## There is no keyboard drag, and that is an amendment rather than an omission
 *
 * research.md R-003 asked for a `KeyboardSensor` alongside the pointer one. It collides with a
 * decision taken later: **the chip is a `<button>`** (T052), and dnd-kit's keyboard activation codes
 * are `Space` and `Enter` — the button's own. Registering it means the sheet can no longer be opened
 * from the keyboard, which trades the *primary* path for the secondary one.
 *
 * So the activator is stripped and no `KeyboardSensor` is registered. The requirements are unaffected:
 * FR-015b asks that every date change be reachable **without a pointer-drag gesture**, and SC-011 that
 * the whole journey be completable without a drag — both are satisfied by the sheet's date input,
 * which R-003 itself designates the primary path. `research.md` R-003 and `tasks.md` T054 are amended
 * to match rather than left asserting the opposite.
 */
export function ItemChip({
  item,
  size = "full",
  today = null,
  onOpen,
  ghost = false,
  className,
}: {
  readonly item: ContentItem;
  readonly size?: CueSize;
  /**
   * Open this item in the item sheet (T052).
   *
   * **Required, not optional**, and that is deliberate: a chip the creator cannot open is a bug now
   * that the sheet exists, and an optional handler passed through a JSX spread is exactly how three of
   * the four call sites silently stopped opening anything — spreads skip excess-property checking, so
   * `onOpen` landing where `onOpenItem` was expected compiled cleanly and did nothing.
   */
  readonly onOpen: (item: ContentItem) => void;
  /**
   * Draw this as the thing following the finger, rather than as a row in a list.
   *
   * A dashed border on **all four sides**, which is the export's drag ghost — and deliberately not
   * the same treatment as overdue, which is dashed on the **left only**. `overdue.spec.ts` asserts
   * `borderTopStyle === \"solid\"` on an overdue chip precisely to keep the two apart, because an
   * overdue item being dragged would otherwise be indistinguishable from an overdue item at rest.
   */
  readonly ghost?: boolean;
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
  const openable = !pending;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    // A pending row has no server id to name, so it is not draggable for the same reason it is not
    // openable. `disabled` rather than skipping the hook — hooks cannot be conditional.
    disabled: pending,
    data: { item },
  });

  /**
   * The pointer listeners, **without** dnd-kit's keyboard activator — see the note above about why
   * this chip has no keyboard drag.
   */
  const { onKeyDown: _dragKeyDown, ...dragListeners } = listeners ?? {};

  // dnd-kit's `attributes` are spread only on a row that can actually be dragged. `disabled: true`
  // still emits `role="button"`, `tabindex="0"` and `aria-disabled`, which would make a pending row a
  // tab stop announcing itself as a disabled button — the exact thing the `<article>` fallback exists
  // to avoid. The row is not disabled; it is not yet a control.

  // One element either way. Wrapping the chip in a button instead would put a 44px target around a
  // 44px row and give the month grid's micro chip a second box to lay out inside a 50px cell.
  const Element = openable ? "button" : "article";

  return (
    <Element
      ref={setNodeRef}
      {...(pending ? {} : attributes)}
      {...dragListeners}
      {...(openable
        ? {
            type: "button" as const,
            onClick: () => onOpen(item),
            // The chip's visible content is the accessible name at `full` and `peek`; at `micro` the
            // title is `sr-only` and is still inside the button, so every size announces the item.
            "aria-label": `Edit ${item.title}`,
          }
        : {})}
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
      data-overdue={overdue ? "" : undefined}
      data-item-id={item.id}
      data-size={size}
      data-testid="item-chip"
      className={cn(
        "border-hairline flex items-center rounded-sm border",
        FRAME[size],
        openable &&
          "focus-ring text-left",
        // The comic-panel hover treatment (2026-08-11b) — `full`/`peek` only, and never on a ghost.
        // `micro` sits in a ~50px day cell with no room to spare for an offset shadow without bleeding
        // into the next cell; the drag overlay is not a thing a pointer "hovers", so the class would
        // be inert there anyway, and omitting it says so rather than leaving a dead class name.
        openable && !ghost && (size === "full" || size === "peek") && "comic-panel",
        // T055: the gesture arbitration half that lives on the element. Without it a vertical swipe
        // beginning on a chip is captured as a drag and the grid does not scroll.
        !pending && "touch-none",
        // The row the creator has lifted stays in place and dims; `DragOverlay` draws the thing that
        // follows the finger. Removing it from the flow instead would reflow the grid mid-drag and
        // move the drop target out from under them.
        isDragging && "opacity-40",
        // `border-l-dashed` is not a Tailwind utility — border *style* has no per-side variant — so
        // the one arbitrary property in this file. Without it `border-dashed` would dash all four
        // sides and the chip would read as the drag ghost the export draws with exactly that.
        overdue && OVERDUE_FRAME[size],
        ghost && "border-brand border-dashed shadow-e2",
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
            // 20px (T004's sign-off, `design/002-pixel-arcade-skin/BRIEF.md`): an item's title is
            // content, and content is 20px end to end. `peek`'s 170px strip shows fewer characters
            // before it truncates than it did at 12px — an accepted cost, not an oversight.
            "text-ink truncate text-xl leading-tight",
            size !== "peek" && "flex-1",
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
            // VT323, not Silkscreen, and 12px is the FR-033 floor — both below the 16px FR-034
            // enforces for the display face, so `full` (the only size that draws this rather than
            // burying it in `sr-only`) uses the content face at the size floor rather than Silkscreen.
            "text-overdue flex-none text-xs leading-none font-semibold tracking-[0.08em] uppercase",
            size !== "full" && "sr-only",
          )}
          data-testid="item-overdue"
        >
          Overdue
        </span>
      ) : null}

      <PlatformCue platform={item.platform} size={size} />

      {pending && size === "full" ? (
        <span className="text-ink-lo flex-none text-xs tracking-[0.08em] uppercase">Saving</span>
      ) : null}
    </Element>
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
