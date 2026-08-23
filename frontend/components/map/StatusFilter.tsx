"use client";

import { DESTINATION_STATUSES, type DestinationStatus } from "@/lib/api";
import { pinTreatment } from "@/lib/map";
import { cn } from "@/lib/utils";

/**
 * The status filter row (T052, FR-010, FR-022, User Story 5).
 *
 * `design/003-travel-map/BRIEF.md`'s `StatusFilter` row names the mandate: "same shape as `001`'s
 * platform filter, reused rather than reinvented". So this is `components/item/PlatformFilter.tsx`
 * applied to `DestinationStatus`, and every non-obvious decision below is that component's,
 * already argued there — read its docstring for the full reasoning rather than re-deriving it.
 *
 * ## It narrows loaded state; it never issues a request
 *
 * The whole of this component's data behaviour is `selectByStatus` in `lib/map.ts`, called by
 * `MapShell` — this file renders four buttons and reports which one was tapped. **Do not add a
 * fetch here, and do not send a status to `GET /destinations`.** The map's read is deliberately
 * unparameterised (FR-001, FR-019: every Destination, whatever its Trip membership), and a round
 * trip behind every toggle is what R-007 rejects — on this stack the first request of the day is
 * tens of seconds (T072's measurement, `.claude/memory.md`).
 *
 * ## A radio group, where `DestinationSheet`'s status control is also one — but for a different
 * reason
 *
 * Both are `role="radiogroup"`, and the coincidence is worth naming so nobody "unifies" them. On
 * the sheet, a Destination's status is `NOT NULL` with a default (data-model.md), so exactly one
 * of three is always chosen and there is no "none". Here `null` means **all**, which is not the
 * absence of a choice but one of four mutually exclusive ones, exactly one of which is always in
 * effect — so `ALL` is a real option with its own `aria-checked` rather than a state the owner
 * infers from three unselected buttons. Same ARIA, different argument; the sheet's control writes
 * a column and this one writes nothing.
 *
 * ## Where it sits
 *
 * Below the map, in the bottom portion of the screen, for the reason `PlatformFilter`'s docstring
 * spells out at length: `.claude/rules/design.md` makes thumb reach a hard constraint at the 375px
 * floor, and a filter is exactly the control that gets used repeatedly while holding the phone one
 * -handed. `MapShell` places it; `tests/e2e/map.spec.ts` asserts it stays in the bottom half.
 */
export function StatusFilter({
  status,
  onChange,
}: {
  /** The status in effect, or `null` for every status. */
  readonly status: DestinationStatus | null;
  readonly onChange: (status: DestinationStatus | null) => void;
}) {
  return (
    <div
      className="border-hairline bg-surface-0 flex items-center gap-1.5 border-t px-4 py-2"
      data-testid="status-filter"
    >
      <span
        className="text-ink-lo flex-none text-xs leading-none font-semibold tracking-[0.2em] uppercase"
        aria-hidden="true"
      >
        Status
      </span>

      {/* The visible label is `aria-hidden` and the group carries its own name instead: "Status"
          alone names the noun, not the action, and this control filters rather than assigns —
          the word that tells it apart from `DestinationSheet`'s identical-looking group. */}
      <div role="radiogroup" aria-label="Filter by status" className="flex flex-1 gap-1.5">
        <FilterOption
          selected={status === null}
          onSelect={() => onChange(null)}
          label="All statuses"
          testId="status-filter-all"
        >
          All
        </FilterOption>

        {/* Iterated from the contract's own `DESTINATION_STATUSES`, with each label coming from
            `pinTreatment` — so the word this row shows for a status is the same word the pin
            legend and the sheet show, defined once in `lib/map.ts`. A status added to the
            contract appears here without this file being touched. */}
        {DESTINATION_STATUSES.map((value) => (
          <FilterOption
            key={value}
            selected={status === value}
            onSelect={() => onChange(value)}
            label={pinTreatment(value).label}
            testId={`status-filter-${value}`}
          >
            {pinTreatment(value).label}
          </FilterOption>
        ))}
      </div>
    </div>
  );
}

/**
 * One of the four options.
 *
 * **`h-11` (44px)**, the same floor and the same reason as `PlatformFilter`'s: this row exists
 * precisely so the filter is thumb-operable, and a control under 44px is not. `flex-1` shares the
 * row's remaining width between the four rather than fixing a per-button width there is no reason
 * to maintain.
 *
 * The selected treatment is `PlatformFilter`'s exactly — brand fill, dark text, the offset
 * `--ch-brand-deep` shadow and one squared corner — because two filter rows in one product that
 * signalled "active" differently would be two visual languages (`.claude/rules/design.md`).
 */
function FilterOption({
  selected,
  onSelect,
  label,
  testId,
  children,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly label: string;
  readonly testId: string;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      data-testid={testId}
      data-selected={selected ? "" : undefined}
      className={cn(
        "focus-ring flex h-11 flex-1 items-center justify-center rounded-sm border text-xs leading-none font-semibold tracking-[0.1em] uppercase",
        selected
          ? "border-brand bg-brand text-void shadow-[2px_2px_0_0_var(--ch-brand-deep)] rounded-tr-none"
          : "border-hairline bg-surface-2 text-ink-mid",
      )}
    >
      {children}
    </button>
  );
}
