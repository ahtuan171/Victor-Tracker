"use client";

import type { Platform } from "@/lib/api";
import { platformCue } from "@/lib/status";

/**
 * What the calendar shows when the platform filter has hidden everything (T062, FR-016, spec Edge
 * Cases, US4 scenario 4).
 *
 * Built from the export's `Filtered empty 375` panel (`1i` dark / `2i` light): a dashed, faintly
 * textured region where the grid would be, carrying the platform monogram, a headline, a sentence of
 * explanation, and a button that clears the filter.
 *
 * ## When it appears, and why that is not "this month is empty"
 *
 * The condition is **the filter is on and no loaded item matches it** — not "no item falls in the
 * period on screen". The spec's edge case is worded *"All items filtered out"*, and that is the state
 * a creator cannot get out of by themselves: every day cell is empty, the backlog is empty, and
 * nothing on the surface explains why. An empty *month* is a different thing entirely — the items
 * exist, the period arrows are right there, and a month with nothing planned is a normal thing for a
 * calendar to show. Drawing this over an empty March while TikTok items sit in April would be telling
 * the creator their filter is the problem when navigating is the answer.
 *
 * ## The copy names the filter, and drops the export's period clause
 *
 * The export writes *"No YouTube items in March 2026"*. That clause is **deliberately not carried
 * over**: under the condition above there are no items on this platform in *any* period, so naming
 * one month would suggest another month might have some. This is the second place a line of export
 * copy is changed on purpose — T035 was the first, where the drawer was not allowed to promise a drag
 * that did not exist yet.
 *
 * Naming the platform is the part that is required rather than stylistic. The edge case asks for an
 * empty state "naming the active filter, not a blank screen", and the button repeats the name for the
 * same reason: it is the one control that undoes the state the creator is stuck in.
 */
export function FilteredEmpty({
  platform,
  onClear,
}: {
  /** The platform in effect. Non-null by construction — this renders only when a filter is on. */
  readonly platform: Platform;
  readonly onClear: () => void;
}) {
  const cue = platformCue(platform)!;

  return (
    <div
      // The dashed border and the faint web texture are the export's, and they say "this region is
      // empty on purpose" in a way an unstyled gap cannot. `.web-grain` is the token-level texture
      // class from `globals.css` — see `frontend/AGENTS.md` on why these are CSS classes.
      className="border-hairline web-grain m-4 flex flex-col items-center justify-center gap-3.5 border border-dashed px-6 py-14 text-center"
      data-testid="filtered-empty"
      data-platform={platform}
    >
      {/* 002 T024: dropped font-display (12px broke FR-034). */}
      <span
        className="border-hairline text-ink-mid flex h-[22px] w-[22px] items-center justify-center rounded-sm border text-xs font-semibold"
        aria-hidden="true"
      >
        {cue.monogram}
      </span>

      {/*
       * `role="status"` rather than a plain heading: the filter is applied without navigating, so a
       * screen-reader user gets no page change to tell them the calendar just emptied. This is the
       * announcement that the narrowing happened and what caused it.
       */}
      {/*
       * 002 T024: 15px -> 16px, keeping font-display (Silkscreen). FR-034's floor is exactly 16px, so
       * this was one pixel under it — raising it, rather than dropping the display face like the
       * smaller labels on this surface, keeps this headline's weight consistent with FirstRun's
       * sibling treatment (also font-display, also a `role="status"` headline).
       */}
      <p
        role="status"
        className="font-display text-ink text-base leading-tight font-semibold tracking-[0.14em] uppercase"
        data-testid="filtered-empty-headline"
      >
        No {cue.label} items
      </p>

      <p className="text-ink-mid max-w-[230px] text-[13px] leading-relaxed">
        The {cue.label} filter is on. Clear it to see your other items again.
      </p>

      {/*
       * `h-11` (44px) — the export draws this one at 44px already, unlike the filter row's own
       * options. It is the way out of a state where nothing else on screen is actionable, so it is
       * the last control that should be hard to hit.
       */}
      <button
        type="button"
        onClick={onClear}
        className="border-hairline bg-surface-2 text-ink font-display focus-ring h-11 rounded-sm border px-4 text-xs font-semibold tracking-[0.16em] uppercase"
        data-testid="filtered-empty-clear"
      >
        Clear {cue.label} filter
      </button>
    </div>
  );
}
