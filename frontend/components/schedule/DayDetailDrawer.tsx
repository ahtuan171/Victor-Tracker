"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { TravelEvent, Trip } from "@/lib/api";
import { daysBetween, type DateOnly } from "@/lib/dates";
import { formatDateOnlyLong } from "@/lib/period";
import { EVENT_TYPE_LABEL, EVENT_TYPE_SYMBOL, TRIP_SYMBOL } from "@/lib/schedule";

/**
 * §12's Day Detail panel: every Trip this day falls inside (with where in the trip it sits), then
 * the day's events in time order. Both are tappable — a Trip opens its edit form, an event its own.
 */
export function DayDetailDrawer({
  open,
  onOpenChange,
  date,
  events,
  tripsOnDay,
  onAddEntry,
  onOpenEvent,
  onOpenTrip,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly date: DateOnly | null;
  readonly events: readonly TravelEvent[];
  readonly tripsOnDay: readonly Trip[];
  readonly onAddEntry: () => void;
  readonly onOpenEvent: (event: TravelEvent) => void;
  readonly onOpenTrip: (trip: Trip) => void;
}) {
  // Untimed entries first ("sometime that day"), then by time.
  const sorted = [...events].sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const empty = sorted.length === 0 && tripsOnDay.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="bg-surface-1 border-hairline flex max-h-[85dvh] flex-col gap-0 p-0 shadow-e2"
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <span className="bg-ink-lo/50 h-[3px] w-[34px] rounded-sm" aria-hidden="true" />
          <SheetTitle className="text-ink pr-8 text-base leading-tight tracking-[0.1em]" data-testid="day-detail-title">
            {date === null ? "" : formatDateOnlyLong(date)}
          </SheetTitle>
        </div>

        <div className="flex-1 overflow-y-auto px-4" data-testid="day-detail-list">
          {date !== null
            ? tripsOnDay.map((trip, index) => {
                const total = daysBetween(trip.start_date, trip.end_date) + 1;
                const dayNumber = daysBetween(trip.start_date, date) + 1;
                return (
                  <button
                    key={`trip-${trip.id}`}
                    type="button"
                    onClick={() => onOpenTrip(trip)}
                    className="border-hairline focus-ring-inset hover:bg-surface-2 anim-fade-up flex w-full items-center gap-3 border-t py-2.5 text-left"
                    style={{ animationDelay: `${index * 40}ms` }}
                    data-testid={`day-detail-trip-${trip.id}`}
                  >
                    <span aria-hidden="true" className="text-brand-hi w-12 flex-none text-center">
                      {TRIP_SYMBOL}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate text-sm font-semibold">
                        {trip.destination ?? trip.name}
                      </span>
                      <span className="text-ink-mid block text-xs">
                        {dayNumber === 1
                          ? "Trip begins"
                          : dayNumber === total
                            ? "Last day"
                            : `Day ${dayNumber} of ${total}`}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-ink-lo text-sm">
                      ›
                    </span>
                  </button>
                );
              })
            : null}

          {empty ? (
            <div className="anim-fade-up py-8 text-center" data-testid="day-detail-empty">
              {/* eslint-disable-next-line @next/next/no-img-element -- a ~3 KB local SVG. */}
              <img src="/mascot/mascot-coffee.svg" alt="" width={72} height={41} className="mx-auto mb-2" />
              <p className="text-ink text-sm font-semibold">A free day</p>
              <p className="text-ink-mid mt-1 text-xs">Nothing planned yet.</p>
            </div>
          ) : (
            sorted.map((event, index) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenEvent(event)}
                className="border-hairline focus-ring-inset hover:bg-surface-2 anim-fade-up flex w-full items-center gap-3 border-t py-2.5 text-left"
                style={{ animationDelay: `${(tripsOnDay.length + index) * 40}ms` }}
                data-testid={`day-detail-event-${event.id}`}
              >
                <span className="text-ink-mid w-12 flex-none text-center text-xs font-semibold">
                  {event.start_time ? event.start_time.slice(0, 5) : "—"}
                </span>
                <span aria-hidden="true" className="text-ink-mid flex-none">
                  {EVENT_TYPE_SYMBOL[event.event_type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm">{event.title}</span>
                  <span className="text-ink-lo block truncate text-xs">
                    {event.event_type === "transport" && (event.from_location || event.to_location)
                      ? `${event.from_location ?? "?"} → ${event.to_location ?? "?"}`
                      : (event.location ?? EVENT_TYPE_LABEL[event.event_type])}
                  </span>
                </span>
                <span aria-hidden="true" className="text-ink-lo text-sm">
                  ›
                </span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 pt-3 pb-4.5">
          <button
            type="button"
            onClick={onAddEntry}
            className="bg-brand focus-ring h-12 w-full rounded-none text-sm font-semibold tracking-[0.16em] text-white uppercase shadow-e1"
            data-testid="day-detail-add-entry"
          >
            + Add entry
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
