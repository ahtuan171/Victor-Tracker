"use client";

import { useId, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, type ContentItem, type ContentItemCreate } from "@/lib/api";

/**
 * Capture an idea before it evaporates (T034, FR-005, FR-022, SC-001, US1).
 *
 * Built from the export's `Capture sheet 375` panel (`1f` dark / `2f` light): bottom-anchored, one
 * field, a grip bar and an uppercase title, a line of helper text, then `CANCEL` and
 * `SAVE TO BACKLOG`.
 *
 * ## One field, and it stays one field
 *
 * FR-005 makes title the only required field, and `.claude/memory.md` records why in a sentence that
 * should be read before adding a second one: *"ideas arrive mid-task, and any required field is
 * enough friction to send the creator back to a notes app."* Platform, date, hook and link all exist
 * — the item sheet at T052 is where they are set, on an item that already exists. **This sheet is
 * not a smaller version of that one**, and adding "just a platform picker" here would trade the only
 * capability US1 has for a field the creator can fill in later.
 *
 * ## Three interactions from the landing screen
 *
 * Tap `+ CAPTURE`, type, tap `SAVE TO BACKLOG`. That is the budget SC-001 gives and there is no room
 * in it for a confirmation step or a second screen — `tests/e2e/capture.spec.ts` counts them, because
 * a fourth is the kind of thing that arrives one reasonable-sounding change at a time.
 *
 * ## Errors keep the creator's typing
 *
 * A refused save leaves the sheet open with the text intact. `lib/items.ts` rethrows write failures
 * rather than folding them into the list's error state precisely so this component can do that —
 * discarding both the row and the typing is the worst outcome of a failed save, and it is what
 * closing the sheet optimistically would produce.
 */
export function CaptureSheet({
  open,
  onOpenChange,
  onCapture,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `createItem` from `useContentItems`. Rejects with an `ApiError` the sheet renders. */
  readonly onCapture: (draft: ContentItemCreate) => Promise<ContentItem>;
}) {
  const titleId = useId();
  const errorId = useId();

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Trimmed here as well as at the API boundary, and both matter for different reasons. The backend
   * refuses a title that trims to nothing with a 422 (INV-2); this stops the request being made at
   * all, so the creator gets an instant answer rather than a round trip to be told no.
   */
  const trimmed = title.trim();

  async function save(): Promise<void> {
    if (trimmed === "" || saving) return;

    setSaving(true);
    setError(null);

    try {
      await onCapture({ title: trimmed });
      // Only on success. The sheet is what holds the creator's text, so it closes when there is
      // nothing left to lose.
      setTitle("");
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.detail
          : "Could not save that idea. It is still here — try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function close(): void {
    // The text is deliberately *kept* across a cancel. Reopening the sheet with a half-typed idea
    // still there is the forgiving behaviour; clearing it makes a mis-tap on the scrim destructive,
    // which `.claude/rules/design.md` reserves for confirmed actions.
    setError(null);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // `showCloseButton` off: the export gives this sheet an explicit CANCEL in the button row,
        // and a second dismissal affordance in the corner is a 44px tap target competing with the
        // one field on screen.
        showCloseButton={false}
        // `notch-sheet` dropped (002 T021) — sharp-cornered chrome, matching the other overlays.
        className="bg-surface-1 border-hairline gap-0 p-0 shadow-e2"
        aria-describedby={errorId}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4">
          {/* Decorative grip, straight from the export. Hidden from assistive tech — it affords
              nothing here, because this sheet is not draggable. */}
          <span className="bg-ink-lo/50 h-[3px] w-[34px] rounded-sm" aria-hidden="true" />
          {/*
           * 002 T021: dropped the local `text-[13px]` (it was undercutting the primitive's own
           * compliant `text-base font-display` by 3px, the same bug T023 found in
           * AlertDialogTitle) — no size/family override needed, only the extra tracking.
           */}
          <SheetTitle className="text-ink leading-none tracking-[0.18em]">Capture idea</SheetTitle>
        </div>

        <div className="px-4 pt-3.5">
          {/* 002 T021: dropped font-display, 10px -> the 12px floor. */}
          <label
            htmlFor={titleId}
            className="text-ink-mid mb-2 block text-xs leading-none font-semibold tracking-[0.2em] uppercase"
          >
            Title
          </label>

          <input
            id={titleId}
            // Focused on open so "tap capture, type" is genuinely two interactions rather than
            // three. `autoFocus` is what makes the mobile keyboard appear without a second tap.
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
            // `maxLength` mirrors the contract's 200 rather than trusting the server to refuse a
            // 201st character after the creator has typed it.
            maxLength={200}
            placeholder="Rooftop b-roll cutdown"
            // `text-base` is 16px and is not a style choice: iOS zooms the page in when focusing any
            // input below 16px, which throws away the layout on a 375px floor. h-13 is 52px, the
            // export's field height, comfortably past the 44px tap minimum.
            className="border-hairline bg-surface-3 text-ink placeholder:text-ink-lo focus-ring h-13 w-full rounded-sm border px-3 text-base"
            aria-invalid={error !== null}
            {...(error !== null ? { "aria-describedby": errorId } : {})}
          />

          <SheetDescription
            id={errorId}
            role={error !== null ? "alert" : undefined}
            // `text-danger-hi`, not `text-brand-hi` (002 T021): brand is chrome-only now that the
            // accent split into cyan (chrome) and a dedicated danger red for errors/refusals.
            className={
              error !== null
                ? "text-danger-hi mt-2 text-xs leading-relaxed"
                : "text-ink-mid mt-2 text-xs leading-relaxed"
            }
          >
            {/*
             * The helper line is the export's, and it is doing real work: it tells the creator that
             * a title-only capture is complete rather than half-finished, which is what stops them
             * hunting for the date field this sheet deliberately does not have.
             */}
            {error ?? "Saves to the backlog. Add a date later by dragging it onto a day."}
          </SheetDescription>
        </div>

        <div className="flex gap-2.5 px-4 pt-4 pb-4.5">
          {/* 002 T021: dropped font-display (12px broke FR-034). */}
          <button
            type="button"
            onClick={close}
            className="border-hairline text-ink-mid focus-ring h-12 flex-none rounded-sm border px-4.5 text-xs font-semibold tracking-[0.16em] uppercase"
          >
            Cancel
          </button>

          {/*
           * 002 T021: dropped font-display (14px broke FR-034) and notch-card (sharp-cornered
           * chrome; it was the reason this needed focus-ring-inset instead of the plain outset ring).
           */}
          <button
            type="button"
            onClick={() => void save()}
            // Disabled on an empty title rather than validated on submit: the button is the answer
            // to "is this saveable yet", and a submit that bounces is a worse answer.
            disabled={trimmed === "" || saving}
            className="bg-brand focus-ring h-12 flex-1 rounded-none text-sm font-semibold tracking-[0.16em] text-white uppercase shadow-e1 disabled:opacity-50"
            data-testid="capture-save"
          >
            {saving ? "Saving…" : "Save to backlog"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
