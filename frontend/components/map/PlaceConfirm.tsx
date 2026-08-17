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
 * ## Occupies `QuickAdd`'s own floating slot, not a new one
 *
 * `MapShell.tsx` shows this **instead of** `QuickAdd` whenever a place is being confirmed, reusing
 * the exact `absolute inset-x-3 bottom-2` position `QuickAdd.tsx` already anchors to over the map's
 * lower edge. The two are mutually exclusive by construction — confirming an existing place and
 * marking a new one are different modes, there is no 375px room for both floating panels at once,
 * and reusing the slot means no new layout math and nothing new that could collide with it.
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
      className="border-hairline notch-card bg-surface-0/95 absolute inset-x-3 bottom-2 z-10 flex items-center gap-2 border p-2 shadow-e1"
      data-testid="place-confirm"
    >
      <div className="min-w-0 flex-1">
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

      <button
        type="button"
        onClick={onDismiss}
        className="border-hairline text-ink-mid focus-ring h-11 shrink-0 rounded-sm border px-3 text-[11px] font-semibold tracking-[0.08em] uppercase"
        data-testid="place-confirm-dismiss"
      >
        Dismiss
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="bg-brand font-display focus-ring-inset h-11 shrink-0 rounded-sm px-4 text-[11px] font-semibold tracking-[0.08em] text-white uppercase shadow-e1"
        data-testid="place-confirm-open"
      >
        Open
      </button>
    </div>
  );
}
