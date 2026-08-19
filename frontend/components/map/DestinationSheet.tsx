"use client";

import { useEffect, useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ApiError,
  DESTINATION_STATUSES,
  deleteDestination,
  getDestination,
  updateDestination,
  type Destination,
  type DestinationDetail,
  type DestinationStatus,
  type Trip,
} from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { isCurrentlyTraveling, pinTreatment } from "@/lib/map";
import { playCue } from "@/lib/sound";
import { cn } from "@/lib/utils";

import { PlannedPanel } from "./PlannedPanel";
import { VisitedPanel } from "./VisitedPanel";
import { WishlistPanel } from "./WishlistPanel";

/**
 * The single editing surface for one Destination (T029–T032, User Story 2 of `003`;
 * **restructured into a thin shell, 004 T012**).
 *
 * Built from the export's `DestinationSheet · Visited` and `DestinationSheet · Planned/Wishlist`
 * panels (`1e` / `1f`): a bottom sheet carrying name, location, dates and status — the
 * **editable-fields** portion — plus, below that, whatever this Destination's own **saved**
 * status calls for (FR-009).
 *
 * ## Two branches, on two different variables, in the same file
 *
 * Deliberate, and easy to get backwards. The **content** section (below the Save button) reads
 * `detail.status`, never `draft.status`: what it renders is a fact about the Destination as it
 * actually is, not a live preview of what the status control is being dragged toward mid-edit.
 * `VisitedPanel` (T013) is `detail.status === "visited"`'s content; `PlannedPanel` (T019–T021) is
 * Planned's own — its own dates, the Trip it belongs to (or an offer to attach one), and the
 * sibling places in that Trip; `WishlistPanel` (T023–T024) is the remaining status's content, an
 * honest empty state.
 *
 * The **editable-fields** section (above the Save button, T026) reads `draft.status` instead —
 * FR-017–FR-019, what the status control *changing* asks for. The Dates input is shown whenever
 * `draft.status === "planned"`, transition or not (the shell's pre-T026 behaviour, just narrowed
 * off Wishlist/Visited). Asking for a Trip and asking for impressions/photographs are each done
 * by **reusing `PlannedPanel`/`VisitedPanel` themselves** — but only while the content section
 * below is not already showing the same panel (`detail.status !== draft.status`), so the two
 * branches never render the same panel twice at once even though both read the same
 * `detail`/`setDetail`. Once Save lands, `detail.status` catches up, this transitional copy
 * unmounts, and the content section is the only place those fields live from then on.
 *
 * ## Opens on an id, fetches its own detail
 *
 * `MapView` only ever holds the list shape (`Destination`), which has no `note`/`photographs` —
 * those exist only on `DestinationDetail`, `getDestination`'s own return type. So this sheet takes
 * a bare `destinationId` and fetches fresh on every open, the same "detail is not derived from the
 * list" split the contract itself draws (`GET /destinations` vs `GET /destinations/{id}`).
 *
 * ## The photo upload never touches this backend (FR-023)
 *
 * `createPhotoUploadUrl` mints a presigned PUT; the browser `PUT`s the file bytes **directly to
 * R2**; only the resulting `object_key` is sent to `createPhotograph`. `VisitedPanel`'s own
 * `fetch` to `upload_url` is therefore the one request in this whole product that intentionally
 * bypasses `lib/api.ts`'s `request()` helper — that helper always targets this app's own `/api`
 * proxy, and a presigned R2 URL is a different origin entirely.
 */
export function DestinationSheet({
  destinationId,
  today,
  allDestinations,
  trips,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  /** The Destination to open, or null when the sheet is closed. */
  readonly destinationId: number | null;
  readonly today: DateOnly | null;
  /** `MapShell`'s already-loaded Destination list (004, T021) — `PlannedPanel` needs it for
   * `plannedPlaceContext`'s sibling-places composition (T017); this sheet fetches only its own
   * `DestinationDetail` and has no list of its own. */
  readonly allDestinations: readonly Destination[];
  /** `MapShell`'s already-loaded Trip list (004, T016/T021) — same reasoning, for the matching
   * Trip and the "attach a Trip" picker (T020). */
  readonly trips: readonly Trip[];
  readonly onOpenChange: (open: boolean) => void;
  /** Called after a successful field/status save, so `MapView`'s list stays in sync. */
  readonly onUpdated: (destination: Destination) => void;
  /** Called after a successful delete **and** after a 404 on this sheet's own detail fetch — both
   * mean the same thing to the map: this Destination is gone. `MapShell` reconciles both the same
   * way (close the sheet, reload the list, clear the selection if it named this id). */
  readonly onDeleted: (destinationId: number) => void;
}) {
  const nameId = useId();
  const startDateId = useId();
  const endDateId = useId();

  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DestinationDetail | null>(null);
  /** Tagged with the id it describes, so a stale error from a previous id is never shown while
   * the next one is still loading — the render below checks `loadError?.id === destinationId`. */
  const [loadError, setLoadError] = useState<{ id: number; message: string } | null>(null);

  const [draft, setDraft] = useState<{
    name: string;
    start_date: string | null;
    end_date: string | null;
    status: DestinationStatus;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const open = destinationId !== null;

  /**
   * Closing forgets which id was loaded — React's documented "adjusting state when a prop
   * changes" pattern (same as `ItemSheet`'s own `editingId` reset), not an effect: this runs
   * synchronously during render, so the very next open of a *different* id is guaranteed to see
   * `destinationId !== loadedId` and refetch, without a render where the previous detail still
   * shows under the new id.
   */
  if (destinationId === null && loadedId !== null) {
    setLoadedId(null);
  }

  /**
   * Fetch fresh detail whenever a *different* id opens — keyed on the id, not on object identity,
   * the same reset pattern `ItemSheet` uses and for the same reason: reopening the same
   * destination should not silently discard an in-flight edit, but opening a different one always
   * starts from the server's own current state.
   */
  useEffect(() => {
    if (destinationId === null || destinationId === loadedId) return;

    let current = true;
    getDestination(destinationId)
      .then((fetched) => {
        if (!current) return;
        setLoadedId(destinationId);
        setDetail(fetched);
        setDraft({
          name: fetched.name,
          start_date: fetched.start_date,
          end_date: fetched.end_date,
          status: fetched.status,
        });
      })
      .catch((error: unknown) => {
        if (!current) return;
        // FR-009's Edge Cases: opened here, deleted elsewhere — the panel closes rather than
        // presenting a place that cannot be saved, matching `deleteItem`'s own "a 404 describes a
        // screen the creator already agrees is gone" reading (`frontend/AGENTS.md`). Routed through
        // `onDeleted`, not a bare `onOpenChange(false)`: "gone" is exactly what `onDeleted` already
        // means to `MapShell` (close the sheet, reload the list, clear the selection if it named
        // this id) — a 404 on load and a delete confirmed in this same sheet are the same event
        // from the map's point of view, and reusing the one callback is what makes that reconciliation
        // happen for both instead of only for the path that happened to be built first. Any other
        // failure (network, 5xx) is not that — it stays an in-sheet, retryable error, unchanged.
        if (error instanceof ApiError && error.status === 404) {
          onDeleted(destinationId);
          return;
        }
        setLoadError({ id: destinationId, message: messageFor(error) });
      });

    return () => {
      current = false;
    };
    // `onOpenChange` is intentionally not a dependency: `MapShell` passes a fresh closure every
    // render, and this effect must key on `destinationId`/`loadedId` alone (the fetch-once-per-id
    // guard above) — including `onOpenChange` would re-run it on every unrelated `MapShell`
    // re-render. Safe to omit: the closure only ever calls `setOpenDestinationId(null)`, which is
    // itself stable across renders regardless of which render's closure is invoked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, loadedId]);

  function resetOnClose(next: boolean): void {
    if (!next) {
      setSaveError(null);
      setDeleteError(null);
      setConfirmingDelete(false);
    }
    onOpenChange(next);
  }

  async function saveFields(): Promise<void> {
    if (detail === null || draft === null || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateDestination(detail.id, {
        name: draft.name,
        start_date: draft.start_date,
        end_date: draft.end_date,
        status: draft.status,
      });
      playCue("save");
      setDetail((previous) => (previous === null ? previous : { ...previous, ...updated }));
      onUpdated(updated);
    } catch (error: unknown) {
      playCue("refuse");
      setSaveError(messageFor(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (detail === null || deleting) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDestination(detail.id);
      playCue("delete");
      const id = detail.id;
      setConfirmingDelete(false);
      onOpenChange(false);
      onDeleted(id);
    } catch (error: unknown) {
      playCue("refuse");
      setDeleteError(messageFor(error));
    } finally {
      setDeleting(false);
    }
  }

  const traveling =
    detail !== null && draft !== null
      ? isCurrentlyTraveling({ ...detail, ...draft }, today)
      : false;

  return (
    <Sheet open={open} onOpenChange={resetOnClose}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-surface-1 border-hairline max-h-[88dvh] gap-0 border-t p-0 shadow-e2"
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <span className="bg-ink-lo/50 h-[3px] w-[34px] rounded-sm" aria-hidden="true" />
          <SheetTitle>{detail?.name ?? "Destination"}</SheetTitle>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => resetOnClose(false)}
            className="text-ink-mid focus-ring -mr-2 h-11 px-2 text-xs font-semibold tracking-[0.1em] uppercase"
            data-testid="destination-sheet-close"
          >
            Close
          </button>
        </div>

        {loadError !== null && loadError.id === destinationId ? (
          <p role="alert" className="text-danger-hi px-4 pb-4 text-sm">
            {loadError.message}
          </p>
        ) : detail === null || draft === null ? (
          <p className="text-ink-mid px-4 pb-4 text-sm" data-testid="destination-sheet-loading">
            Loading…
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-1">
            <Field label="Name" htmlFor={nameId}>
              <input
                id={nameId}
                value={draft.name}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous === null ? previous : { ...previous, name: event.target.value },
                  )
                }
                maxLength={200}
                className="border-hairline bg-surface-3 text-ink focus-ring h-12 w-full rounded-sm border px-3 text-xl"
                data-testid="destination-name-input"
              />
              <p className="text-ink-lo mt-1 text-xs">
                {detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)}
              </p>
            </Field>

            {traveling ? (
              <p
                className="border-danger text-danger-hi flex items-center gap-2 border px-2.5 py-2 text-xs leading-relaxed"
                data-testid="destination-traveling-note"
              >
                Today falls inside these dates — shown as Currently Traveling on the map.
              </p>
            ) : null}

            {/* FR-017, FR-018: dates are what Planned makes meaningful — asked for whenever the
                draft's own status is Planned, whether that is a fresh transition or an already-
                Planned place reopened (unchanged from the shell's pre-T026 behaviour, just no
                longer shown for Wishlist/Visited too). */}
            {draft.status === "planned" ? (
              <div className="flex flex-col gap-2">
                <span className="text-ink-mid text-xs leading-none font-semibold tracking-[0.1em] uppercase">
                  Dates
                </span>
                <div className="flex gap-2">
                  <input
                    id={startDateId}
                    type="date"
                    value={draft.start_date ?? ""}
                    onChange={(event) =>
                      setDraft((previous) =>
                        previous === null
                          ? previous
                          : { ...previous, start_date: event.target.value === "" ? null : event.target.value },
                      )
                    }
                    className="border-hairline bg-surface-3 text-ink focus-ring h-12 flex-1 rounded-sm border px-3 text-sm"
                    data-testid="destination-start-date-input"
                  />
                  <input
                    id={endDateId}
                    type="date"
                    value={draft.end_date ?? ""}
                    onChange={(event) =>
                      setDraft((previous) =>
                        previous === null
                          ? previous
                          : { ...previous, end_date: event.target.value === "" ? null : event.target.value },
                      )
                    }
                    className="border-hairline bg-surface-3 text-ink focus-ring h-12 flex-1 rounded-sm border px-3 text-sm"
                    data-testid="destination-end-date-input"
                  />
                </div>
              </div>
            ) : null}

            {/* FR-018's other half — a Trip — and FR-019's impressions/photographs: asked for by
                reusing `PlannedPanel`/`VisitedPanel` themselves, **only while the content section
                below is not already showing the same panel** (`detail.status` has not caught up
                with `draft.status` yet). Once Save lands, `detail.status` catches up, this section
                unmounts, and the content section below is the only place these fields live —
                so the two branches are never both showing the same panel at once, even though
                both read from the same `detail`/`setDetail`. */}
            {draft.status === "planned" && detail.status !== "planned" ? (
              <PlannedPanel
                key={`draft-planned-${detail.id}`}
                detail={detail}
                allDestinations={allDestinations}
                trips={trips}
                today={today}
                setDetail={setDetail}
                onUpdated={onUpdated}
              />
            ) : null}

            {draft.status === "visited" && detail.status !== "visited" ? (
              <VisitedPanel
                key={`draft-visited-${detail.id}`}
                detail={detail}
                setDetail={setDetail}
                onUpdated={onUpdated}
              />
            ) : null}

            <div className="flex flex-col gap-2">
              <span className="text-ink-mid text-xs leading-none font-semibold tracking-[0.1em] uppercase">
                Status
              </span>
              {/* FR-028: any of the three is a valid target from either other, at any time — a
                  radio group with no forced order, unlike Content Calendar's status pipeline. */}
              <div role="radiogroup" data-testid="destination-status-group" className="flex gap-1.5">
                {DESTINATION_STATUSES.map((status) => {
                  const treatment = pinTreatment(status);
                  const selected = draft.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setDraft((previous) =>
                          previous === null ? previous : { ...previous, status },
                        )
                      }
                      data-testid={`destination-status-option-${status}`}
                      className={cn(
                        "focus-ring flex h-11 flex-1 items-center justify-center gap-1.5 rounded-sm border text-[11px] font-semibold tracking-[0.08em] uppercase",
                        selected
                          ? cn(treatment.borderClass, treatment.textClass, "bg-surface-2")
                          : "border-hairline bg-surface-3 text-ink-mid",
                      )}
                    >
                      {treatment.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {saveError !== null ? (
              <p role="alert" className="text-danger-hi text-xs">
                {saveError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void saveFields()}
              disabled={saving}
              className="bg-brand font-display focus-ring-inset h-12 w-full text-base font-semibold tracking-[0.1em] text-white uppercase shadow-e1 disabled:opacity-50"
              data-testid="destination-save"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {/* FR-009: content below this point is determined by the Destination's own *saved*
                status, not the draft being edited above — see the module docstring for why. */}
            {detail.status === "visited" ? (
              <VisitedPanel key={detail.id} detail={detail} setDetail={setDetail} onUpdated={onUpdated} />
            ) : detail.status === "planned" ? (
              <PlannedPanel
                key={detail.id}
                detail={detail}
                allDestinations={allDestinations}
                trips={trips}
                today={today}
                setDetail={setDetail}
                onUpdated={onUpdated}
              />
            ) : (
              <WishlistPanel key={detail.id} />
            )}
          </div>
        )}

        <div className="px-4 pt-3 pb-4.5">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={detail === null}
            className="border-hairline text-ink-mid focus-ring h-11 w-full rounded-sm border bg-transparent text-xs font-semibold tracking-[0.1em] uppercase disabled:opacity-40"
            data-testid="destination-delete"
          >
            Delete destination
          </button>
        </div>
      </SheetContent>

      {/* T032, matching `001`'s `DeleteConfirm` three-tap pattern: KEEP focused first, the
          destructive action lower-weight, no dismissal by clicking outside. */}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(next) => {
          if (!next) setDeleteError(null);
          setConfirmingDelete(next);
        }}
      >
        <AlertDialogContent className="bg-surface-2 gap-0 p-5" data-testid="destination-delete-confirm">
          <AlertDialogTitle className="text-ink mb-2.5 leading-tight tracking-[0.14em]">
            Delete this destination?
          </AlertDialogTitle>
          <AlertDialogDescription
            className="text-ink-mid mb-3.5 text-[13px] leading-relaxed break-words"
            data-testid="destination-delete-confirm-message"
          >
            {deleteError ?? (
              <>
                &ldquo;{detail?.name}&rdquo; and its photographs will be removed permanently.
                There is no trash and no undo.
              </>
            )}
          </AlertDialogDescription>
          <AlertDialogFooter className="flex flex-col gap-2.5">
            <AlertDialogCancel
              autoFocus
              className="border-hairline bg-surface-3 text-ink focus-ring h-12 w-full rounded-sm border text-[13px] font-semibold tracking-[0.16em] uppercase"
              data-testid="destination-delete-keep"
            >
              Keep destination
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="border-danger-hi/50 text-danger-hi focus-ring h-12 w-full rounded-sm border bg-transparent text-[13px] font-semibold tracking-[0.16em] uppercase disabled:opacity-50"
              data-testid="destination-delete-confirm-action"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

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
        className="text-ink-mid mb-1.5 block text-xs leading-none font-semibold tracking-[0.1em] uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong. Try again.";
}
