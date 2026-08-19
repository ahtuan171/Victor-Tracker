"use client";

/**
 * A Wishlist place's content: an honest empty state, nothing else (004, T023, FR-015, FR-016).
 *
 * No photo gallery, no note section, no blank date fields presented as content — a Wishlist place
 * has none of that yet, and showing empty versions of `VisitedPanel`'s or `PlannedPanel`'s sections
 * would read as content rather than as the absence FR-015 asks for. The "plan it" offer points at
 * the status control `DestinationSheet` already renders above this panel — moving that to Planned
 * is what actually plans the place, so this panel adds no second control that would do the same
 * thing a second way.
 */
export function WishlistPanel() {
  return (
    <div className="flex flex-col gap-1.5" data-testid="destination-wishlist-empty">
      <p className="text-ink text-sm leading-relaxed">Nothing planned yet.</p>
      <p className="text-ink-lo text-xs leading-relaxed">
        Set the status above to Planned to give it dates and a Trip.
      </p>
    </div>
  );
}
