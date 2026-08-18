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
} from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { isCurrentlyTraveling, pinTreatment } from "@/lib/map";
import { playCue } from "@/lib/sound";
import { cn } from "@/lib/utils";

import { VisitedPanel } from "./VisitedPanel";

/**
 * The single editing surface for one Destination (T029–T032, User Story 2 of `003`;
 * **restructured into a thin shell, 004 T012**).
 *
 * Built from the export's `DestinationSheet · Visited` and `DestinationSheet · Planned/Wishlist`
 * panels (`1e` / `1f`): a bottom sheet carrying name, location, dates and status — the
 * **editable-fields** portion, common to every status until `004`'s User Story 6 (T026) branches
 * it too — plus, below that, whatever this Destination's own **saved** status calls for (FR-009).
 *
 * ## The status branch reads `detail.status`, never `draft.status`
 *
 * Deliberate, and easy to get backwards: what content panel renders is a fact about the
 * Destination as it actually is, not a live preview of what the status control is being dragged
 * toward mid-edit. `VisitedPanel` (T013) is `detail.status === "visited"`'s content; `PlannedPanel`
 * (`004` US4) and `WishlistPanel` (`004` US5) are the other two statuses' own content, added in
 * their own phases. **Until all three exist, every non-Visited status keeps today's bare
 * editable-fields form as an explicit, temporary fallback** — there is deliberately no Planned or
 * Wishlist content section yet. What the *editing form itself* asks for as the status control
 * changes (US6, T026) is a separate branch, on `draft.status`, and belongs to a later phase.
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
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  /** The Destination to open, or null when the sheet is closed. */
  readonly destinationId: number | null;
  readonly today: DateOnly | null;
  readonly onOpenChange: (open: boolean) => void;
  /** Called after a successful field/status save, so `MapView`'s list stays in sync. */
  readonly onUpdated: (destination: Destination) => void;
  /** Called after a successful delete, so `MapView` removes the pin. */
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
        if (current) setLoadError({ id: destinationId, message: messageFor(error) });
      });

    return () => {
      current = false;
    };
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
                status, not the draft being edited above — see the module docstring for why. Every
                status but Visited keeps no content section yet (`PlannedPanel`/`WishlistPanel` are
                later `004` phases), which is this shell's explicit, temporary fallback. */}
            {detail.status === "visited" ? (
              <VisitedPanel key={detail.id} detail={detail} setDetail={setDetail} onUpdated={onUpdated} />
            ) : null}
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
