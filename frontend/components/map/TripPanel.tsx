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
  TRIP_STATUSES,
  createDestination,
  createTrip,
  deleteTrip,
  listDestinations,
  updateTrip,
  type Destination,
  type LocationCandidate,
  type Trip,
  type TripStatus,
} from "@/lib/api";
import { useTrips } from "@/lib/trips";
import { playCue } from "@/lib/sound";
import { cn } from "@/lib/utils";

import { LocationSearch } from "./LocationSearch";

/**
 * Create, list, and open a Trip (T036, T037, T040, T042, T043 — User Story 3).
 *
 * One Sheet with two views, the same "list, then a detail on tap" shape `BacklogDrawer` and
 * `DestinationSheet` each use for their own resource: `view === "list"` shows every Trip plus a
 * create form; `view === <id>` opens one Trip's own fields, its Destinations (each carrying
 * FR-017's containment flag when it applies), and `LocationSearch` for adding another.
 *
 * `TripStatus`'s six values are shown as **the ratified words verbatim** —
 * `design/003-travel-map/BRIEF.md`'s audit findings, not the design export's own wording, which
 * invents a seventh ("Abandoned") with no ratified equivalent. A plain `<select>` is enough: the
 * brief states this status "drives no pin" and needs no elaborate encoding.
 */
export function TripPanel({
  open,
  onOpenChange,
  onDestinationsChanged,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Called after a Destination is added to a Trip, or a Trip (and its Destinations) is deleted
   * — so `MapShell` reloads the map's own pins. */
  readonly onDestinationsChanged: () => void;
}) {
  const { trips, status, error, reload } = useTrips();
  const [view, setView] = useState<"list" | number>("list");

  const nameId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const statusId = useId();

  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState({ name: "", start_date: "", end_date: "" });
  const [createStatus, setCreateStatus] = useState<TripStatus>("wishlist");
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function resetOnClose(next: boolean): void {
    if (!next) {
      setView("list");
      setCreating(false);
      setCreateError(null);
      setCreateDraft({ name: "", start_date: "", end_date: "" });
    }
    onOpenChange(next);
  }

  async function submitCreate(): Promise<void> {
    if (creatingSubmitting) return;
    if (createDraft.name.trim() === "" || createDraft.start_date === "" || createDraft.end_date === "") {
      setCreateError("Name, start date and end date are all required.");
      return;
    }

    setCreatingSubmitting(true);
    setCreateError(null);
    try {
      const trip = await createTrip({
        name: createDraft.name.trim(),
        start_date: createDraft.start_date,
        end_date: createDraft.end_date,
        status: createStatus,
      });
      playCue("save");
      reload();
      setCreating(false);
      setCreateDraft({ name: "", start_date: "", end_date: "" });
      setCreateStatus("wishlist");
      setView(trip.id);
    } catch (err: unknown) {
      playCue("refuse");
      setCreateError(messageFor(err));
    } finally {
      setCreatingSubmitting(false);
    }
  }

  const openTrip = typeof view === "number" ? (trips.find((t) => t.id === view) ?? null) : null;

  return (
    <Sheet open={open} onOpenChange={resetOnClose}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-surface-1 border-hairline max-h-[88dvh] gap-0 border-t p-0 shadow-e2"
        data-testid="trip-panel"
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <span className="bg-ink-lo/50 h-[3px] w-[34px] rounded-sm" aria-hidden="true" />
          <SheetTitle>{openTrip?.name ?? "Trips"}</SheetTitle>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => resetOnClose(false)}
            className="text-ink-mid focus-ring -mr-2 h-11 px-2 text-xs font-semibold tracking-[0.1em] uppercase"
            data-testid="trip-panel-close"
          >
            Close
          </button>
        </div>

        {view === "list" ? (
          <TripList
            trips={trips}
            status={status}
            error={error}
            creating={creating}
            createDraft={createDraft}
            createStatus={createStatus}
            createSubmitting={creatingSubmitting}
            createError={createError}
            nameId={nameId}
            startDateId={startDateId}
            endDateId={endDateId}
            statusId={statusId}
            onOpenTrip={(id) => setView(id)}
            onToggleCreate={() => {
              setCreating((was) => !was);
              setCreateError(null);
            }}
            onDraftChange={setCreateDraft}
            onStatusChange={setCreateStatus}
            onSubmit={() => void submitCreate()}
          />
        ) : openTrip !== null ? (
          <TripDetail
            trip={openTrip}
            onBack={() => setView("list")}
            onUpdated={() => reload()}
            onDeleted={() => {
              setView("list");
              reload();
              onDestinationsChanged();
            }}
            onDestinationAdded={() => onDestinationsChanged()}
          />
        ) : (
          <p className="text-ink-mid px-4 pb-4 text-sm">This trip is gone.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TripList({
  trips,
  status,
  error,
  creating,
  createDraft,
  createStatus,
  createSubmitting,
  createError,
  nameId,
  startDateId,
  endDateId,
  statusId,
  onOpenTrip,
  onToggleCreate,
  onDraftChange,
  onStatusChange,
  onSubmit,
}: {
  readonly trips: readonly Trip[];
  readonly status: "loading" | "ready" | "error";
  readonly error: string | null;
  readonly creating: boolean;
  readonly createDraft: { name: string; start_date: string; end_date: string };
  readonly createStatus: TripStatus;
  readonly createSubmitting: boolean;
  readonly createError: string | null;
  readonly nameId: string;
  readonly startDateId: string;
  readonly endDateId: string;
  readonly statusId: string;
  readonly onOpenTrip: (id: number) => void;
  readonly onToggleCreate: () => void;
  readonly onDraftChange: (draft: { name: string; start_date: string; end_date: string }) => void;
  readonly onStatusChange: (status: TripStatus) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      <button
        type="button"
        onClick={onToggleCreate}
        className="border-hairline text-ink focus-ring h-11 w-full rounded-sm border text-xs font-semibold tracking-[0.1em] uppercase"
        data-testid="trip-create-toggle"
      >
        {creating ? "Cancel" : "+ New Trip"}
      </button>

      {creating ? (
        <div className="border-hairline bg-surface-2 flex flex-col gap-2.5 rounded-sm border p-3">
          <div>
            <label htmlFor={nameId} className="text-ink-mid mb-1 block text-xs font-semibold uppercase">
              Name
            </label>
            <input
              id={nameId}
              value={createDraft.name}
              onChange={(event) => onDraftChange({ ...createDraft, name: event.target.value })}
              maxLength={200}
              className="border-hairline bg-surface-3 text-ink focus-ring h-11 w-full rounded-sm border px-3 text-base"
              data-testid="trip-name-input"
            />
          </div>
          <div className="flex gap-2">
            <input
              id={startDateId}
              type="date"
              value={createDraft.start_date}
              onChange={(event) => onDraftChange({ ...createDraft, start_date: event.target.value })}
              className="border-hairline bg-surface-3 text-ink focus-ring h-11 flex-1 rounded-sm border px-3 text-sm"
              data-testid="trip-start-date-input"
            />
            <input
              id={endDateId}
              type="date"
              value={createDraft.end_date}
              onChange={(event) => onDraftChange({ ...createDraft, end_date: event.target.value })}
              className="border-hairline bg-surface-3 text-ink focus-ring h-11 flex-1 rounded-sm border px-3 text-sm"
              data-testid="trip-end-date-input"
            />
          </div>
          <div>
            <label htmlFor={statusId} className="text-ink-mid mb-1 block text-xs font-semibold uppercase">
              Status
            </label>
            <select
              id={statusId}
              value={createStatus}
              onChange={(event) => onStatusChange(event.target.value as TripStatus)}
              className="border-hairline bg-surface-3 text-ink focus-ring h-11 w-full rounded-sm border px-3 text-sm uppercase"
              data-testid="trip-status-select"
            >
              {TRIP_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          {createError !== null ? (
            <p role="alert" className="text-danger-hi text-xs">
              {createError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onSubmit}
            disabled={createSubmitting}
            className="bg-brand font-display focus-ring-inset h-11 w-full text-sm font-semibold tracking-[0.1em] text-white uppercase disabled:opacity-50"
            data-testid="trip-create-submit"
          >
            {createSubmitting ? "Creating…" : "Create trip"}
          </button>
        </div>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="text-danger-hi text-sm">
          {error}
        </p>
      ) : null}

      {status === "ready" && trips.length === 0 ? (
        <p className="text-ink-mid text-sm" data-testid="trip-list-empty">
          No trips yet. Create one to start organising Destinations.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {trips.map((trip) => (
          <li key={trip.id}>
            <button
              type="button"
              onClick={() => onOpenTrip(trip.id)}
              className="border-hairline bg-surface-2 focus-ring flex h-14 w-full items-center justify-between rounded-sm border px-3 text-left"
              data-testid={`trip-row-${trip.id}`}
            >
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-sm font-semibold">{trip.name}</span>
                <span className="text-ink-mid block text-xs">
                  {trip.start_date} – {trip.end_date}
                </span>
              </span>
              <span className="text-ink-lo shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase">
                {trip.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TripDetail({
  trip,
  onBack,
  onUpdated,
  onDeleted,
  onDestinationAdded,
}: {
  readonly trip: Trip;
  readonly onBack: () => void;
  readonly onUpdated: () => void;
  readonly onDeleted: () => void;
  readonly onDestinationAdded: () => void;
}) {
  const [draft, setDraft] = useState({
    name: trip.name,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: trip.status,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [destinations, setDestinations] = useState<readonly Destination[] | null>(null);
  const [destinationsError, setDestinationsError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function loadDestinations(): void {
    listDestinations({ trip_id: trip.id })
      .then((rows) => setDestinations(rows))
      .catch((err: unknown) => setDestinationsError(messageFor(err)));
  }

  useEffect(() => {
    loadDestinations();
    // Re-fetch only when the open Trip changes — `loadDestinations` closes over `trip.id`, and
    // is also called directly after adding a Destination, so it is not itself a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  async function saveFields(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateTrip(trip.id, { ...draft });
      playCue("save");
      onUpdated();
    } catch (err: unknown) {
      playCue("refuse");
      setSaveError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  async function addDestination(candidate: LocationCandidate): Promise<void> {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await createDestination({
        trip_id: trip.id,
        name: candidate.name,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      });
      playCue("save");
      loadDestinations();
      onDestinationAdded();
    } catch (err: unknown) {
      playCue("refuse");
      setAddError(messageFor(err));
    } finally {
      setAdding(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTrip(trip.id);
      playCue("delete");
      setConfirmingDelete(false);
      onDeleted();
    } catch (err: unknown) {
      playCue("refuse");
      setDeleteError(messageFor(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-1">
        <button
          type="button"
          onClick={onBack}
          className="text-ink-mid focus-ring self-start text-xs font-semibold tracking-[0.1em] uppercase"
          data-testid="trip-detail-back"
        >
          ← All trips
        </button>

        <div>
          <label className="text-ink-mid mb-1 block text-xs font-semibold uppercase">Name</label>
          <input
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            maxLength={200}
            className="border-hairline bg-surface-3 text-ink focus-ring h-11 w-full rounded-sm border px-3 text-base"
            data-testid="trip-detail-name-input"
          />
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            value={draft.start_date}
            onChange={(event) => setDraft((d) => ({ ...d, start_date: event.target.value }))}
            className="border-hairline bg-surface-3 text-ink focus-ring h-11 flex-1 rounded-sm border px-3 text-sm"
            data-testid="trip-detail-start-date-input"
          />
          <input
            type="date"
            value={draft.end_date}
            onChange={(event) => setDraft((d) => ({ ...d, end_date: event.target.value }))}
            className="border-hairline bg-surface-3 text-ink focus-ring h-11 flex-1 rounded-sm border px-3 text-sm"
            data-testid="trip-detail-end-date-input"
          />
        </div>

        <select
          value={draft.status}
          onChange={(event) => setDraft((d) => ({ ...d, status: event.target.value as TripStatus }))}
          className="border-hairline bg-surface-3 text-ink focus-ring h-11 w-full rounded-sm border px-3 text-sm uppercase"
          data-testid="trip-detail-status-select"
        >
          {TRIP_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        {saveError !== null ? (
          <p role="alert" className="text-danger-hi text-xs">
            {saveError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void saveFields()}
          disabled={saving}
          className="bg-brand font-display focus-ring-inset h-11 w-full text-sm font-semibold tracking-[0.1em] text-white uppercase disabled:opacity-50"
          data-testid="trip-save"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <div className="flex flex-col gap-2">
          <span className="text-ink-mid text-xs font-semibold tracking-[0.1em] uppercase">
            Destinations
          </span>

          {destinationsError !== null ? (
            <p role="alert" className="text-danger-hi text-xs">
              {destinationsError}
            </p>
          ) : null}

          {destinations !== null && destinations.length === 0 ? (
            <p className="text-ink-mid text-xs" data-testid="trip-destinations-empty">
              No Destinations in this trip yet.
            </p>
          ) : null}

          <ul className="flex flex-col gap-1.5">
            {(destinations ?? []).map((destination) => (
              <li
                key={destination.id}
                className="border-hairline bg-surface-2 flex items-center justify-between gap-2 rounded-sm border px-3 py-2"
                data-testid={`trip-destination-${destination.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm">{destination.name}</span>
                  {destination.outside_trip_range ? (
                    <span
                      className="text-danger-hi block text-[11px]"
                      data-testid={`trip-destination-outside-range-${destination.id}`}
                    >
                      Dates fall outside this trip&rsquo;s own range.
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-ink-lo shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase",
                  )}
                >
                  {destination.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-ink-mid text-xs font-semibold tracking-[0.1em] uppercase">
            Add a destination
          </span>
          <LocationSearch onSelect={(candidate) => void addDestination(candidate)} />
          {adding ? <p className="text-ink-mid text-xs">Adding…</p> : null}
          {addError !== null ? (
            <p role="alert" className="text-danger-hi text-xs">
              {addError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="px-4 pt-3 pb-4.5">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="border-hairline text-ink-mid focus-ring h-11 w-full rounded-sm border bg-transparent text-xs font-semibold tracking-[0.1em] uppercase"
          data-testid="trip-delete"
        >
          Delete trip
        </button>
      </div>

      {/* FR-018, matching `001`'s `DeleteConfirm` three-tap pattern — KEEP focused first, the
          destructive action lower-weight, no dismissal by clicking outside. */}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(next) => {
          if (!next) setDeleteError(null);
          setConfirmingDelete(next);
        }}
      >
        <AlertDialogContent className="bg-surface-2 gap-0 p-5" data-testid="trip-delete-confirm">
          <AlertDialogTitle className="text-ink mb-2.5 leading-tight tracking-[0.14em]">
            Delete this trip?
          </AlertDialogTitle>
          <AlertDialogDescription
            className="text-ink-mid mb-3.5 text-[13px] leading-relaxed break-words"
            data-testid="trip-delete-confirm-message"
          >
            {deleteError ?? (
              <>
                &ldquo;{trip.name}&rdquo; and every Destination in it — along with their
                photographs — will be removed permanently. There is no trash and no undo.
              </>
            )}
          </AlertDialogDescription>
          <AlertDialogFooter className="flex flex-col gap-2.5">
            <AlertDialogCancel
              autoFocus
              className="border-hairline bg-surface-3 text-ink focus-ring h-12 w-full rounded-sm border text-[13px] font-semibold tracking-[0.16em] uppercase"
              data-testid="trip-delete-keep"
            >
              Keep trip
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="border-danger-hi/50 text-danger-hi focus-ring h-12 w-full rounded-sm border bg-transparent text-[13px] font-semibold tracking-[0.16em] uppercase disabled:opacity-50"
              data-testid="trip-delete-confirm-action"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong. Try again.";
}
