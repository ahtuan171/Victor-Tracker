"use client";

import type { Platform } from "@/lib/api";
import { PLATFORM_CUES } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * The platform filter row (T061, FR-016, FR-022, SC-005, research.md R-007).
 *
 * Built from the export's `Filtered empty 375` panel (`1i` dark / `2i` light), which is the only
 * surface that draws this row: `PLATFORM` in small caps, then `ALL`, then one monogram button per
 * platform, with the active one carrying the brand fill.
 *
 * ## It narrows loaded state; it never issues a request
 *
 * The whole of this component's data behaviour is `selectByPlatform` in `lib/items.ts`, called by
 * `CalendarShell` — this file renders four buttons and reports which one was tapped. **Do not add a
 * fetch here, and do not send `platform` to `GET /content-items`.** Every parameter on that endpoint
 * bounds what the server returns, the backlog drawer reads the same state the grid does, and a round
 * trip behind every toggle is what SC-005's one-second budget and R-007 both reject. `T060` added
 * the endpoint's `platform` parameter for a caller that wants only one platform; this surface is not
 * one, and `tests/e2e/platform-filter.spec.ts` asserts the request count does not move when the
 * filter does.
 *
 * ## Where this row sits, and why it is not where the export draws it
 *
 * The export puts it directly under the period header — the top of the screen. **It is placed above
 * the backlog drawer instead**, in the bottom third, and that is a knowing departure from the design
 * rather than a mistake. `tasks.md` T061 requires the filter "within thumb reach (FR-022)", and at
 * the 375×667 floor the export's position lands around y=100 while the bottom half starts at y=333.
 * `.claude/rules/design.md` calls mobile-first "a hard constraint, not a preference" and names the
 * export "the starting point, not a drop-in", so the spec wins. This is the third place the design is
 * knowingly not followed to the pixel — the others are the sheet's 44px options and `text-base` on
 * inputs — and like both of those it is a tap-reachability constraint rather than taste.
 *
 * `tests/e2e/platform-filter.spec.ts` asserts the row's position, so a restyle cannot quietly move it
 * back up.
 *
 * ## A radio group, where the item sheet's platform control is a toggle group
 *
 * The same three platforms, the opposite ARIA, and the data is what decides it. On the item sheet an
 * item may target **at most one** platform (FR-010a), so `null` means "none" and must stay reachable
 * — a toggle group, `aria-pressed`, none-may-be-pressed. Here `null` means **all**, which is not the
 * absence of a choice but one of four mutually exclusive ones, exactly one of which is always in
 * effect. That is a radio group, so `ALL` is a real option with a real `aria-checked` rather than the
 * state of having deselected everything.
 *
 * The practical difference: a screen reader announces "All, selected, 1 of 4" rather than leaving the
 * creator to infer an unfiltered calendar from three unpressed buttons.
 */
export function PlatformFilter({
  platform,
  onChange,
}: {
  /** The platform in effect, or `null` for all of them. */
  readonly platform: Platform | null;
  readonly onChange: (platform: Platform | null) => void;
}) {
  return (
    <div
      // `border-t` rather than `border-b`: this row's neighbour below is the drawer, which draws its
      // own top border and its notch. Two hairlines meeting there reads as a seam.
      className="border-hairline bg-surface-0 flex items-center gap-1.5 border-t px-4 py-2"
      data-testid="platform-filter"
    >
      <span
        className="font-display text-ink-lo flex-none text-[10px] leading-none font-semibold tracking-[0.2em] uppercase"
        id="platform-filter-label"
        aria-hidden="true"
      >
        Platform
      </span>

      {/*
       * The label is `aria-hidden` and the group carries its own `aria-label` instead. "Platform" on
       * its own describes the noun, not the action, and a screen-reader user arriving here needs to
       * know this filters rather than assigns — the word that distinguishes it from the identical
       * control on the item sheet.
       */}
      <div role="radiogroup" aria-label="Filter by platform" className="flex flex-1 gap-1.5">
        <FilterOption
          selected={platform === null}
          onSelect={() => onChange(null)}
          label="All platforms"
          testId="platform-filter-all"
        >
          All
        </FilterOption>

        {/*
         * Iterated from `PLATFORM_CUES` rather than written out three times, so a monogram or a
         * label is defined in exactly one place. `lib/status.ts` is keyed by the contract's
         * `Platform`, which `tests/contract/api-types.spec.ts` checks against `openapi.yaml` — so a
         * platform added to the contract appears here without this file being touched.
         */}
        {Object.values(PLATFORM_CUES).map((cue) => (
          <FilterOption
            key={cue.platform}
            selected={platform === cue.platform}
            onSelect={() => onChange(cue.platform)}
            label={cue.label}
            testId={`platform-filter-${cue.platform}`}
          >
            {/*
             * The monogram is decorative here because the button already carries `cue.label` as its
             * accessible name — "T" announced as "T" tells a screen-reader user nothing, which is the
             * reason `PlatformCue` carries both.
             */}
            <span aria-hidden="true">{cue.monogram}</span>
          </FilterOption>
        ))}
      </div>
    </div>
  );
}

/**
 * One of the four options.
 *
 * **`h-11` (44px), not the export's 26px** — the same floor and the same reason as the item sheet's
 * options. Four targets sharing one 375px row with a label is already tight; 26px would put them well
 * under what a thumb can hit, and this row exists precisely so the filter is thumb-operable.
 *
 * `flex-1` rather than the export's fixed 30px width for the monograms: at 44px tall, three 30px-wide
 * buttons look like a mistake, and letting the four share the row's remaining width keeps every one
 * of them comfortably over the floor at 375px with no measurement to maintain.
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
        "font-display flex h-11 flex-1 items-center justify-center rounded-sm border text-[11px] leading-none font-semibold tracking-[0.14em] uppercase",
        selected
          ? "border-brand bg-brand text-white"
          : "border-hairline bg-surface-2 text-ink-mid",
      )}
    >
      {children}
    </button>
  );
}
