"use client";

import { useRef } from "react";

import type { Trip } from "@/lib/api";
import { isWithinDateOnly, type DateOnly } from "@/lib/dates";
import { periodDays, WEEKDAY_INITIALS } from "@/lib/period";
import { EVENT_TYPE_SYMBOL, groupEntriesByDate, type ScheduleEntry } from "@/lib/schedule";
import { cn } from "@/lib/utils";

/**
 * The Travel Schedule's month grid (Module 02, §7). Built from `lib/period.ts` — the same pure
 * six-week span the rest of the app uses, so grids never disagree about where a week starts.
 *
 * Trips are drawn as **bands across every day they cover**, joined edge to edge between cells,
 * with the name printed where the band starts and again at the start of each week row. Before
 * this a Trip was a single marker on its start date, so a week-long trip read as a one-day entry.
 * Events stay as compact symbol-plus-title lines under the bands.
 *
 * Swiping horizontally over the grid changes month; `direction` picks which side the new month
 * slides in from so the motion matches the gesture.
 */
export function ScheduleMonthGrid({
  period,
  today,
  entries,
  trips,
  direction,
  highlightDate,
  onOpenDay,
  onSwipe,
}: {
  readonly period: DateOnly;
  readonly today: DateOnly | null;
  /** Event entries only — trips arrive separately as `trips` and are drawn as bands. */
  readonly entries: readonly ScheduleEntry[];
  readonly trips: readonly Trip[];
  readonly direction: -1 | 0 | 1;
  readonly highlightDate: DateOnly | null;
  readonly onOpenDay: (date: DateOnly) => void;
  readonly onSwipe: (delta: -1 | 1) => void;
}) {
  const byDay = groupEntriesByDate(entries);
  const days = periodDays(period, "month");
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <section
      aria-label="Month"
      data-testid="schedule-month-grid"
      // `flex-none`: the shell is a flex column, and `overflow-hidden` would otherwise let the
      // browser shrink this grid to a couple of rows when the page is taller than the viewport.
      className="flex-none touch-pan-y overflow-hidden"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      <div
        className="border-hairline/60 bg-surface-0 grid grid-cols-7 border-y"
        aria-hidden="true"
      >
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span
            key={index}
            className={cn(
              "text-center text-xs leading-6 font-semibold tracking-[0.1em]",
              index >= 5 ? "text-brand-hi" : "text-ink-lo",
            )}
          >
            {initial}
          </span>
        ))}
      </div>

      <div
        key={period.slice(0, 7)}
        className={cn(
          "grid grid-cols-7",
          direction === 1 && "anim-slide-next",
          direction === -1 && "anim-slide-prev",
        )}
      >
        {days.map((day, index) => (
          <ScheduleDayCell
            key={day.date}
            date={day.date}
            dayNumber={day.dayOfMonth}
            inPeriod={day.inPeriod}
            isToday={today !== null && day.date === today}
            isPast={today !== null && day.date < today}
            weekStart={index % 7 === 0}
            weekEnd={index % 7 === 6}
            highlighted={highlightDate === day.date}
            entries={byDay.get(day.date) ?? EMPTY}
            trips={trips.filter((trip) => isWithinDateOnly(day.date, trip.start_date, trip.end_date))}
            onOpen={onOpenDay}
          />
        ))}
      </div>
    </section>
  );
}

function ScheduleDayCell({
  date,
  dayNumber,
  inPeriod,
  isToday,
  isPast,
  weekStart,
  weekEnd,
  highlighted,
  entries,
  trips,
  onOpen,
}: {
  readonly date: DateOnly;
  readonly dayNumber: number;
  readonly inPeriod: boolean;
  readonly isToday: boolean;
  readonly isPast: boolean;
  readonly weekStart: boolean;
  readonly weekEnd: boolean;
  readonly highlighted: boolean;
  readonly entries: readonly ScheduleEntry[];
  readonly trips: readonly Trip[];
  readonly onOpen: (date: DateOnly) => void;
}) {
  // Two lines of content fit a 68px cell beyond the day number; bands and events share them.
  const visibleTrips = trips.slice(0, 2);
  const eventSlots = Math.max(0, 2 - visibleTrips.length);
  const visibleEvents = entries.slice(0, eventSlots);
  const hidden = trips.length - visibleTrips.length + entries.length - visibleEvents.length;
  const label = `${date}${trips.length + entries.length > 0 ? `, ${trips.length + entries.length} entries` : ""}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(date)}
      aria-label={label}
      className={cn(
        "border-hairline/60 focus-ring hover:bg-surface-2 relative flex min-h-[68px] flex-col gap-[3px] border-r border-b px-[3px] pt-[18px] pb-[3px] text-left last:border-r-0",
        inPeriod ? "bg-surface-1" : "bg-surface-0",
        highlighted && "anim-flash",
      )}
      data-date={date}
      data-in-period={inPeriod ? "" : undefined}
      data-testid="schedule-day-cell"
    >
      <span
        className={cn(
          "absolute top-[3px] right-[3px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-xs leading-none font-semibold",
          isToday
            ? "bg-brand text-white"
            : inPeriod
              ? isPast
                ? "text-ink-lo"
                : "text-ink-mid"
              : "text-ink-lo/50",
        )}
        aria-hidden="true"
      >
        {dayNumber}
      </span>

      {visibleTrips.map((trip) => {
        const starts = trip.start_date === date;
        const ends = trip.end_date === date;
        const showLabel = starts || weekStart;
        return (
          <span
            key={`trip-${trip.id}`}
            className={cn(
              "bg-brand/30 text-ink block h-[15px] truncate text-xs leading-[15px] font-semibold",
              starts ? "border-brand ml-0 rounded-l-sm border-l-2 pl-[3px]" : "-ml-[4px] pl-[4px]",
              ends ? "mr-0 rounded-r-sm" : weekEnd ? "mr-0" : "-mr-[4px]",
              !inPeriod && "opacity-50",
            )}
            aria-hidden="true"
            data-testid="schedule-trip-band"
          >
            {showLabel ? (trip.destination ?? trip.name) : " "}
          </span>
        );
      })}

      {visibleEvents.map((entry) => (
        <span
          key={`${entry.kind}-${entry.refId}`}
          className={cn(
            "flex items-center gap-1 truncate text-xs leading-tight",
            inPeriod ? "text-ink-mid" : "text-ink-lo/60",
          )}
        >
          <span aria-hidden="true">{entry.kind === "trip" ? "◆" : EVENT_TYPE_SYMBOL[entry.kind]}</span>
          <span className="truncate">{entry.title}</span>
        </span>
      ))}

      {hidden > 0 ? (
        <span className="text-ink-lo text-xs leading-none font-semibold" data-testid="schedule-day-overflow">
          +{hidden} more
        </span>
      ) : null}
    </button>
  );
}

const EMPTY: readonly ScheduleEntry[] = [];
