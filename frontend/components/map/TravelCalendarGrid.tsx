"use client";

import { useState } from "react";

import type { Destination } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { pinTreatment } from "@/lib/map";
import { periodDays, periodTitle, shiftPeriod, WEEKDAY_INITIALS } from "@/lib/period";
import { destinationsOnDay } from "@/lib/travelCalendar";
import { cn } from "@/lib/utils";

/**
 * A month view of the same Destinations the map and the Collection list already draw, placed by
 * `start_date`/`end_date` rather than listed chronologically — a third presentation of loaded
 * state (map: by place, the list: by recency, this: by when). Embedded inside
 * `TravelLogDrawer.tsx` as the drawer's second view mode rather than its own header trigger and
 * `Sheet` — a fourth header button overflowed the 375px floor (the header's own text buttons
 * already fill it: `Collection`, `Trips`, `[ + ] Menu`), and a mode toggle inside a surface that
 * already browses the same data costs no header space at all.
 *
 * Reuses Content Calendar's own `lib/period.ts` (month span, navigation, title) rather than
 * reinventing calendar-boundary math a second time — that module already carries the DST/New-Year
 * edge cases in `tests/client/period.spec.ts`. Reuses `lib/map.ts`'s pin encoding
 * (`pinTreatment`) for each day's status marker, so a dot here, a pin on the map and a card in the
 * strip all agree about what a status looks like — shape and fill, never colour alone
 * (`.claude/rules/design.md`).
 *
 * A Destination with no `start_date` (most of Wishlist) has nowhere on a calendar to live and is
 * simply absent here — its home is the map and the list view, not this one.
 */
export function TravelCalendarGrid({
  destinations,
  today,
  onSelectDestination,
}: {
  readonly destinations: readonly Destination[];
  /** Null until the browser's clock is read — same contract as `MapView`/`DestinationSheet`. */
  readonly today: DateOnly | null;
  readonly onSelectDestination: (id: number) => void;
}) {
  /** Null until the owner navigates — `period = anchor ?? today`, the exact pattern
   * `CalendarShell` established for the same reason: no effect is needed to synchronise state
   * against a clock the first render does not have (`frontend/AGENTS.md`). */
  const [anchor, setAnchor] = useState<DateOnly | null>(null);
  const [selectedDay, setSelectedDay] = useState<DateOnly | null>(null);
  const period = anchor ?? today;

  if (period === null) {
    return <p className="text-ink-lo px-4 py-6 text-sm">Loading…</p>;
  }

  const days = periodDays(period, "month");
  const dayEntries = selectedDay === null ? [] : destinationsOnDay(destinations, selectedDay);

  return (
    <div className="flex flex-col px-4 py-3" data-testid="travel-calendar">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setAnchor(shiftPeriod(period, "month", -1));
            setSelectedDay(null);
          }}
          className="text-ink-mid focus-ring flex h-11 w-11 items-center justify-center text-lg"
          data-testid="travel-calendar-prev"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span
          className="font-display text-sm font-semibold tracking-wide uppercase"
          data-testid="travel-calendar-title"
        >
          {periodTitle(period, "month")}
        </span>
        <button
          type="button"
          onClick={() => {
            setAnchor(shiftPeriod(period, "month", 1));
            setSelectedDay(null);
          }}
          className="text-ink-mid focus-ring flex h-11 w-11 items-center justify-center text-lg"
          data-testid="travel-calendar-next"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" data-testid="travel-calendar-grid">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={index} className="text-ink-lo pb-1 text-[10px] font-semibold uppercase">
            {initial}
          </span>
        ))}
        {days.map((day) => {
          const entries = destinationsOnDay(destinations, day.date);
          const statuses = [...new Set(entries.map((destination) => destination.status))];
          const isToday = today !== null && day.date === today;
          const isSelected = selectedDay === day.date;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDay(day.date)}
              disabled={entries.length === 0}
              data-testid={`travel-calendar-day-${day.date}`}
              data-has-entries={entries.length > 0 ? "" : undefined}
              className={cn(
                "focus-ring flex h-11 flex-col items-center justify-center gap-0.5 rounded-sm border text-[11px] leading-none disabled:cursor-default",
                day.inPeriod ? "text-ink" : "text-ink-lo/50",
                isSelected ? "border-brand bg-surface-2" : isToday ? "border-hairline" : "border-transparent",
              )}
            >
              <span>{day.dayOfMonth}</span>
              {statuses.length > 0 ? (
                <span className="flex gap-0.5" aria-hidden="true">
                  {statuses.map((status) => (
                    <span
                      key={status}
                      className={cn(
                        "size-1.5 rotate-45 border",
                        pinTreatment(status).borderClass,
                        pinTreatment(status).fillClass,
                      )}
                    />
                  ))}
                </span>
              ) : (
                <span className="size-1.5" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay !== null ? (
        <div className="border-hairline mt-3 border-t pt-3" data-testid="travel-calendar-day-list">
          <p className="text-ink-lo mb-2 text-[11px] font-semibold tracking-[0.1em] uppercase">{selectedDay}</p>
          <ul className="flex flex-col gap-1.5">
            {dayEntries.map((destination) => {
              const treatment = pinTreatment(destination.status);
              return (
                <li key={destination.id}>
                  <button
                    type="button"
                    onClick={() => onSelectDestination(destination.id)}
                    data-testid={`travel-calendar-entry-${destination.id}`}
                    className="border-hairline bg-surface-2 focus-ring flex h-11 w-full items-center gap-2 rounded-sm border px-2.5 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-block size-2.5 shrink-0 rotate-45 border",
                        treatment.borderClass,
                        treatment.fill === "solid" && treatment.fillClass,
                        treatment.fill === "half" && "bg-linear-to-b from-transparent to-current",
                        treatment.textClass,
                      )}
                    />
                    <span className="text-ink truncate text-[13px] font-semibold">{destination.name}</span>
                    <span className="text-ink-lo ml-auto shrink-0 text-[10px] uppercase">{treatment.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
