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
  onOpenChange,
  onDelete,
}: {
  /** The item to delete, or null when the dialog is closed. */
  readonly item: ContentItem | null;
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
      onOpenChange(false);
    } catch (caught) {
      // The dialog stays open, and the row has already been put back on the surface behind it by
      // `itemRestored`. Closing here would leave the creator believing a deletion happened.
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
      <AlertDialogContent
        className="notch-card bg-surface-2 border-hairline gap-0 p-5 shadow-e2"
        data-testid="delete-confirm"
      >
        <AlertDialogTitle className="font-display text-ink mb-2.5 text-[15px] leading-tight font-semibold tracking-[0.14em] uppercase">
          Delete this item?
        </AlertDialogTitle>

        <AlertDialogDescription
          className="text-ink-mid mb-3.5 text-[13px] leading-relaxed"
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
         * The item, drawn as it is drawn everywhere else. `onOpen` is a no-op: inside a confirmation
         * this is the subject, not a control — opening the editing sheet from here would put two
         * modal surfaces on screen with the destructive one behind.
         */}
        {item === null ? null : (
          <div className="mb-4.5" data-testid="delete-confirm-item">
            <ItemChip item={item} size="full" onOpen={noop} />
          </div>
        )}

        <AlertDialogFooter className="flex flex-col gap-2.5">
          {/*
           * First in the DOM and focused on open, which is the whole of FR-020's "not a single tap
           * away from a common gesture": `Enter` keeps the item, and the destructive action is
           * somewhere a thumb has to travel to deliberately.
           */}
          <AlertDialogCancel
            autoFocus
            className="border-hairline bg-surface-3 text-ink font-display h-12 w-full rounded-sm border text-[13px] font-semibold tracking-[0.16em] uppercase"
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
            // reaches for without reading.
            className="border-brand-hi/50 text-brand-hi font-display h-12 w-full rounded-sm border bg-transparent text-[13px] font-semibold tracking-[0.16em] uppercase disabled:opacity-50"
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
