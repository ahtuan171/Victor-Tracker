"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";

import {
  ApiError,
  createPhotoUploadUrl,
  createPhotograph,
  deletePhotograph,
  updateDestination,
  type Destination,
  type DestinationDetail,
} from "@/lib/api";
import { playCue } from "@/lib/sound";

/**
 * A Visited place's content: its photographs and its impressions, as content rather than as form
 * fields (004, T013, FR-009, FR-010, INV-3). Moved here from `DestinationSheet.tsx`'s old combined
 * form, unchanged in behaviour — attach, remove, and save-note are the same three requests, now
 * owned by the panel that actually shows their result rather than by the shell around every status.
 *
 * `DestinationSheet.tsx` renders this **keyed on `detail.id`** — this component's own `noteDraft`
 * is local state seeded once from `detail.note`, the same "adjust state on prop change" family as
 * the shell's own `loadedId` reset, and a `key` is the idiomatic way to get a fresh instance rather
 * than reconciling one across two different Destinations (React's documented pattern; there is no
 * effect here to get the dependency array wrong).
 *
 * `setDetail` is passed straight through from the shell's own `useState<DestinationDetail | null>`
 * setter — not narrowed to a wrapper — so a photo attach/remove or a note save updates the identical
 * state the shell's other fields read (traveling note, the delete confirmation's name), with one
 * source of truth for "what this Destination currently is" rather than two copies that could drift.
 */
export function VisitedPanel({
  detail,
  setDetail,
  onUpdated,
}: {
  readonly detail: DestinationDetail;
  readonly setDetail: Dispatch<SetStateAction<DestinationDetail | null>>;
  readonly onUpdated: (destination: Destination) => void;
}) {
  const noteId = useId();
  const photoInputId = useId();

  const [noteDraft, setNoteDraft] = useState(detail.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function saveNote(): Promise<void> {
    if (savingNote) return;

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
    if (uploading) return;

    setUploading(true);
    setUploadError(null);
    try {
      const { upload_url, object_key } = await createPhotoUploadUrl(detail.id);

      // Direct to R2, never through this app's own `/api` proxy (FR-023) — see
      // `DestinationSheet.tsx`'s module docstring for why this is the one `fetch` in the product
      // that is not `lib/api.ts`'s `request()`.
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

  // FR-010 scenario 2, T014: neither impressions nor photographs yet — invite adding both, rather
  // than leaving an empty grid and an empty textarea to speak for themselves.
  const isEmpty = detail.photographs.length === 0 && (detail.note === null || detail.note === "");

  return (
    <div className="flex flex-col gap-4">
      {isEmpty ? (
        <p className="text-ink-lo text-xs leading-relaxed" data-testid="visited-empty-invite">
          Nothing added yet — attach your first photo or write about what happened here.
        </p>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-ink text-base">Photos</span>
          <span className="text-ink-lo text-xs">{detail.photographs.length}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {detail.photographs.map((photo) => (
            <div key={photo.id} className="group relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- a presigned, expiring R2
                  URL; Next's image optimiser cannot cache a URL that dies on its own within
                  minutes. */}
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
          {/* The input comes immediately before its label — `globals.css`'s `.focus-ring-sibling`
              needs the adjacency to draw a visible ring on the label when the (invisible, `sr-only`)
              input itself receives keyboard focus, since a `<label>` is never a native tab stop. */}
          <input
            id={photoInputId}
            type="file"
            accept="image/*"
            className="focus-ring sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void attachPhoto(file);
            }}
            data-testid="destination-photo-input"
          />
          <label
            htmlFor={photoInputId}
            className="border-hairline text-ink-mid focus-ring-sibling flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed text-xs tracking-[0.06em] uppercase"
            data-testid="destination-photo-attach"
          >
            <span className="text-lg leading-none">+</span>
            {uploading ? "Uploading…" : "Attach"}
          </label>
        </div>
        {uploadError !== null ? (
          <p role="alert" className="text-danger-hi mt-1.5 text-xs">
            {uploadError}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={noteId}
          className="text-ink-mid mb-1.5 block text-xs leading-none font-semibold tracking-[0.1em] uppercase"
        >
          Note
        </label>
        <textarea
          id={noteId}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          rows={3}
          className="border-hairline bg-surface-3 text-ink focus-ring w-full resize-none rounded-sm border p-3 text-sm leading-relaxed"
          data-testid="destination-note-input"
        />
      </div>

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
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong. Try again.";
}
