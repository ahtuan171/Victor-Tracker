"use client";

import type { Destination } from "@/lib/api";
import { pinTreatment } from "@/lib/map";
import { cn } from "@/lib/utils";

/**
 * The confirmation step between selecting a pin and opening its full detail (004, T008,
 * FR-006–FR-008, User Story 2).
 *
 * Names the place and its status, and offers exactly one action ("Open") that requests the full
 * detail — nothing here saves, edits, or fetches anything, so a mis-tap on a crowded map costs a
 * glance rather than a screen (spec.md's own framing).
 *
 * ## A card, not a bar — `MapView.tsx` hosts it in a `maplibregl.Popup` anchored to the pin
 *
 * **Redesigned (004, T009 follow-up)** from the original full-width bar anchored to the map's own
 * lower edge (which briefly shared `QuickAdd.tsx`'s floating slot) into a compact card that floats
 * directly over the selected pin, per the owner's own reference images: "which place is this"
 * should read at the place itself, not at the bottom of the screen. `MapView.tsx` owns the popup's
 * lifecycle and position — this component only renders its content, so it carries no positioning
 * classes of its own (`w-64` bounds its width; everything else is intrinsic).
 *
 * `QuickAdd` is no longer suppressed while a place is being confirmed — the two no longer compete
 * for the same screen region now that this card floats at the pin instead of the map's edge.
 *
 * ## Dismissing changes nothing (FR-008)
 *
 * This component reads `destination` but never writes it — there is no save path here at all, so
 * "dismiss" needing to leave the place untouched is true by construction rather than something a
 * handler has to remember to uphold.
 */
export function PlaceConfirm({
  destination,
  onOpen,
  onDismiss,
}: {
  readonly destination: Destination;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}) {
  const treatment = pinTreatment(destination.status);

  return (
    <div
      className="border-hairline notch-card bg-surface-0/95 flex w-64 flex-col gap-2 border p-3 shadow-e1"
      data-testid="place-confirm"
    >
      <div className="min-w-0">
        <p className="text-ink truncate text-sm font-semibold" data-testid="place-confirm-name">
          {destination.name}
        </p>
        <p
          className={cn(
            "truncate text-[11px] leading-none font-semibold tracking-[0.08em] uppercase",
            treatment.textClass,
          )}
          data-testid="place-confirm-status"
        >
          {treatment.label}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="border-hairline text-ink-mid focus-ring h-11 flex-1 rounded-sm border text-[11px] font-semibold tracking-[0.08em] uppercase"
          data-testid="place-confirm-dismiss"
        >
          Dismiss
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="bg-brand font-display focus-ring-inset h-11 flex-1 rounded-sm text-[11px] font-semibold tracking-[0.08em] text-white uppercase shadow-e1"
          data-testid="place-confirm-open"
        >
          Open
        </button>
      </div>
    </div>
  );
}
