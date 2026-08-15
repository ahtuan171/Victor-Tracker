"use client";

import type { Destination } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { isCurrentlyTraveling, pinTreatment } from "@/lib/map";
import { cn } from "@/lib/utils";

/**
 * The interactive strip under the map — every marked place as a tappable card.
 *
 * ## Why it exists
 *
 * The owner asked for the reference product's shape (2026-08-15): the map is **not** full-bleed,
 * it sits in its own inset panel, and there is a band underneath carrying something to interact
 * with. That band is what makes the surface feel like an instrument rather than a wallpaper —
 * and here it earns its place with real behaviour rather than decoration.
 *
 * ## It is a second route to a surface that already exists, not a new capability
 *
 * Tapping a card opens the identical `DestinationSheet` a pin tap opens, through the identical
 * `onOpenDestination` callback — so this adds no endpoint, no field, and no state. That matters
 * beyond tidiness: a pin at world zoom is a ~24px shield among others, and several of this
 * product's own seeded places sit close enough together to be awkward targets. A list row is a
 * full-width 44px target for the same action, which is the accessibility half of the same
 * argument (`.claude/rules/design.md`'s 44px floor).
 *
 * **It deliberately does not filter.** A status filter is `T050`'s job in Phase 7 and building one
 * here would be exactly the "nothing outside the current spec gets built" the non-negotiables
 * forbid. This strip lists what the map already loaded, in the order the map already has it.
 *
 * ## Horizontal scroll, inside its own container
 *
 * `.claude/rules/design.md` forbids the **page body** scrolling sideways at 375px; wide content
 * scrolling inside its own container is the prescribed answer, and this is that. `snap-x` makes
 * the cards land cleanly under a thumb rather than half-cut.
 */
export function DestinationStrip({
  destinations,
  today,
  onOpenDestination,
}: {
  readonly destinations: readonly Destination[];
  /** Null until the browser's clock is read — same contract as `MapView`/`DestinationPin`. */
  readonly today: DateOnly | null;
  readonly onOpenDestination: (destination: Destination) => void;
}) {
  return (
    <section
      aria-label="Marked places"
      className="border-hairline web-grain flex shrink-0 flex-col gap-2 border-t px-3 pt-2.5 pb-3"
      data-testid="destination-strip"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-ink-mid text-[11px] leading-none font-semibold tracking-[0.18em] uppercase">
          Marked places
        </h2>
        <span className="text-ink-lo text-[11px] leading-none" data-testid="destination-strip-count">
          {destinations.length}
        </span>
      </div>

      {destinations.length === 0 ? (
        <p className="text-ink-lo py-2 text-xs" data-testid="destination-strip-empty">
          Nothing marked yet.
        </p>
      ) : (
        <ul
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
          data-testid="destination-strip-list"
        >
          {destinations.map((destination) => {
            const treatment = pinTreatment(destination.status);
            const traveling = isCurrentlyTraveling(destination, today);

            return (
              <li key={destination.id} className="snap-start">
                <button
                  type="button"
                  onClick={() => onOpenDestination(destination)}
                  data-testid={`destination-card-${destination.id}`}
                  data-status={destination.status}
                  className={cn(
                    "border-hairline bg-surface-2 focus-ring flex h-14 w-[150px] flex-col justify-center gap-1 rounded-sm border px-2.5 text-left",
                    traveling && "border-danger",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {/* The same shape/fill encoding the pin uses, so a card and its pin are
                        obviously the same thing (FR-002 — never colour alone). */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-block size-2.5 shrink-0 rotate-45 border",
                        treatment.borderClass,
                        treatment.fill === "solid" && treatment.fillClass,
                        treatment.fill === "half" && "bg-linear-to-b from-transparent to-current",
                        treatment.textClass,
                      )}
                    />
                    <span className="text-ink truncate text-[13px] leading-none font-semibold">
                      {destination.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "truncate text-[10px] leading-none tracking-[0.08em] uppercase",
                      traveling ? "text-danger-hi" : "text-ink-lo",
                    )}
                  >
                    {traveling ? "Traveling now" : treatment.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
