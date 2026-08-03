"use client";

import { useId, useRef, useState } from "react";

import { PlatformCue } from "@/components/item/PlatformCue";
import { PublishedLink } from "@/components/item/PublishedLink";
import { StatusCue } from "@/components/item/StatusCue";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  ApiError,
  PLATFORMS,
  STATUSES,
  type ContentItem,
  type InvariantCode,
  type Platform,
} from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import {
  changesBetween,
  hasChanges,
  isOverdue,
  isValidPublishedUrl,
  PUBLISHED_URL_MAX_LENGTH,
} from "@/lib/items";
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
 * ## The published link (T064, FR-019, FR-019a)
 *
 * Always rendered, **prompted** only when the draft's status is `posted` and no link is set yet.
 * "Prompted on the move to `posted`" is not "revealed on the move to `posted`", and the difference is
 * FR-019a: a link is retained when the item leaves `posted` (FR-008a) and is **removable only by the
 * creator editing it directly**. A field that disappeared below `posted` would leave a retained link
 * with no control that can clear it — the requirement made unsatisfiable by hiding its own input.
 *
 * Never required: the prompt is a hint, nothing blocks a save, and `posted` with no link is a valid
 * item on both write paths (asserted in `backend/tests/test_content_items.py` at T063).
 *
 * **The link is validated here as of T066** — in `save()`, against the contract's own `^https?://`
 * and 2048 characters, before the request is built, so the 422 that would discard an accompanying
 * status change is never produced. The reasoning is at that call site and in `tasks.md` under Phase 7.
 * (This paragraph said "validating the link is T066, **not here**" while T064 was the newest task;
 * it is the same sentence, now describing the opposite file.)
 *
 * ## What this deliberately does not carry yet
 *
 * - **`DELETE ITEM`** arrived at **T056**. It opens `DeleteConfirm` and never deletes on its own:
 *   FR-020 forbids a destructive action one tap away, so this button's whole job is to be the *first*
 *   of two. It is below the save row and in the muted weight, which is where the export puts it.
 *
 * ## A 409 is an instruction, not just an error (T053, FR-009, FR-009a, SC-012)
 *
 * One invariant, two codes, and the codes exist because the creator's **next step** differs:
 * `platform_required` is fixed in the platform column, `platform_locked` in the status column ("move
 * it back to ideas first"). SC-012 asks that neither refusal require leaving the surface, so the sheet
 * **marks the control that resolves it and moves focus there** rather than printing a sentence and
 * trusting the creator to read it carefully. On a sheet whose body scrolls, adjacency alone is not
 * reachability — the columns can be off screen when the creator is on the date field.
 *
 * Matching on `code` rather than on prose is what makes this survive a reworded backend message; the
 * message itself is still the contract's `detail`, verbatim, so the two cannot drift.
 */
export function ItemSheet({
  item,
  today,
  onOpenChange,
  onRequestDelete,
  onSave,
}: {
  /** The item being edited, or null when the sheet is closed. Never a pending row — see `openable`. */
  readonly item: ContentItem | null;
  readonly today: DateOnly | null;
  readonly onOpenChange: (open: boolean) => void;
  /** Open the delete confirmation for this item (T056). The sheet never deletes anything itself. */
  readonly onRequestDelete: (item: ContentItem) => void;
  /** `updateItem` from `useContentItems`. Rejects with an `ApiError` this sheet renders. */
  readonly onSave: (
    item: ContentItem,
    changes: ReturnType<typeof changesBetween>,
  ) => Promise<ContentItem>;
}) {
  const titleId = useId();
  const hookId = useId();
  const dateId = useId();
  const linkId = useId();
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
  /** Which invariant refused the last save, if it was one. Null for every other kind of failure. */
  const [errorCode, setErrorCode] = useState<InvariantCode | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Whether the *last save attempt* was refused by the client-side link check (T066).
   *
   * State rather than a value derived from the draft, and that is the whole difference between this
   * and a validating input: deriving it would mark the field on the first keystroke of a URL the
   * creator is still halfway through typing. The check belongs at the save, which is the only moment
   * the value is claimed to be finished.
   */
  const [linkRefused, setLinkRefused] = useState(false);

  const statusGroup = useRef<HTMLDivElement>(null);
  const platformGroup = useRef<HTMLDivElement>(null);
  const linkField = useRef<HTMLDivElement>(null);

  /**
   * Reset the draft when the sheet opens on an item — React's documented "adjusting state when a prop
   * changes" pattern, in preference to an effect.
   *
   * Two halves, and dropping either one is a real defect:
   *
   * - **Keyed on the id, not the object.** An optimistic save replaces the item in the store, so its
   *   object identity changes mid-edit; keying on identity would discard the creator's typing at the
   *   moment their own save landed.
   * - **`editingId` is cleared on close** — not `draft`, which is left as it was. That is enough,
   *   and the indirection is worth being precise about: the *next* open then sees `item.id !==
   *   editingId` even for the same item, and resyncs `draft` from the live store row. Without it,
   *   reopening the same item would keep the abandoned draft, so an edit the creator explicitly
   *   walked away from would reappear looking saved. Caught by `item-sheet.spec.ts`, and it is why
   *   the id is tracked here as well as in `CalendarShell`.
   */
  if (item === null) {
    if (editingId !== null) setEditingId(null);
  } else if (item.id !== editingId) {
    setEditingId(item.id);
    setDraft(item);
    setError(null);
    setErrorCode(null);
  }

  const open = item !== null;
  const current = draft ?? item;

  const changes = item !== null && current !== null ? changesBetween(item, current) : {};
  const dirty = hasChanges(changes);

  function edit(patch: Partial<ContentItem>): void {
    setDraft((previous) => (previous === null ? null : { ...previous, ...patch }));
    // The refusal described a save attempt that no longer matches the draft. Leaving it on screen
    // would have the sheet arguing with an edit the creator has already made.
    setError(null);
    setErrorCode(null);
    setLinkRefused(false);
  }

  async function save(): Promise<void> {
    if (item === null || current === null || saving) return;

    // Nothing changed: close without a request. The backend refuses an empty body with a 422
    // (`minProperties: 1`) on purpose, so a no-op save must not become one.
    if (!dirty) {
      onOpenChange(false);
      return;
    }

    /*
     * T066 — the published link is checked **here, before the request is built**, and the resolution
     * was decided in `tasks.md` before this code existed rather than discovered from the symptom.
     *
     * The conflict it settles: T052 fixed that one save is **one** `PATCH` carrying a diff, because
     * SC-012 needs a title-only idea to gain a platform *and* advance in a single request. A
     * malformed `published_url` makes the backend refuse the **whole body** with a 422 — so the
     * accompanying status change dies with it, which is exactly what the spec's edge case forbids.
     * One request cannot satisfy both, and the cheapest way to honour it is the same one T053 already
     * applies to the 409: **do not produce the refusal.** Splitting the link into its own request was
     * rejected because it destroys the one-save-one-request property T052 exists to establish.
     *
     * **The draft is not touched.** The status change and every other pending edit stay exactly as
     * the creator made them; one save then carries all of it once the link is fixed or cleared. That
     * is the whole of the requirement — "the item's status change is not lost as a result".
     *
     * The check is `isValidPublishedUrl`, which is the **contract's** `^https?://` and 2048 and not
     * one character stricter. T063 pinned a bare `https://` as accepted on purpose; a client stricter
     * than the contract refuses values the API stores happily, and no backend test can see it.
     * Tightening this means amending `contracts/openapi.yaml` first.
     */
    if (current.published_url !== null && !isValidPublishedUrl(current.published_url)) {
      setError(LINK_REFUSAL);
      // Not an invariant code: no server was asked. `errorCode` stays null so T053's 409 handling
      // does not claim a refusal it had no part in.
      setErrorCode(null);
      setLinkRefused(true);
      // The same reach-the-fix path T053 built for the 409, pointed at the link. The sheet's body
      // scrolls, so the field is routinely off screen when the save button is under the thumb —
      // adjacency is not reachability.
      focusFix(linkField);
      return;
    }

    setSaving(true);
    setError(null);
    setErrorCode(null);

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

      const code = caught instanceof ApiError ? caught.code : null;
      setErrorCode(code);
      // Focus the control that resolves it. This is the difference between the fix being *adjacent*
      // and being *reached*: the sheet's body scrolls, so the columns may be off screen — and moving
      // focus scrolls them back and puts the keyboard on the answer (FR-015b).
      focusFix(code === "platform_locked" ? statusGroup : code === null ? null : platformGroup);
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
              onChange={(event) =>
                edit({ hook: event.target.value === "" ? null : event.target.value })
              }
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
              <GroupLabel id={statusId} invalid={errorCode === "platform_locked"}>
                Status
              </GroupLabel>
              {/*
               * A radio group: exactly one of three, always set (FR-007 — `status` is `NOT NULL` with
               * a default, so there is no "no status"). Both directions are offered at once, which is
               * all FR-008 needs — moving back to `idea` is the same one tap as moving forward.
               */}
              <div
                ref={statusGroup}
                role="radiogroup"
                aria-labelledby={statusId}
                data-invalid={errorCode === "platform_locked" ? "" : undefined}
                {...(errorCode === "platform_locked" ? { "aria-describedby": errorId } : {})}
                data-testid="status-group"
                className="flex flex-col gap-1.5"
              >
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
              <GroupLabel id={platformId} invalid={errorCode === "platform_required"}>
                Platform
              </GroupLabel>
              {/*
               * Toggle buttons rather than radios, and the difference is FR-010a plus FR-009a: at most
               * **one** platform, and `null` is a legal value the creator must be able to return to —
               * a radio group has no "none" once one is picked. Tapping the selected platform clears
               * it, which is the only way to reach the `platform_locked` refusal T053 renders.
               */}
              <div
                ref={platformGroup}
                role="group"
                aria-labelledby={platformId}
                data-invalid={errorCode === "platform_required" ? "" : undefined}
                {...(errorCode === "platform_required" ? { "aria-describedby": errorId } : {})}
                data-testid="platform-group"
                className="flex flex-col gap-1.5"
              >
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
           * The export puts the published link beside the date, both at `flex:1` in one row. T064
           * **stacks them instead**, and it is the fourth knowing departure from the export — after
           * the 44px options, `text-base` on inputs, and the filter row above the drawer. Like all
           * three it is a reachability constraint rather than taste.
           *
           * The row the export drew no longer exists: T052 added a `CLEAR` button beside the date
           * (SC-011 — without it the tap path can schedule but never unschedule), so the date half is
           * already two controls. Half of 375px less the padding is ~165px; at the `text-base` 16px
           * that iOS forces on us, that is about twenty characters of a value the contract lets run to
           * **2048**. `.claude/rules/design.md` makes mobile-first "a hard constraint, not a
           * preference" and the export "the starting point, not a drop-in".
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
              <p
                className="text-overdue mt-1.5 text-[11px] leading-relaxed"
                data-testid="item-overdue-note"
              >
                Date has passed — overdue
              </p>
            ) : null}
          </Field>

          {/*
           * The published link (T064, FR-019).
           *
           * `type="url"` is here for the **keyboard** — a phone offers `/` and `.com` — and for
           * nothing else. Its native validity must never become the gate: the contract's only
           * machine-checkable rule is `pattern: ^https?://`, and T063 pinned that the API accepts
           * `https://` with nothing after it, which the browser's own URL validation rejects. Gating
           * on `input.validity` would make the client refuse a value the server accepts, which is
           * drift pointing the other way. Nothing submits — every button here is `type="button"` and
           * there is no `<form>` — so the attribute stays inert. T066 does the checking, against the
           * contract's pattern rather than the browser's opinion.
           *
           * `maxLength` is the contract's 2048 and is the one constraint worth enforcing at the
           * keystroke: past it the column itself would refuse, and `String(2048)` overflowing is a
           * 500 rather than a 422 (the reason `PublishedUrl` exists in the backend since T030).
           */}
          <Field label="Published link" htmlFor={linkId}>
            <div className="flex gap-2" ref={linkField}>
              <input
                id={linkId}
                type="url"
                inputMode="url"
                maxLength={PUBLISHED_URL_MAX_LENGTH}
                value={current?.published_url ?? ""}
                // Empty is how a cleared text input reports itself, and `null` is how the contract
                // spells "clear this field" — the same edge conversion the title and hook do, so
                // `changesBetween` never sees an empty string where FR-023 means a null.
                onChange={(event) =>
                  edit({ published_url: event.target.value === "" ? null : event.target.value })
                }
                placeholder="Add when posted"
                /*
                 * Marked only after a save was refused (T066) — never while typing. `aria-invalid` is
                 * the half that is announced; the border is the half that is seen, and neither is
                 * colour alone at the message level because the sentence below says the same thing.
                 */
                aria-invalid={linkRefused || undefined}
                className={cn(
                  "border-hairline bg-surface-3 text-ink focus-visible:ring-brand-hi placeholder:text-ink-mid h-12 min-w-0 flex-1 rounded-sm border px-3 text-base focus-visible:ring-2 focus-visible:outline-none",
                  linkRefused && "border-brand-hi",
                )}
                data-testid="item-link-input"
              />

              {/*
               * The open control, beside the value it opens (T065).
               *
               * **Why the sheet has one at all, when T065's line says "grid and drawer".** The month
               * grid is the default view and its chips are `micro` — a ~53px day cell, where a 44px
               * control cannot go without breaking the tap floor `.claude/rules/design.md` makes a
               * hard constraint. So the grid's `full` chips (the week list) and the expanded drawer
               * get it inline, and the month grid reaches it here, one tap further in. Without this
               * the default view has no path to US5 scenario 3 at all.
               *
               * It reads the **draft**, so a link that has just been pasted can be checked before
               * saving. That is also the only place a `javascript:` value could reach an `href`,
               * which is why `PublishedLink` gates on the contract's scheme pattern.
               */}
              {current === null ? null : <PublishedLink item={current} className="h-12 w-12" />}
            </div>

            {/*
             * The prompt, and the whole of "prompted on the move to `posted` but never required".
             * It is a sentence, not a gate: no `required`, no disabled save, and `posted` with no
             * link is a valid item the backend stores happily. Shown only while the link is still
             * empty — prompting for something already supplied is noise.
             */}
            {current?.status === "posted" && current.published_url === null ? (
              <p
                className="text-ink-mid mt-1.5 text-[11px] leading-relaxed"
                data-testid="item-link-prompt"
              >
                Posted — add the link to the live post when you have it. Optional.
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

        {/*
         * Below the save row and outside it, in the export's muted weight. Two taps minimum to
         * delete anything, and the second one lives in a focus-trapped `AlertDialog` whose default
         * focus is `KEEP ITEM` (FR-020, SC-007).
         */}
        <div className="px-4 pb-4.5">
          <button
            type="button"
            onClick={() => {
              if (item !== null) onRequestDelete(item);
            }}
            className="border-hairline text-ink-mid font-display h-11 w-full rounded-sm border bg-transparent text-[11px] font-semibold tracking-[0.18em] uppercase"
            data-testid="item-delete"
          >
            Delete item
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

/**
 * The same label treatment for a group of buttons, which has no single control to point `htmlFor` at.
 *
 * `invalid` turns the label the brand colour when an invariant refusal names this group. Colour is
 * carrying emphasis here rather than meaning — the message beside it says which control and why in
 * words, and focus has already moved there — so SC-004's colour-independence is not at stake.
 */
function GroupLabel({
  id,
  invalid = false,
  children,
}: {
  readonly id: string;
  readonly invalid?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      id={id}
      className={cn(
        "font-display mb-1.5 block text-[10px] leading-none font-semibold tracking-[0.2em] uppercase",
        invalid ? "text-brand-hi" : "text-ink-mid",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Move focus to the first option of the group that resolves a refusal.
 *
 * Deliberately the *first* option rather than a remembered one: for `platform_locked` the instruction
 * is literally "move this back to ideas", and `idea` is the first status; for `platform_required` any
 * platform will do and the first is where a thumb already is.
 */
function focusFix(group: React.RefObject<HTMLDivElement | null> | null): void {
  // `input, button` rather than `button` since T066: the two invariant codes are resolved in the
  // status and platform columns, which hold buttons, and a refused link is resolved in a text field.
  // First match in document order, which is the control in every case — the link row's `<a>` is not
  // matched at all, and would be the wrong thing to focus if it were.
  group?.current?.querySelector<HTMLElement>("input, button")?.focus();
}

/**
 * What the creator is told when the link is refused before the request is built (T066).
 *
 * It names the rule and then says the thing the spec's edge case is actually about: **nothing else
 * was lost.** A creator who has just advanced an item to `posted` and pasted a bad link needs to know
 * the status change is still there, or they will redo it.
 *
 * The rule is stated as the contract states it, both halves, so the sentence cannot drift into
 * describing a stricter check than the one that ran.
 */
const LINK_REFUSAL =
  "A published link must start with http:// or https:// and be at most 2048 characters. " +
  "Your other changes are still here — fix or clear the link, then save.";

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
