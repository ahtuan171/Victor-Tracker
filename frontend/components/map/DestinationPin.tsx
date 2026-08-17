import { Check, ChevronRight, Star } from "lucide-react";

import type { Destination } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { isCurrentlyTraveling, pinTreatment } from "@/lib/map";
import { cn } from "@/lib/utils";

/**
 * One Destination, drawn as a map pin (T016, FR-002, research.md R-004).
 *
 * Built from `design/003-travel-map/BRIEF.md`'s audit findings (panel `1d`): a **shield
 * silhouette**, not Content Calendar's circle (`StatusCue.tsx`), carrying the same
 * outline → half-filled → solid progression `001`'s status pipeline established — echoed for
 * house consistency, but not copied onto a circle, so a pin never reads as a calendar chip.
 * `lib/map.ts` owns the encoding; this component owns **geometry only**, the same split
 * `StatusCue` already uses.
 *
 * ## Why an SVG shield rather than a div-and-gradient circle
 *
 * `StatusCue`'s half-fill is a CSS `linear-gradient` on a circle, which works because a circle's
 * silhouette is describable with `border-radius` alone. A shield's silhouette is not, so the
 * outline and the fill are both drawn as SVG paths sharing one `viewBox`: `outline` strokes the
 * shield with no fill, `solid` fills it, and `half` fills only the bottom half (clipped) —
 * "filled from the tip up", since the shield's point sits at the bottom, the same way a map pin's
 * point does.
 *
 * ## The "Currently Traveling" overlay
 *
 * A pulsing amber ring plus a caret chevron, layered on top of a **Planned** pin only
 * (`lib/map.ts`'s `isCurrentlyTraveling` — data-model.md draws this as an overlay on `planned`
 * alone, never a fourth shield state). Reuses `--ch-danger`/`--ch-danger-hi`
 * (`text-danger`/`text-danger-hi`) rather than a new colour — `design/003-travel-map/BRIEF.md`'s
 * audit findings are explicit that these tokens are reused, not duplicated.
 */
export function DestinationPin({
  destination,
  today,
  selected = false,
  onOpen,
  className,
}: {
  readonly destination: Destination;
  /** Null until the browser's clock is read (research.md R-006 addendum) — see `lib/map.ts`. */
  readonly today: DateOnly | null;
  /**
   * The one place `selectedId` currently names (004, FR-002, FR-003). Drawn as a size increase
   * plus a static ring — not colour alone, matching the rule the status shield's own fill
   * progression already follows, and distinct from the *pulsing* Currently-Traveling ring below so
   * the two never read as the same signal.
   */
  readonly selected?: boolean;
  /**
   * Optional and unwired in this phase (User Story 1 draws pins; User Story 2, T029, opens a
   * sheet on tap). A real `<button>` regardless, because a map pin is inherently a tappable
   * control (`design/003-travel-map/BRIEF.md`'s "tapping a pin" flow) and building it as one now
   * avoids retrofitting the element type once T029 wires this.
   */
  readonly onOpen?: () => void;
  readonly className?: string;
}) {
  const treatment = pinTreatment(destination.status);
  const traveling = isCurrentlyTraveling(destination, today);

  const label = traveling ? `${treatment.label}, currently traveling` : treatment.label;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${destination.name} — ${label}`}
      aria-pressed={selected}
      data-testid="destination-pin"
      data-status={destination.status}
      data-traveling={traveling}
      data-selected={selected ? "" : undefined}
      // 44px floor (`.claude/rules/design.md`) even though the shield itself draws smaller —
      // the tap target is the button's full box, the glyph is decoration inside it. `selected`'s
      // scale-up is a transform, so it never changes that box's layout size or pushes a neighbour.
      className={cn(
        "focus-ring relative flex size-11 items-center justify-center transition-transform",
        treatment.textClass,
        selected && "scale-125",
        className,
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          data-testid="destination-pin-selected-ring"
          className="ring-brand absolute inset-0 rounded-full ring-2 ring-offset-2 ring-offset-transparent"
        />
      ) : null}

      {traveling ? (
        // The overlay: a pulsing ring behind the shield, plus a small chevron badge at the
        // shield's shoulder — layered, not a fifth shield state (see docstring).
        <span
          aria-hidden="true"
          data-testid="currently-traveling-ring"
          className="border-danger absolute inset-1 animate-pulse rounded-full border-2"
        />
      ) : null}

      <svg viewBox="0 0 24 24" className="relative size-6" aria-hidden="true">
        {treatment.fill === "outline" ? (
          <path d={SHIELD_PATH} fill="none" stroke="currentColor" strokeWidth={2} />
        ) : treatment.fill === "solid" ? (
          <path d={SHIELD_PATH} fill="currentColor" />
        ) : (
          <>
            <path d={SHIELD_PATH} fill="none" stroke="currentColor" strokeWidth={2} />
            <clipPath id={halfClipId(destination.id)}>
              <rect x="0" y="12" width="24" height="12" />
            </clipPath>
            <path
              d={SHIELD_PATH}
              fill="currentColor"
              clipPath={`url(#${halfClipId(destination.id)})`}
            />
          </>
        )}
      </svg>

      <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
        <GlyphIcon glyph={treatment.glyph} className={cn("size-3", treatment.fill === "solid" ? "text-surface-0" : "")} />
      </span>

      {traveling ? (
        <ChevronRight
          aria-hidden="true"
          data-testid="currently-traveling-badge"
          className="text-danger absolute -top-0.5 -right-0.5 size-3 rounded-full bg-current p-0.5 text-surface-0"
        />
      ) : null}
    </button>
  );
}

/**
 * A rounded-shoulder shield, point at the bottom — the map-pin silhouette
 * `design/003-travel-map/BRIEF.md` asks for, in a 24x24 viewBox. Flat top with two "ears"
 * curving down to a single point, the same reading as a heraldic shield or a teardrop map pin.
 */
const SHIELD_PATH =
  "M12 2 L20 5 L20 11 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 11 L4 5 Z";

function GlyphIcon({ glyph, className }: { readonly glyph: "check" | "caret" | "star"; readonly className?: string }) {
  if (glyph === "check") return <Check strokeWidth={3} className={className} />;
  if (glyph === "caret") return <ChevronRight strokeWidth={3} className={className} />;
  return <Star strokeWidth={3} className={className} />;
}

/** One clip path per pin, so two half-filled pins on screen at once do not share (and fight
 * over) the same `<clipPath id>` — SVG ids are document-global, not scoped to the element. */
function halfClipId(destinationId: number): string {
  return `destination-pin-half-${destinationId}`;
}
