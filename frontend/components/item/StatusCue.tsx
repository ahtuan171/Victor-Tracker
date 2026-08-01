import type { Status } from "@/lib/api";
import { statusCue } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * The status cue (T039, FR-017, SC-004, research.md R-005).
 *
 * Built from the export's `Item chip` panel (`1b` dark / `2b` light): a circle that is an outline for
 * `idea`, filled to its vertical midline for `draft`, and a solid disc carrying a check for `posted`.
 * The encoding itself lives in `lib/status.ts` — this component owns **geometry and nothing else**,
 * which is why a new status would be a one-line change there rather than a new branch here.
 *
 * ## Why the fill is a gradient rather than a second element
 *
 * `draft` is half a disc. The alternatives are an inner absolutely-positioned element (two nodes per
 * chip, and a 375px day cell can hold several) or an SVG per cue (a path where a border-radius does).
 * A hard-stopped linear gradient is one node and one declaration, and it greys out correctly — which
 * is the property SC-004 is actually about.
 *
 * The colour comes through `var(--color-status-*)`, the token `app/globals.css` defines. **Never a
 * hex**: the design export establishes these tokens for all four CreatorHub modules, so a literal
 * here would be a project-wide decision taken in a component.
 *
 * ## It names itself
 *
 * `role="img"` with the status label, because a shape announces as nothing at all and FR-017 requires
 * status to be legible "without opening the item" — which has to include a creator who is not looking
 * at it. `ItemChip` deliberately does **not** override this with an `aria-label` of its own: the chip
 * reads out as its parts, "Draft, Rooftop b-roll cutdown, TikTok", which is the same information in
 * the same order as the visual one.
 */
export function StatusCue({
  status,
  size = "full",
  className,
}: {
  readonly status: Status;
  /**
   * `micro` is the 50px day cell's chip, where the title is dropped entirely and the cue is 8px;
   * `full` is the week list and the backlog drawer at 14px. Two sizes because the export draws two,
   * and because a single size that fits a day cell is unreadable in a drawer row.
   */
  readonly size?: "micro" | "full";
  readonly className?: string;
}) {
  const cue = statusCue(status);

  // `border-2` at 14px and `border` (1px, nudged to 1.5 by the export) at 8px. Written as whole
  // classes rather than assembled from fragments: Tailwind scans for literal strings, and a class
  // built by concatenation generates no CSS and fails silently.
  const geometry = size === "micro" ? "size-2 border" : "size-3.5 border-2";

  return (
    <span
      role="img"
      aria-label={cue.label}
      data-status={status}
      data-testid="status-cue"
      className={cn(
        "flex-none rounded-full",
        geometry,
        cue.borderClass,
        // `posted` is a solid disc, so its border and background are the same token and the check
        // sits inside. `draft` fills to the midline. `idea` is the bare ring — the outline *is* the
        // encoding, so there is deliberately no background at all.
        cue.fill === "solid" && cue.fillClass,
        cue.fill === "half" &&
          "bg-[linear-gradient(90deg,var(--color-status-draft)_50%,transparent_50%)]",
        cue.check && "text-surface-0 grid place-items-center font-bold",
        size === "micro" ? "text-[6px] leading-none" : "text-[9px] leading-none",
        className,
      )}
    >
      {/* Hidden from assistive tech because the label above already says "Posted"; the glyph is the
          visual half of the same fact, not a second one. */}
      {cue.check ? <span aria-hidden="true">✓</span> : null}
    </span>
  );
}
