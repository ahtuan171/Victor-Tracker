"use client";

import { useState } from "react";

import { DateInput } from "@/components/ui/date-input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, createTrip, deleteTrip, updateTrip, type Trip } from "@/lib/api";
import { addDaysDateOnly, daysBetween, type DateOnly } from "@/lib/dates";
import { playCue } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Quick trip lengths, in calendar days — one tap sets the end date from the start date. */
const LENGTH_PRESETS: ReadonlyArray<{ readonly label: string; readonly days: number }> = [
  { label: "Day trip", days: 1 },
  { label: "Weekend", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

/** §14.1's Trip form: name, destination, start/end date, notes — one instance for both create
 * (`initialTrip` absent) and edit (`initialTrip` present), the same split `EventFormSheet` draws. */
export function TripFormSheet({
  open,
  onOpenChange,
  initialTrip,
  defaultStartDate,
  onSaved,
  onDeleted,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialTrip?: Trip;
  readonly defaultStartDate?: DateOnly;
  readonly onSaved: (trip: Trip) => void;
  readonly onDeleted?: () => void;
}) {
  const [name, setName] = useState(initialTrip?.name ?? "");
  const [destination, setDestination] = useState(initialTrip?.destination ?? "");
  const [startDate, setStartDate] = useState(initialTrip?.start_date ?? defaultStartDate ?? "");
  const [endDate, setEndDate] = useState(initialTrip?.end_date ?? defaultStartDate ?? "");
  const [notes, setNotes] = useState(initialTrip?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** Bumped on every refusal so the shake animation replays even for the same message. */
  const [shakeKey, setShakeKey] = useState(0);

  const trimmedName = name.trim();
  const datesSet = startDate !== "" && endDate !== "";
  const rangeValid = datesSet && startDate <= endDate;
  const valid = trimmedName !== "" && rangeValid;
  const nights = rangeValid ? daysBetween(startDate, endDate) : null;

  /**
   * Moving the start carries the end with it, keeping the trip's length — otherwise pushing a
   * trip a week later left the end date behind the start and Save silently greyed out.
   */
  function changeStart(next: DateOnly): void {
    if (next === "") {
      setStartDate("");
      return;
    }
    if (startDate !== "" && endDate !== "" && startDate <= endDate) {
      setEndDate(addDaysDateOnly(next, daysBetween(startDate, endDate)));
    } else if (endDate === "" || endDate < next) {
      setEndDate(next);
    }
    setStartDate(next);
  }

  function applyPreset(days: number): void {
    if (startDate === "") return;
    playCue("select");
    setEndDate(addDaysDateOnly(startDate, days - 1));
  }

  function refuse(message: string): void {
    playCue("refuse");
    setError(message);
    setShakeKey((key) => key + 1);
  }

  async function save(): Promise<void> {
    if (saving) return;
    if (trimmedName === "") return refuse("Give the trip a name.");
    if (!datesSet) return refuse("Pick a start and an end date.");
    if (!rangeValid) return refuse("The trip has to end on or after the day it starts.");

    setSaving(true);
    setError(null);

    const body = {
      name: trimmedName,
      destination: destination.trim() === "" ? null : destination.trim(),
      start_date: startDate,
      end_date: endDate,
      notes: notes.trim() === "" ? null : notes.trim(),
    };

    try {
      const saved = initialTrip ? await updateTrip(initialTrip.id, body) : await createTrip(body);
      playCue(initialTrip ? "save" : "success");
      onOpenChange(false);
      onSaved(saved);
    } catch (caught) {
      refuse(caught instanceof ApiError ? caught.detail : "Could not save that trip. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!initialTrip || saving) return;
    if (!confirmingDelete) {
      playCue("tap");
      setConfirmingDelete(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteTrip(initialTrip.id);
      playCue("delete");
      onOpenChange(false);
      onDeleted?.();
    } catch (caught) {
      refuse(caught instanceof ApiError ? caught.detail : "Could not delete that trip. Try again.");
      setSaving(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="bg-surface-1 border-hairline max-h-[88dvh] gap-0 overflow-y-auto p-0 shadow-e2"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <span className="bg-ink-lo/50 h-[3px] w-[34px] rounded-sm" aria-hidden="true" />
            <SheetTitle className="text-ink leading-none tracking-[0.18em]">
              ◆ {initialTrip ? "Edit" : "New"} trip
            </SheetTitle>
          </div>

          <div className="flex flex-col gap-3 px-4 pt-3.5">
            <label className="block">
              <FieldLabel>Trip name</FieldLabel>
              <input
                autoFocus={!initialTrip}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                placeholder="Summer Getaway"
                enterKeyHint="next"
                className="border-hairline bg-surface-3 text-ink placeholder:text-ink-lo focus-ring h-12 w-full rounded-sm border px-3 text-base"
                data-testid="trip-form-name"
              />
            </label>

            <label className="block">
              <FieldLabel>Destination</FieldLabel>
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                maxLength={200}
                placeholder="Tokyo, Japan"
                className="border-hairline bg-surface-3 text-ink placeholder:text-ink-lo focus-ring h-12 w-full rounded-sm border px-3 text-base"
                data-testid="trip-form-destination"
              />
            </label>

            <div className="flex gap-3">
              <label className="block min-w-0 flex-1">
                <FieldLabel>Start date</FieldLabel>
                <DateInput
                  value={startDate}
                  onChange={(event) => changeStart(event.target.value)}
                  data-testid="trip-form-start-date"
                />
              </label>
              <label className="block min-w-0 flex-1">
                <FieldLabel>End date</FieldLabel>
                <DateInput
                  value={endDate}
                  {...(startDate !== "" ? { min: startDate } : {})}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-invalid={datesSet && !rangeValid}
                  className={cn(datesSet && !rangeValid && "border-danger")}
                  data-testid="trip-form-end-date"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {LENGTH_PRESETS.map((preset) => {
                const active = nights !== null && nights + 1 === preset.days;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset.days)}
                    disabled={startDate === ""}
                    aria-pressed={active}
                    className={cn(
                      "focus-ring h-8 rounded-sm border px-2.5 text-xs font-semibold tracking-[0.08em] uppercase disabled:opacity-40",
                      active
                        ? "bg-brand border-brand text-white"
                        : "border-hairline bg-surface-2 text-ink-mid",
                    )}
                    data-testid={`trip-form-length-${preset.days}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <span
                className={cn(
                  "ml-auto text-xs font-semibold",
                  datesSet && !rangeValid ? "text-danger-hi" : "text-ink-mid",
                )}
                aria-live="polite"
                data-testid="trip-form-length-summary"
              >
                {nights === null
                  ? datesSet
                    ? "Ends before it starts"
                    : ""
                  : describeLength(nights)}
              </span>
            </div>

            <label className="block">
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Optional"
                className="border-hairline bg-surface-3 text-ink placeholder:text-ink-lo focus-ring w-full resize-none rounded-sm border px-3 py-2 text-base"
                data-testid="trip-form-notes"
              />
            </label>

            <SheetDescription
              key={shakeKey}
              role={error !== null ? "alert" : undefined}
              className={
                error !== null ? "text-danger-hi anim-shake text-xs leading-relaxed" : "sr-only"
              }
            >
              {error ?? ""}
            </SheetDescription>
          </div>

          <div className="flex gap-2.5 px-4 pt-4 pb-4.5">
            {initialTrip ? (
              <button
                type="button"
                onClick={() => void remove()}
                onBlur={() => setConfirmingDelete(false)}
                disabled={saving}
                className={cn(
                  "focus-ring h-12 flex-none rounded-sm border px-4.5 text-xs font-semibold tracking-[0.16em] uppercase disabled:opacity-50",
                  confirmingDelete
                    ? "bg-danger border-danger text-white"
                    : "border-hairline text-danger-hi",
                )}
                data-testid="trip-form-delete"
              >
                {confirmingDelete ? "Tap to confirm" : "Delete"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  playCue("close");
                  onOpenChange(false);
                }}
                className="border-hairline text-ink-mid focus-ring h-12 flex-none rounded-sm border px-4.5 text-xs font-semibold tracking-[0.16em] uppercase"
                data-testid="trip-form-cancel"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              aria-disabled={!valid}
              className={cn(
                "bg-brand focus-ring h-12 flex-1 rounded-none text-sm font-semibold tracking-[0.16em] text-white uppercase shadow-e1 disabled:opacity-50",
                !valid && "opacity-60",
              )}
              data-testid="trip-form-save"
            >
              {saving ? "Saving…" : initialTrip ? "Save" : "Create trip"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FieldLabel({ children }: { readonly children: string }) {
  return (
    <span className="text-ink-mid mb-1.5 block text-xs leading-none font-semibold tracking-[0.16em] uppercase">
      {children}
    </span>
  );
}

function describeLength(nights: number): string {
  if (nights === 0) return "Day trip";
  const days = nights + 1;
  return `${days} days · ${nights} ${nights === 1 ? "night" : "nights"}`;
}
