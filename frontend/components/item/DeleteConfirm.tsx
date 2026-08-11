"use client";

import { useState } from "react";

import { ItemChip } from "@/components/item/ItemChip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError, type ContentItem } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { playCue } from "@/lib/sound";

/**
 * The delete confirmation (T056, FR-004, FR-020, SC-007, spec Edge Cases).
 *
 * Built from the export's `Delete confirm 375` panel (`1j` dark / `2j` light), whose own footnote is
 * the requirement in one line: *"Keep is focused by default. Delete is the lower, unstyled-weight
 * action — no swipe or back gesture reaches it."*
 *
 * ## Three separate things FR-020 asks for, and each is a different mechanism
 *
 * 1. **An explicit confirmation.** An `AlertDialog` rather than a `Sheet`: `role="alertdialog"`, a
 *    focus trap, and no dismissal by clicking outside. A sheet can be swiped or scrimmed away, and
 *    "dismissed by accident" is the failure this dialog exists to prevent.
 * 2. **Not reachable by a single tap.** Two taps minimum from anywhere: the item sheet's `DELETE
 *    ITEM`, then `DELETE PERMANENTLY`. The first is itself two taps from the calendar — chip, then
 *    delete — so an accidental deletion needs three deliberate ones.
 * 3. **Not next to a common navigation gesture.** `KEEP ITEM` is first in the DOM and **focused on
 *    open**, so `Enter` — the key a creator is most likely to be holding after activating a button —
 *    keeps the item. Delete sits *below* it, in the muted weight, where no back gesture and no
 *    scrim tap lands.
 *
 * ## The item itself is shown, not just its title
 *
 * The export puts a real chip in the dialog, and it is doing FR-018's job at the moment it matters
 * most: the creator is about to destroy something irreversible, and the status cue and platform
 * monogram are how they check it is the right one. A quoted title alone is exactly the amount of
 * information that lets someone delete the wrong item confidently.
 *
 * ## A 404 is not an error here
 *
 * `deleteItem` in `lib/items.ts` resolves on 404 rather than rejecting, and that decision belongs to
 * this surface's story rather than to the transport: the creator asked for the item to be gone, and
 * it is gone. See the note there. Everything else keeps the dialog open with the message.
 */
export function DeleteConfirm({
  item,
  today,
  onOpenChange,
  onDelete,
}: {
  /** The item to delete, or null when the dialog is closed. */
  readonly item: ContentItem | null;
  /**
   * The creator's own calendar day, so the chip below can carry its overdue border.
   *
   * **Required, not defaulted**, and the Phase 5 `reviewer` pass is why. `ItemChip` defaults `today`
   * to `null` and `isOverdue(item, null)` is false, so omitting it silently drops the overdue cue —
   * on the one surface whose entire justification is "check it is the right one before destroying
   * it", and for a dated item, which this dialog can certainly hold. Nothing failed; the border
   * simply was not drawn.
   */
  readonly today: DateOnly | null;
  readonly onOpenChange: (open: boolean) => void;
  /** `deleteItem` from `useContentItems`. Rejects with an `ApiError` this dialog renders. */
  readonly onDelete: (item: ContentItem) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirm(): Promise<void> {
    if (item === null || deleting) return;

    setDeleting(true);
    setError(null);

    try {
      await onDelete(item);
      playCue("delete");
      onOpenChange(false);
    } catch (caught) {
      // The dialog stays open, and the row has already been put back on the surface behind it by
      // `itemRestored`. Closing here would leave the creator believing a deletion happened.
      playCue("refuse");
      setError(
        caught instanceof ApiError
          ? caught.detail
          : "Could not delete that item. It is still here — try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      {/*
       * `notch-card` dropped (002 T023): the reference's chrome is sharp-cornered, and the primitive
       * (`ui/alert-dialog.tsx`, restyled at T025) already carries `border-hairline`/`rounded-sm`/
       * `shadow-e2` — kept here anyway via `cn`'s dedup, harmlessly redundant, so this override is
       * only the two things that actually differ from the primitive: the surface tint and spacing.
       */}
      <AlertDialogContent className="bg-surface-2 gap-0 p-5" data-testid="delete-confirm">
        {/*
         * No local font-size or font-family here (002 T023, dropped `text-[15px] font-display`): the
         * primitive's own `text-base font-display` is already 16px Silkscreen, which is exactly
         * FR-034's floor for the display face. The 15px override was silently breaking that floor by
         * one pixel — found by `text-size-audit.spec.ts`, not by eye.
         */}
        <AlertDialogTitle className="text-ink mb-2.5 leading-tight tracking-[0.14em]">
          Delete this item?
        </AlertDialogTitle>

        <AlertDialogDescription
          // Already compliant pre-002 and unchanged here: 13px, font-sans (no font-display override),
          // clears both FR-033's 12px floor and FR-034 (the display face is never involved). `break-
          // words` because this sentence quotes the creator's own title, and a title with no spaces in
          // it is a single unbreakable word as far as the line breaker is concerned — see the note on
          // the row below, which is the same defect one element over.
          className="text-ink-mid mb-3.5 text-[13px] leading-relaxed break-words"
          data-testid="delete-confirm-message"
        >
          {error ?? (
            <>
              {/*
               * The export's wording, and "There is no trash and no undo" is load-bearing rather than
               * dramatic: FR-004 is a hard delete, and the stage-2 data-shape audit cleared this
               * sentence specifically as *reinforcing* that rather than implying a soft one. A
               * creator who expects a trash can is a creator who deletes carelessly once.
               */}
              &ldquo;{item?.title}&rdquo; will be removed permanently. There is no trash and no
              undo.
            </>
          )}
        </AlertDialogDescription>

        {/*
         * The item, drawn as it is drawn everywhere else — including its overdue border, which is
         * why `today` is threaded in. `onOpen` is a no-op: inside a confirmation
         * this is the subject, not a control — opening the editing sheet from here would put two
         * modal surfaces on screen with the destructive one behind.
         */}
        {item === null ? null : (
          /*
           * **`min-w-0` is load-bearing, and T069's audit is what found that out.** `ItemChip`'s
           * title is `truncate`, which is `white-space: nowrap` — so the chip's *min-content* width
           * is the entire title, however long the creator made it. `AlertDialogContent` is a
           * `grid`, and a grid track's automatic minimum is its items' min-content, so a long title
           * stretched the track to **561px on a 375px screen**: both buttons are `w-full`, so
           * `KEEP ITEM` and `DELETE PERMANENTLY` rendered 561px wide and ran off the right edge with
           * their labels cut in half. The `max-w-xs` on the dialog box did nothing, because content
           * overflows a track rather than being clamped by it.
           *
           * None of the suite could see it: the dialog is `position: fixed`, so nothing extended the
           * document's scroll width and `delete-item.spec.ts`'s overflow check stayed green while
           * the confirmation for a destructive action was unreadable.
           *
           * `min-w-0` lowers the item's automatic minimum to zero, which is what lets the track
           * shrink to the dialog and the chip's own `truncate` finally do its job. `BacklogRow`
           * already passes the same class for the same reason.
           */
          <div className="mb-4.5 min-w-0" data-testid="delete-confirm-item">
            {/*
             * `w-full` as well, because `ItemChip` renders a `<button>` and a button is
             * `inline-block` — it sizes to its content, not to its parent, so shrinking the track
             * above left the chip itself still 561px wide inside a 320px box. `BacklogRow` passes
             * `min-w-0 flex-1` for the same reason, in a flex row rather than a grid.
             */}
            <ItemChip item={item} size="full" today={today} onOpen={noop} className="w-full min-w-0" />
          </div>
        )}

        <AlertDialogFooter className="flex flex-col gap-2.5">
          {/*
           * First in the DOM and focused on open, which is the whole of FR-020's "not a single tap
           * away from a common gesture": `Enter` keeps the item, and the destructive action is
           * somewhere a thumb has to travel to deliberately.
           */}
          {/* `font-display` dropped (002 T023) — 13px Silkscreen broke FR-034; VT323 (font-sans) now. */}
          <AlertDialogCancel
            autoFocus
            className="border-hairline bg-surface-3 text-ink focus-ring h-12 w-full rounded-sm border text-[13px] font-semibold tracking-[0.16em] uppercase"
            data-testid="delete-keep"
          >
            Keep item
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={(event) => {
              // The dialog must not close on its own: a refused delete has to keep this open to
              // render why, and `confirm()` closes it on success.
              event.preventDefault();
              void confirm();
            }}
            disabled={deleting}
            // Outlined and muted rather than a filled brand button. The export is explicit that the
            // destructive action carries the *lower* visual weight — a red button is the one a thumb
            // reaches for without reading. `border-danger-hi`/`text-danger-hi`, not `brand-hi` (002
            // T023): this is the one control on the surface that should read as a warning, and brand
            // is chrome-only now that the accent split into a dedicated danger red. `font-display`
            // dropped for the same FR-034 reason as `delete-keep` above.
            className="border-danger-hi/50 text-danger-hi focus-ring h-12 w-full rounded-sm border bg-transparent text-[13px] font-semibold tracking-[0.16em] uppercase disabled:opacity-50"
            data-testid="delete-confirm-action"
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function noop(): void {}
