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
  createPhotoUploadUrl,
  createPhotograph,
  deleteDestination,
  deletePhotograph,
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

/**
 * The single editing surface for one Destination (T029, T030, T031, T032 — User Story 2).
 *
 * Built from the export's `DestinationSheet · Visited` and `DestinationSheet · Planned/Wishlist`
 * panels (`1e` / `1f`): a bottom sheet carrying name, location, dates, status, and — **only when
 * `status === "visited"`** — a photo gallery and a note (FR-009, INV-3: the gate is a display
 * rule, not something the API withholds). Planned and Wishlist pins get neither section, matching
 * `1f`'s own note: "No gallery and no note field on Planned or Wishlist — neither exists yet to
 * show."
 *
 * ## Opens on an id, fetches its own detail
 *
 * `MapView` only ever holds the list shape (`Destination`), which has no `note`/`photographs` —
 * those exist only on `DestinationDetail`, `getDestination`'s own return type. So this sheet takes
 * a bare `destinationId` and fetches fresh on every open, the same "detail is not derived from the
 * list" split the contract itself draws (`GET /destinations` vs `GET /destinations/{id}`).
 *
 * ## Two independent drafts, two independent saves
 *
 * Unlike `ItemSheet`'s one draft/one save, this sheet has two things that change at different
 * rates and for different reasons: the **fields** (name, dates, status — `SAVE`) and the **note**
 * (`SAVE NOTE`, T031). Photos attach individually and immediately (T030) rather than joining
 * either draft — there is nothing to "discard" about a photo that has already reached R2.
 *
 * ## The photo upload never touches this backend (FR-023)
 *
 * `createPhotoUploadUrl` mints a presigned PUT; the browser `PUT`s the file bytes **directly to
 * R2**; only the resulting `object_key` is sent to `createPhotograph`. This component's own
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
  const noteId = useId();
  const photoInputId = useId();

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

  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
        setNoteDraft(fetched.note ?? "");
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
      setNoteError(null);
      setUploadError(null);
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

  async function saveNote(): Promise<void> {
    if (detail === null || savingNote) return;

    setSavingNote(true);
    setNoteError(null);
    try {
      const updated = await updateDestination(detail.id, {
        note: noteDraft === "" ? null : noteDraft,
      });
      playCue("save");
      setDetail((previous) =>
        previous === null ? previous : { ...previous, note: noteDraft === "" ? null : noteDraft },
      );
      onUpdated(updated);
    } catch (error: unknown) {
      playCue("refuse");
      setNoteError(messageFor(error));
    } finally {
      setSavingNote(false);
    }
  }

  async function attachPhoto(file: File): Promise<void> {
    if (detail === null || uploading) return;

    setUploading(true);
    setUploadError(null);
    try {
      const { upload_url, object_key } = await createPhotoUploadUrl(detail.id);

      // Direct to R2, never through this app's own `/api` proxy (FR-023) — see the module
      // docstring for why this is the one `fetch` in the product that is not `lib/api.ts`'s
      // `request()`.
      const putResponse = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putResponse.ok) {
        throw new Error(`Upload failed (${putResponse.status}). Try again.`);
      }

      const photograph = await createPhotograph(detail.id, { object_key });
      playCue("save");
      setDetail((previous) =>
        previous === null
          ? previous
          : { ...previous, photographs: [...previous.photographs, photograph] },
      );
    } catch (error: unknown) {
      playCue("refuse");
      setUploadError(
        error instanceof ApiError || error instanceof Error
          ? error.message || messageFor(error)
          : "Could not attach that photo. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(photoId: number): Promise<void> {
    if (detail === null) return;
    try {
      await deletePhotograph(detail.id, photoId);
      playCue("delete");
      setDetail((previous) =>
        previous === null
          ? previous
          : { ...previous, photographs: previous.photographs.filter((p) => p.id !== photoId) },
      );
    } catch (error: unknown) {
      playCue("refuse");
      setUploadError(messageFor(error));
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
  const visited = draft?.status === "visited";

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

            {/* FR-009, INV-3: gallery and note exist only for a Visited place — nothing to show
                yet on Planned or Wishlist (`1f`'s own note in the design export). */}
            {visited ? (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-display text-ink text-base">Photos</span>
                    <span className="text-ink-lo text-xs">{detail.photographs.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {detail.photographs.map((photo) => (
                      <div key={photo.id} className="group relative aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a presigned,
                            expiring R2 URL; Next's image optimiser cannot cache a URL that dies
                            on its own within minutes. */}
                        <img
                          src={photo.url}
                          alt=""
                          className="h-full w-full rounded-sm object-cover"
                          data-testid="destination-photo"
                        />
                        <button
                          type="button"
                          onClick={() => void removePhoto(photo.id)}
                          className="bg-surface-0/80 text-ink focus-ring absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-sm text-xs"
                          aria-label="Remove photo"
                          data-testid="destination-photo-remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <label
                      htmlFor={photoInputId}
                      className="border-hairline text-ink-mid focus-ring flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed text-[10px] tracking-[0.06em] uppercase"
                      data-testid="destination-photo-attach"
                    >
                      <span className="text-lg leading-none">+</span>
                      {uploading ? "Uploading…" : "Attach"}
                    </label>
                    <input
                      id={photoInputId}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file !== undefined) void attachPhoto(file);
                      }}
                      data-testid="destination-photo-input"
                    />
                  </div>
                  {uploadError !== null ? (
                    <p role="alert" className="text-danger-hi mt-1.5 text-xs">
                      {uploadError}
                    </p>
                  ) : null}
                </div>

                <Field label="Note" htmlFor={noteId}>
                  <textarea
                    id={noteId}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={3}
                    className="border-hairline bg-surface-3 text-ink focus-ring w-full resize-none rounded-sm border p-3 text-sm leading-relaxed"
                    data-testid="destination-note-input"
                  />
                </Field>

                {noteError !== null ? (
                  <p role="alert" className="text-danger-hi text-xs">
                    {noteError}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void saveNote()}
                  disabled={savingNote}
                  className="border-hairline text-ink focus-ring h-11 w-full rounded-sm border text-xs font-semibold tracking-[0.1em] uppercase disabled:opacity-50"
                  data-testid="destination-save-note"
                >
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </>
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
