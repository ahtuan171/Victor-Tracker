import type { Platform } from "@/lib/api";
import { platformCue, type CueSize } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * The platform cue (T039, FR-018, research.md R-005).
 *
 * A monogram badge — T, I, Y — from the export's `1b`/`2b` panel: a 20px bordered square in the full
 * chip, and a bare 9px letter in the micro chip, where a 50px day cell has no room for a box around
 * it. Logos were rejected in R-005: trademarked assets, illegible at this size, and a bundle cost for
 * something a text node does.
 *
 * ## It renders nothing when there is no platform, and that is the interesting case
 *
 * FR-005 makes title the only required field, so **every captured idea starts with no platform** and
 * stays that way until the creator assigns one at T052. Returning `null` here keeps that decision in
 * one place rather than in each surface — `lib/status.ts`'s `platformCue` takes the null and hands
 * back null, and the chip simply has no badge. Rendering a placeholder box instead would put an empty
 * square on the majority of chips in a fresh account, which reads as something failing to load.
 */
export function PlatformCue({
  platform,
  size = "full",
  className,
}: {
  readonly platform: Platform | null;
  readonly size?: CueSize;
  readonly className?: string;
}) {
  const cue = platformCue(platform);
  if (cue === null) return null;

  return (
    <span
      role="img"
      aria-label={cue.label}
      data-platform={cue.platform}
      data-testid="platform-cue"
      className={cn(
        // VT323 (font-sans, the default), not Silkscreen — FR-034 forbids the display face below
        // 16px, and every one of these badges is smaller than that.
        "text-ink-mid flex-none text-center font-semibold",
        BADGE[size],
        className,
      )}
    >
      {cue.monogram}
    </span>
  );
}

/**
 * The export's three badges. `micro` has **no box** — at 8-9px the border would be most of the ink
 * and the letter, which is the actual information, would lose out. The other two are bordered squares
 * whose line-height centres the glyph without a flex context.
 */
const BADGE: Readonly<Record<CueSize, string>> = {
  // 12px is the FR-033 floor (nothing anywhere renders below it); the box in `peek`/`full` grows by
  // 2px each over the outgoing sizes to keep the now-larger glyph from crowding its border.
  micro: "text-xs leading-none",
  peek: "border-hairline size-5 rounded-sm border text-xs leading-[18px]",
  full: "border-hairline size-6 rounded-sm border text-xs leading-[22px]",
};
