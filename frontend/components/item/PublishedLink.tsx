"use client";

import type { ContentItem } from "@/lib/api";
import { isValidPublishedUrl } from "@/lib/items";
import { cn } from "@/lib/utils";

/**
 * The control that opens an item's published post outside the app (T065, FR-019, US5 scenario 3).
 *
 * Renders nothing when the item carries no link, so a call site can place it unconditionally beside
 * a chip and let the data decide.
 *
 * ## It is a sibling of the chip, never a child of it
 *
 * `ItemChip` is a `<button>` since T052, and an `<a>` inside a `<button>` is invalid HTML — the
 * parser hoists it out, and what the creator ends up tapping is undefined. It is also wrong at the
 * interaction level even where a browser tolerates it: the chip's tap opens the item sheet and this
 * one leaves the app entirely, so nesting them puts two different destinations under one target.
 * Every call site therefore renders the chip and this control as two children of the row.
 *
 * That is also what keeps the drag working. The draggable node is the chip alone (`setNodeRef`), so
 * a pointer that goes down here never reaches `useDraggable`'s listeners and the link cannot be
 * dragged onto a day cell by accident.
 *
 * ## `rel="noopener noreferrer"` is the requirement, not a habit
 *
 * `noreferrer` is the half constitution II asks for: without it the browser sends the calendar's own
 * URL as a `Referer` to TikTok, Instagram or YouTube on every tap, which hands a third party the
 * address of a private planning surface as a side effect of opening a link. `noopener` is the other
 * half — it denies the opened tab a `window.opener` handle back into the app. Modern browsers imply
 * the second from the first; both are spelled out because the guarantee is the point and an implied
 * one is not visible to the next reader.
 *
 * ## Presence of a link is the whole condition — status is not consulted
 *
 * T065's task line said "on `posted` items", and the line was **amended** rather than implemented as
 * written (see `tasks.md`). FR-008a retains the link when an item moves *back* out of `posted`, and
 * the post it points at is still live — so gating on status would take a working link off the
 * calendar the moment the creator reversed a status, for no stated reason. US5 scenario 3 sets the
 * condition without mentioning status at all: *"Given a stored published link, when the creator opens
 * it, then it opens the live post outside the app."* One condition, matching the scenario.
 */
export function PublishedLink({
  item,
  className,
}: {
  readonly item: ContentItem;
  readonly className?: string;
}) {
  /*
   * Nothing to open, or nothing safe to open.
   *
   * The scheme check is **not** validation duplicated from T066 — it is what keeps a
   * `javascript:` string from ever becoming an `href`. On the grid and in the drawer it can never
   * fire: those render saved rows, and the backend has refused anything but `http(s)` since T030.
   * The sheet is where it earns its place, because there the value is the creator's **live draft**,
   * one keystroke old and not yet shown to any server.
   *
   * It uses the contract's own pattern (`isValidPublishedUrl`), so this control can never refuse a
   * link the API would have stored — the direction of drift T063 and T066 both guard.
   */
  if (item.published_url === null || !isValidPublishedUrl(item.published_url)) return null;

  return (
    <a
      href={item.published_url}
      // "Outside the app" (US5 scenario 3) — and the calendar stays open behind it, which matters on
      // a phone where a back gesture out of a platform app is not always a return to the browser.
      target="_blank"
      rel="noopener noreferrer"
      /*
       * The glyph is `aria-hidden` and the name lives here, exactly as `PeriodNav`'s arrows do: `↗`
       * announces as "north east arrow" or as nothing at all depending on the screen reader. The
       * title is in the name because a week section can hold several of these, and "Open the
       * published post" repeated five times names none of them.
       */
      aria-label={`Open the published post for ${item.title}`}
      className={cn(
        // 44px square — the tap floor in `.claude/rules/design.md`, which is what confines this
        // control to the `full` chip's row (see the call sites).
        "border-hairline bg-surface-3 text-ink-mid focus-visible:ring-brand-hi flex h-11 w-11 flex-none items-center justify-center rounded-sm border text-sm leading-none focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      data-testid="item-published-link"
    >
      <span aria-hidden="true">↗</span>
    </a>
  );
}
