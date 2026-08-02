"use client";

import { useId, useState } from "react";

import { PlatformCue } from "@/components/item/PlatformCue";
import { StatusCue } from "@/components/item/StatusCue";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, PLATFORMS, STATUSES, type ContentItem, type Platform } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { changesBetween, hasChanges, isOverdue } from "@/lib/items";
import { PLATFORM_CUES, STATUS_CUES } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * The single editing surface (T052, FR-006a, FR-006, FR-007, FR-008, FR-010, FR-010a, FR-014,
 * FR-015, SC-012).
 *
 * Built from the export's `Item sheet 375` panel (`1g` dark / `2g` light): a bottom sheet over a
 * scrim, a grip and `EDIT ITEM`, then title, hook, a **Status column beside a Platform column**, a
 * date, and `SAVE CHANGES`.
 *
 * ## This is the only place an item changes, and that is the point
 *
 * The first draft of the plan had no platform-assignment control anywhere. FR-009 makes a platform a
 * precondition for leaving `idea`, so **every item would have been permanently stuck** and the E2E
 * flow unrunnable — the defect that produced FR-006a and SC-012, recorded in `tasks.md`'s post-review
 * table. Every field except the published link is set here; the drag at T054 is a second entry point
 * to *one* of them, calling the same `updateItem`.
 *
 * ## One save, one request, and that is what makes SC-012 reachable
 *
 * The sheet holds a draft and sends the **diff** when the creator saves, rather than writing on every
 * tap. Two reasons, and the second is a correctness one:
 *
 * 1. `changesBetween` sends only what changed, so an edit here cannot silently rewrite a field the
 *    creator never touched with whatever this screen last read.
 * 2. **A title-only idea can be given a platform *and* advanced in the same request.** Per-tap saves
 *    would make the first tap a guaranteed 409 — and `check_invariant_1` in the backend validates the
 *    item as it would be *after* the change precisely so this one request exists. SC-012 asks that
 *    the creator never meet a refusal they cannot resolve from the surface they are on; the cheapest
 *    way to honour it is to not produce the refusal.
 *
 * The optimistic update still makes the cue change immediately (US3 scenario 3) — that happens in
 * `updateItem`, one layer down, the moment save is tapped.
 *
 * ## What this deliberately does not carry yet
 *
 * - **The published link** is **T064** (US5), prompted on the move to `posted` and never required.
 *   The export draws it beside the date; the date takes the full width until then.
 * - **`DELETE ITEM`** is **T056**. The export draws the button here and it opens a confirmation —
 *   rendering the button now, with nothing behind it, would be either dead UI or a single tap that
 *   deletes, and FR-020 forbids the second. A seam, not half a build.
 * - **409 treatment** is refined at **T053**. A refusal already renders as the backend's sentence and
 *   the platform control is already adjacent to the status control, which is the layout half of
 *   FR-009a; T053 owns making the code itself legible.
 */
export function ItemSheet({
  item,
  today,
  onOpenChange,
  onSave,
}: {
  /** The item being edited, or null when the sheet is closed. Never a pending row — see `openable`. */
  readonly item: ContentItem | null;
  readonly today: DateOnly | null;
  readonly onOpenChange: (open: boolean) => void;
  /** `updateItem` from `useContentItems`. Rejects with an `ApiError` this sheet renders. */
  readonly onSave: (item: ContentItem, changes: ReturnType<typeof changesBetween>) => Promise<ContentItem>;
}) {
  const titleId = useId();
  const hookId = useId();
  const dateId = useId();
  const statusId = useId();
  const platformId = useId();
  const errorId = useId();

  /**
   * The draft is a whole `ContentItem`, not a parallel form shape.
   *
   * It is what the sheet renders, what `changesBetween` diffs against the original, and what
   * `itemWithChanges` would produce from that diff — so the three cannot drift. A separate
   * `{title: string, hook: string, ...}` would need `"" ↔ null` conversions at every boundary, and
   * the null is the whole of FR-023's "clear this field".
   */
  const [draft, setDraft] = useState<ContentItem | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Reset the draft when the sheet opens on an item — React's documented "adjusting state when a prop
   * changes" pattern, in preference to an effect.
   *
   * Two halves, and dropping either one is a real defect:
   *
   * - **Keyed on the id, not the object.** An optimistic save replaces the item in the store, so its
   *   object identity changes mid-edit; keying on identity would discard the creator's typing at the
   *   moment their own save landed.
   * - **Cleared to null on close.** Without this, closing and reopening the *same* item keeps the
   *   abandoned draft, so an edit the creator explicitly walked away from reappears as though it had
   *   been saved. Caught by `item-sheet.spec.ts`; it is the reason the id is tracked here as well as
   *   in `CalendarShell`.
   */
  if (item === null) {
    if (editingId !== null) setEditingId(null);
  } else if (item.id !== editingId) {
    setEditingId(item.id);
    setDraft(item);
    setError(null);
  }

  const open = item !== null;
  const current = draft ?? item;

  const changes = item !== null && current !== null ? changesBetween(item, current) : {};
  const dirty = hasChanges(changes);

  function edit(patch: Partial<ContentItem>): void {
    setDraft((previous) => (previous === null ? null : { ...previous, ...patch }));
  }

  async function save(): Promise<void> {
    if (item === null || current === null || saving) return;

    // Nothing changed: close without a request. The backend refuses an empty body with a 422
    // (`minProperties: 1`) on purpose, so a no-op save must not become one.
    if (!dirty) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(item, changes);
      onOpenChange(false);
    } catch (caught) {
      // The sheet stays open with the draft intact — same rule as the capture sheet. A refused save
      // that also discarded the edit would be the worst outcome, and it is exactly what closing
      // optimistically produces. T053 makes the 409 codes legible here.
      setError(
        caught instanceof ApiError
          ? caught.detail
          : "Could not save those changes. They are still here — try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const overdue = current !== null && isOverdue(current, today);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // The export draws `CLOSE` in the header row rather than a corner icon, and a second
        // dismissal affordance would be another 44px target competing for the same thumb.
        showCloseButton={false}
        // `max-h-[88dvh]` plus a scrolling body is what keeps the promise in `.claude/rules/design.md`
        // that the page never scrolls sideways *or* pushes its primary action off screen: at a 667px
        // viewport this sheet's content is taller than the space it has, so the fields scroll inside
        // their own container and `SAVE CHANGES` stays anchored under the thumb.
        className="notch-sheet bg-surface-1 border-hairline max-h-[88dvh] gap-0 p-0 shadow-e2"
        aria-describedby={errorId}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          {/* Decorative, straight from the export — this sheet is not draggable. */}
          <span className="bg-ink-lo/50 h-[3px] w-[34px] rounded-sm" aria-hidden="true" />
          <SheetTitle className="font-display text-ink text-[13px] leading-none font-semibold tracking-[0.18em] uppercase">
            Edit item
          </SheetTitle>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="font-display text-ink-mid -mr-2 h-11 px-2 text-[11px] font-semibold tracking-[0.16em] uppercase"
            data-testid="item-sheet-close"
          >
            Close
          </button>
        </div>

        {/*
         * `min-h-0` on a scrolling flex child, for the same reason `CalendarShell`'s `<main>` has it:
         * without it the child refuses to shrink below its content and pushes the button row out of
         * the sheet instead of scrolling.
         */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-1">
          <Field label="Title" htmlFor={titleId}>
            <input
              id={titleId}
              value={current?.title ?? ""}
              onChange={(event) => edit({ title: event.target.value })}
              // Mirrors the contract's 200 rather than letting the creator type a 201st character
              // and be refused afterwards.
              maxLength={200}
              // `text-base` is 16px and is a platform constraint, not a style choice: iOS zooms the
              // page in when focusing any input below 16px, which throws away a 375px layout.
              className="border-hairline bg-surface-3 text-ink placeholder:text-ink-lo focus-visible:ring-brand-hi h-12 w-full rounded-sm border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
              data-testid="item-title-input"
            />
          </Field>

          <Field label="Hook" htmlFor={hookId}>
            <textarea
              id={hookId}
              value={current?.hook ?? ""}
              // Empty becomes `null`, which is what makes "I deleted the hook" an explicit clear on
              // the wire rather than an omission the server would ignore (FR-023).
              onChange={(event) => edit({ hook: event.target.value === "" ? null : event.target.value })}
              maxLength={500}
              rows={2}
              placeholder="Open on the ledge shot, cut on the siren."
              className="border-hairline bg-surface-3 text-ink placeholder:text-ink-lo focus-visible:ring-brand-hi min-h-[66px] w-full resize-none rounded-sm border p-3 text-base leading-relaxed focus-visible:ring-2 focus-visible:outline-none"
              data-testid="item-hook-input"
            />
          </Field>

          {/*
           * Status and platform side by side, and that adjacency is a requirement rather than a
           * layout preference: FR-009a refuses a status change that leaves an advanced item without a
           * platform, and SC-012 says the creator must be able to resolve that refusal *from the
           * surface they are already on*. The fix is always one column to the right.
           */}
          <div className="flex gap-3">
            <div className="flex-1">
              <GroupLabel id={statusId}>Status</GroupLabel>
              {/*
               * A radio group: exactly one of three, always set (FR-007 — `status` is `NOT NULL` with
               * a default, so there is no "no status"). Both directions are offered at once, which is
               * all FR-008 needs — moving back to `idea` is the same one tap as moving forward.
               */}
              <div role="radiogroup" aria-labelledby={statusId} className="flex flex-col gap-1.5">
                {STATUSES.map((status) => (
                  <ChoiceButton
                    key={status}
                    role="radio"
                    selected={current?.status === status}
                    onClick={() => edit({ status })}
                    testId={`status-option-${status}`}
                  >
                    <StatusCue status={status} size="full" />
                    {STATUS_CUES[status].label}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <GroupLabel id={platformId}>Platform</GroupLabel>
              {/*
               * Toggle buttons rather than radios, and the difference is FR-010a plus FR-009a: at most
               * **one** platform, and `null` is a legal value the creator must be able to return to —
               * a radio group has no "none" once one is picked. Tapping the selected platform clears
               * it, which is the only way to reach the `platform_locked` refusal T053 renders.
               */}
              <div role="group" aria-labelledby={platformId} className="flex flex-col gap-1.5">
                {PLATFORMS.map((platform) => (
                  <ChoiceButton
                    key={platform}
                    role="button"
                    selected={current?.platform === platform}
                    onClick={() => togglePlatform(current, platform, edit)}
                    testId={`platform-option-${platform}`}
                  >
                    <PlatformCue platform={platform} size="full" />
                    {PLATFORM_CUES[platform].label}
                  </ChoiceButton>
                ))}
              </div>
            </div>
          </div>

          {/*
           * The export puts the published link beside the date; that field is T064, so the date takes
           * the row until then.
           *
           * A native `<input type="date">` rather than a hand-built picker: it speaks `YYYY-MM-DD`
           * exactly — the format the column, the contract and `lib/dates.ts` all use — so no `Date` is
           * ever constructed and research.md R-006's UTC-midnight trap cannot occur here. It is also
           * keyboard-reachable and gives a phone its own picker, which is what FR-015b asks for.
           */}
          <Field label="Date" htmlFor={dateId}>
            <div className="flex gap-2">
              <input
                id={dateId}
                type="date"
                value={current?.scheduled_date ?? ""}
                // Empty is how a native date input reports "cleared", and `null` is how the contract
                // spells "send this back to the backlog" — the tap counterpart of T054's drag onto
                // the drawer (FR-014a: both produce an identical result).
                onChange={(event) =>
                  edit({ scheduled_date: event.target.value === "" ? null : event.target.value })
                }
                className={cn(
                  "border-hairline bg-surface-3 text-ink focus-visible:ring-brand-hi h-12 flex-1 rounded-sm border px-3 text-base focus-visible:ring-2 focus-visible:outline-none",
                  // The export's overdue treatment on this field: dashed on the **left only**, the
                  // same encoding `ItemChip` carries, so the two surfaces agree about what a dashed
                  // left edge means. `border-l-dashed` is not a Tailwind utility.
                  overdue && "border-l-overdue border-l-4 pl-2.5 [border-left-style:dashed]",
                )}
                data-testid="item-date-input"
              />
              {/*
               * An explicit clear, because a native date input's own clear affordance is
               * platform-dependent and absent on several mobile browsers. Without it the tap path
               * FR-015b requires can schedule an item but never unschedule one, leaving the drag at
               * T054 as the only way back to the backlog — which is precisely the pointer-only
               * dependency SC-011 forbids.
               */}
              <button
                type="button"
                onClick={() => edit({ scheduled_date: null })}
                disabled={current?.scheduled_date === null}
                className="border-hairline text-ink-mid font-display h-12 flex-none rounded-sm border px-3 text-[11px] font-semibold tracking-[0.14em] uppercase disabled:opacity-40"
                data-testid="item-date-clear"
              >
                Clear
              </button>
            </div>

            {overdue ? (
              <p className="text-overdue mt-1.5 text-[11px] leading-relaxed" data-testid="item-overdue-note">
                Date has passed — overdue
              </p>
            ) : null}
          </Field>
        </div>

        <SheetDescription
          id={errorId}
          role={error !== null ? "alert" : undefined}
          className={cn(
            "px-4 pt-2 text-xs leading-relaxed",
            error !== null ? "text-brand-hi" : "text-ink-mid",
          )}
          data-testid="item-sheet-message"
        >
          {error ?? "Changes save together. Nothing is written until you tap save."}
        </SheetDescription>

        <div className="border-hairline mt-2 flex gap-2.5 border-t px-4 pt-3.5 pb-4.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="bg-brand notch-card font-display h-12 flex-1 text-sm font-semibold tracking-[0.16em] text-white uppercase shadow-e1 disabled:opacity-50"
            data-testid="item-save"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * At most one platform (FR-010a), and `null` is reachable.
 *
 * Tapping the platform already selected clears it. Extracted so the rule has one statement rather
 * than a ternary buried in a handler — it is the only place in the product where a selection is
 * deselectable, and `platform_locked` is only reachable through it.
 */
function togglePlatform(
  current: ContentItem | null,
  platform: Platform,
  edit: (patch: Partial<ContentItem>) => void,
): void {
  edit({ platform: current?.platform === platform ? null : platform });
}

/** A labelled field, at the export's label treatment. */
function Field({
  label,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="font-display text-ink-mid mb-1.5 block text-[10px] leading-none font-semibold tracking-[0.2em] uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** The same label treatment for a group of buttons, which has no single control to point `htmlFor` at. */
function GroupLabel({ id, children }: { readonly id: string; readonly children: React.ReactNode }) {
  return (
    <span
      id={id}
      className="font-display text-ink-mid mb-1.5 block text-[10px] leading-none font-semibold tracking-[0.2em] uppercase"
    >
      {children}
    </span>
  );
}

/**
 * One option in the status or platform column.
 *
 * **`h-11` (44px), not the export's 40px.** This is the one place the design is knowingly not
 * followed to the pixel, for the same reason the login fields are not: `.claude/rules/design.md`
 * makes 375px and thumb reach hard constraints, and 40px is under the tap-target floor. Six of these
 * sit in the densest part of the sheet, which is exactly where a missed tap is most likely.
 *
 * `aria-checked` for the status radios and `aria-pressed` for the platform toggles, because they are
 * genuinely different controls: one of three is always selected, none of three may be.
 */
function ChoiceButton({
  role,
  selected,
  onClick,
  testId,
  children,
}: {
  readonly role: "radio" | "button";
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly testId: string;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      {...(role === "radio" ? { "aria-checked": selected } : { "aria-pressed": selected })}
      onClick={onClick}
      data-testid={testId}
      data-selected={selected ? "" : undefined}
      className={cn(
        "flex h-11 items-center gap-2 rounded-sm border px-2.5 text-left text-[13px] leading-none",
        selected
          ? "border-brand bg-surface-2 text-ink font-semibold"
          : "border-hairline bg-surface-3 text-ink-mid font-medium",
      )}
    >
      {children}
    </button>
  );
}
