import { formatDateOnlyShort } from "@/lib/period";
import type { DateOnly } from "@/lib/dates";

/**
 * The moving-text strip (T027, spec Clarifications 2026-08-06, FR-027–FR-031).
 *
 * The owner chose this over a purely decorative strip and over dropping it entirely — both recorded
 * in `spec.md`'s Clarifications. Because it carries real information, it inherits five obligations a
 * decoration would not: it reports **exactly** two facts and nothing else (FR-027); it must **agree**
 * with every other surface reporting the same fact, never an independent second reading that can
 * disagree (FR-028); it reflects the same loaded state as the rest of the screen (FR-029); it never
 * goes blank, even with nothing to report (FR-030); and everything it says is readable from a single
 * **still** frame at 375px — motion carries no information at all (FR-031).
 *
 * ## One value, two presentations (FR-028)
 *
 * `overdueCount` and `due` are computed **once**, in `CalendarShell`, and handed to both this
 * component and the header count as the same values — not recomputed independently in each, which
 * would happen to agree today but is not the same guarantee. Both narrow with the platform filter
 * identically because both are derived from the same `visible` list.
 *
 * ## Never blank (FR-030)
 *
 * Nothing overdue and nothing due is still a real state — "all clear" — and it is said outright
 * rather than rendering nothing or freezing on the last real message. A strip that goes blank reads
 * as broken; a strip that goes stale reads as wrong.
 *
 * ## The motion carries nothing (FR-025, FR-031)
 *
 * The text itself is never scrolled, clipped, or truncated — it is short by construction (at most
 * "N OVERDUE · NEXT D MMM") and rendered in full, always. `.ticker-scan` (`app/globals.css`) is a
 * purely decorative highlight behind it, neutralised automatically by the existing
 * `prefers-reduced-motion` rule — there is nothing to lose when it stops moving, which is what makes
 * FR-025 and FR-031 satisfiable together rather than in tension.
 */
export function Ticker({
  overdueCount,
  due,
}: {
  /** Computed by the caller from the same `visible` list the header count reads (FR-028). */
  readonly overdueCount: number;
  /** `nextDue(visible, today)` from `lib/items.ts`, computed by the same caller. */
  readonly due: DateOnly | null;
}) {
  const parts: string[] = [];
  if (overdueCount > 0) {
    parts.push(`${overdueCount} ${overdueCount === 1 ? "ITEM" : "ITEMS"} OVERDUE`);
  }
  if (due !== null) {
    parts.push(`NEXT ${formatDateOnlyShort(due).toUpperCase()}`);
  }
  const message = parts.length > 0 ? parts.join(" · ") : "ALL CLEAR — NOTHING DUE";

  return (
    <div
      className="border-hairline bg-void relative overflow-hidden border-t px-4 py-2"
      data-testid="ticker"
    >
      <div className="ticker-scan pointer-events-none absolute inset-0" aria-hidden="true" />
      {/*
       * `aria-live="polite"` rather than `role="status"`: this is ambient, persistent information
       * that changes as the loaded state changes (FR-029), not a one-time announcement — a screen
       * reader should pick up a change without it competing for attention the way `role="alert"`
       * would.
       */}
      <p
        aria-live="polite"
        className="text-brand relative text-xs leading-none font-semibold tracking-[0.18em] uppercase"
        data-testid="ticker-message"
      >
        {message}
      </p>
    </div>
  );
}
