"use client";

import type { CalendarView } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * The view toggle and the adjacent-period controls (T044, FR-013, FR-022).
 *
 * Built from the export's bottom bar, which is identical on `Month grid 375` (`1c`) and `Week view
 * 375` (`1e`): a two-segment MONTH/WEEK control, then `‹` and `›`, then a spacer, then `+ CAPTURE`.
 *
 * ## Why it lives in the bottom band and not beside the period title
 *
 * FR-022 and `.claude/rules/design.md`: "primary actions sit within thumb reach — bottom half of the
 * screen, not a top-right toolbar". Navigating periods is the single most repeated action in this
 * surface, and the period title it changes is at the *top* of the screen — which is exactly the layout
 * that tempts a `‹ March 2026 ›` header, 700px from a thumb on a phone held one-handed. The controls
 * go where the hand is and the title stays where it reads. `CalendarShell` reserved this slot at T033.
 *
 * ## Every control is 44px tall, and that is a floor rather than a style
 *
 * Every shadcn size variant is desktop-scaled (`frontend/AGENTS.md`), so heights here are explicit.
 * `tests/e2e/period-nav.spec.ts` asserts the 44px minimum so a restyle cannot quietly drop it — the
 * arrows are the narrowest targets on the surface and the ones most often hit in a hurry.
 *
 * ## Disabled before the clock is known
 *
 * There is no period to step away from until `CalendarShell` has read the browser's clock after mount
 * (research.md R-006 addendum), so the arrows are genuinely disabled for that frame rather than
 * quietly no-op. The toggle is not: which view the creator prefers does not depend on what day it is.
 */
export function PeriodNav({
  view,
  onViewChange,
  onShift,
  disabled,
}: {
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
  /** `-1` for the previous period, `+1` for the next. The shell owns what that means. */
  readonly onShift: (delta: number) => void;
  /** True until the browser's clock has been read — there is no current period to step from. */
  readonly disabled: boolean;
}) {
  const noun = view === "month" ? "month" : "week";

  return (
    <>
      {/*
       * A radio group rather than two buttons with `aria-pressed`: these are two values of one
       * setting, exactly one of which is always on, which is what a radio group means and what a pair
       * of independent toggles does not.
       */}
      <div
        role="radiogroup"
        aria-label="Calendar view"
        className="border-hairline bg-surface-2 flex flex-none overflow-hidden rounded-sm border"
        data-testid="view-toggle"
      >
        {VIEWS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={view === candidate}
            onClick={() => onViewChange(candidate)}
            className={cn(
              // `font-display` dropped (002 T016): Silkscreen below 16px breaks FR-034, and these
              // labels are 12px. `focus-ring-inset` stays — the group's `overflow-hidden` wrapper
              // still clips an outset ring the same way it did before this restyle.
              "focus-ring-inset h-11 px-3 text-xs leading-none font-semibold tracking-[0.12em] whitespace-nowrap uppercase",
              view === candidate ? "bg-brand text-white" : "text-ink-lo",
            )}
            data-testid={`view-${candidate}`}
          >
            {candidate}
          </button>
        ))}
      </div>

      <PeriodStep
        label={`Previous ${noun}`}
        glyph="‹"
        onClick={() => onShift(-1)}
        disabled={disabled}
      />
      <PeriodStep label={`Next ${noun}`} glyph="›" onClick={() => onShift(1)} disabled={disabled} />
    </>
  );
}

const VIEWS: readonly CalendarView[] = ["month", "week"];

/**
 * One arrow.
 *
 * The glyph is `aria-hidden` and the button carries a real label, because `‹` announces as "single
 * left-pointing angle quotation mark" or as nothing at all depending on the screen reader — and the
 * label has to say *which* period anyway, since the same arrow moves a month or a week depending on
 * the toggle beside it.
 */
function PeriodStep({
  label,
  glyph,
  onClick,
  disabled,
}: {
  readonly label: string;
  readonly glyph: string;
  readonly onClick: () => void;
  readonly disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      // T052: press-feedback on the arrows, the most-tapped controls on this surface.
      className="press-feedback border-hairline bg-surface-2 text-ink-mid focus-ring h-11 w-10 flex-none rounded-sm border text-base leading-none font-semibold disabled:opacity-40"
      data-testid={label.startsWith("Previous") ? "period-previous" : "period-next"}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
