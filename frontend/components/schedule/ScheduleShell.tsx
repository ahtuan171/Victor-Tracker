"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { NavDrawer } from "@/components/arcade/NavDrawer";
import type { TravelEvent, TravelEventType, Trip } from "@/lib/api";
import { isWithinDateOnly, today as readToday, type DateOnly } from "@/lib/dates";
import { useDestinations } from "@/lib/destinations";
import { periodTitle, shiftPeriod } from "@/lib/period";
import {
  buildScheduleEntries,
  filterScheduleEntries,
  upcomingEntries,
  type ScheduleEntry,
  type ScheduleFilterId,
} from "@/lib/schedule";
import { playCue } from "@/lib/sound";
import { useTravelEvents } from "@/lib/travelEvents";
import { useTrips } from "@/lib/trips";

import { DayDetailDrawer } from "./DayDetailDrawer";
import { EventFormSheet } from "./EventFormSheet";
import { NewEntryPicker } from "./NewEntryPicker";
import { ScheduleFilters } from "./ScheduleFilters";
import { ScheduleMonthGrid } from "./ScheduleMonthGrid";
import { TripFormSheet } from "./TripFormSheet";
import { TripTimeline } from "./TripTimeline";
import { UpcomingList } from "./UpcomingList";

/**
 * The Travel Schedule surface's shell — Module 02, built from
 * `Module_02_Travel_Schedule_Spec.md` rather than a ratified `spec.md` (see the owner's explicit
 * instruction recorded in this iteration's history to bypass the speckit workflow). Plays the same
 * role `MapShell`/`CalendarShell` play for their own surfaces: it owns the data load, the header,
 * and every overlay's open/closed state; each child component owns its own layout only.
 *
 * §24's target hierarchy — header, summary, calendar, filters, trip timeline, upcoming — is drawn
 * top to bottom in exactly that order, one scrollable column, matching §22's "preserve calendar
 * usability, move Trip Timeline below calendar" mobile guidance (this product ships one layout, not
 * a separate mobile redesign).
 *
 * §7.1: Month view only. §7.1 itself allows this — "keep Month/Week; do not implement Day view
 * unless the existing architecture already supports it cleanly" is about *Day*, but a Week view
 * for this data is a second grid this MVP does not build; `components/calendar/PeriodNav`'s
 * MONTH/WEEK toggle is deliberately not reused here for the same reason. Recorded as a known
 * scope reduction rather than silently dropped.
 */
export function ScheduleShell() {
  const tripsStore = useTrips();
  const eventsStore = useTravelEvents();
  const { destinations } = useDestinations();
  const today = useSyncExternalStore(subscribeToNothing, readToday, readNoToday);

  /**
   * The mascot's caption in the month-nav row (moved here from a foot-of-page "loading" line, at
   * the owner's request — that version was tied to `useTrips`/`useTravelEvents`'s real
   * `"loading"` status and a warm local backend resolves that in well under 100ms, faster than a
   * human notices a flash, so in practice it was never seen). This one is unconditional and sits
   * beside the month title, where the eye already lands to read "August 2026" — one caption picked
   * per mount, travel-flavoured rather than Claude Code's own generic verbs.
   */
  const caption = useSyncExternalStore(subscribeToNothing, readClientCaption, readServerCaption);

  const [period, setPeriod] = useState<DateOnly | null>(null);
  const [filter, setFilter] = useState<ScheduleFilterId>("all");
  const [openDay, setOpenDay] = useState<DateOnly | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [eventForm, setEventForm] = useState<{
    readonly eventType: TravelEventType;
    readonly event?: TravelEvent;
  } | null>(null);
  const [tripForm, setTripForm] = useState<{ readonly trip?: Trip } | null>(null);
  /** The day a new entry is being created for — kept after the day drawer closes, so "+ Add entry"
   * from a day pre-fills that date even though the drawer itself steps out of the way. */
  const [draftDate, setDraftDate] = useState<DateOnly | null>(null);
  /** Which side the next month slides in from — matches the arrow tapped or the swipe. */
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  /** What was just saved, so the grid and timeline can flash it. Cleared after the animation. */
  const [highlight, setHighlight] = useState<{
    readonly date: DateOnly | null;
    readonly tripId: number | null;
  } | null>(null);

  useEffect(() => {
    if (highlight === null) return;
    const timer = window.setTimeout(() => setHighlight(null), 1600);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const effectivePeriod = period ?? today;
  const onCurrentMonth =
    effectivePeriod === null || today === null || effectivePeriod.slice(0, 7) === today.slice(0, 7);

  function stepMonth(delta: -1 | 1): void {
    if (effectivePeriod === null) return;
    playCue("page");
    setDirection(delta);
    setPeriod(shiftPeriod(effectivePeriod, "month", delta));
  }

  /** Bring `date`'s month on screen, sliding from the right side. */
  function showMonthOf(date: DateOnly): void {
    if (effectivePeriod !== null && date.slice(0, 7) !== effectivePeriod.slice(0, 7)) {
      setDirection(date > effectivePeriod ? 1 : -1);
      setPeriod(date);
    }
  }

  function jumpToToday(): void {
    if (today === null) return;
    playCue("page");
    showMonthOf(today);
    setPeriod(null);
  }

  const placesCountByTrip = useMemo(() => {
    const counts = new Map<number, number>();
    for (const destination of destinations) {
      if (destination.trip_id === null) continue;
      counts.set(destination.trip_id, (counts.get(destination.trip_id) ?? 0) + 1);
    }
    return counts;
  }, [destinations]);

  const allEntries = useMemo(
    () => buildScheduleEntries(tripsStore.trips, eventsStore.events),
    [tripsStore.trips, eventsStore.events],
  );
  const filteredEntries = useMemo(
    () => filterScheduleEntries(allEntries, filter),
    [allEntries, filter],
  );
  /** The grid draws trips as bands, so only event entries go in as lines. */
  const gridEventEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.kind !== "trip"),
    [filteredEntries],
  );
  const gridTrips = filter === "all" || filter === "trips" ? tripsStore.trips : NO_TRIPS;
  const upcoming = useMemo(
    () => (today === null ? [] : upcomingEntries(filteredEntries, today)),
    [filteredEntries, today],
  );

  function reload(): void {
    tripsStore.reload();
    eventsStore.reload();
  }

  const dayEvents = eventsStore.events.filter((event) => event.event_date === openDay);
  const tripsOnOpenDay =
    openDay === null
      ? NO_TRIPS
      : tripsStore.trips.filter((trip) => isWithinDateOnly(openDay, trip.start_date, trip.end_date));

  function openDayDrawer(date: DateOnly): void {
    playCue("open");
    setOpenDay(date);
  }

  function openUpcoming(entry: ScheduleEntry): void {
    playCue("open");
    if (entry.kind === "trip") {
      const trip = tripsStore.trips.find((candidate) => candidate.id === entry.refId);
      if (trip) setTripForm({ trip });
    } else {
      const event = eventsStore.events.find((candidate) => candidate.id === entry.refId);
      if (event) setEventForm({ eventType: event.event_type, event });
    }
  }

  function tripSaved(trip: Trip): void {
    reload();
    showMonthOf(trip.start_date);
    setHighlight({ date: trip.start_date, tripId: trip.id });
  }

  function eventSaved(event: TravelEvent): void {
    reload();
    showMonthOf(event.event_date);
    setHighlight({ date: event.event_date, tripId: event.trip_id });
  }

  return (
    <div className="bg-surface-0 flex min-h-dvh flex-col" data-testid="schedule-shell">
      <header className="border-hairline flex items-center justify-between gap-2 border-b px-4 pt-4 pb-3">
        <div>
          <p className="text-ink-mid text-xs leading-none font-semibold tracking-[0.18em] uppercase">
            Travel Schedule
          </p>
          <h1
            key={effectivePeriod?.slice(0, 7) ?? ""}
            className="text-ink anim-fade-up mt-1 text-lg leading-none font-semibold tracking-[0.02em]"
          >
            {effectivePeriod === null ? "" : periodTitle(effectivePeriod, "month")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!onCurrentMonth ? (
            <button
              type="button"
              onClick={jumpToToday}
              className="border-hairline bg-surface-2 text-ink-mid focus-ring anim-pop h-11 rounded-sm border px-2.5 text-xs font-semibold tracking-[0.14em] uppercase"
              data-testid="schedule-today"
            >
              Today
            </button>
          ) : null}
          <NavDrawer />
        </div>
      </header>

      <div
        className="border-hairline text-ink-mid flex gap-4 border-b px-4 py-2.5 text-xs font-semibold tracking-[0.06em] uppercase"
        data-testid="schedule-summary"
      >
        <span>{destinations.length} places</span>
        <span>{tripsStore.trips.length} trips</span>
        <span>{eventsStore.events.length} events</span>
      </div>

      {eventsStore.status === "error" || tripsStore.status === "error" ? (
        <p className="text-danger-hi px-4 py-2 text-xs" role="alert">
          {eventsStore.error ?? tripsStore.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          disabled={effectivePeriod === null}
          aria-label="Previous month"
          className="border-hairline bg-surface-2 text-ink-mid focus-ring h-11 w-10 flex-none rounded-sm border text-base font-semibold disabled:opacity-40"
          data-testid="schedule-period-previous"
        >
          <span aria-hidden="true">‹</span>
        </button>

        {/* The mascot's caption, moved here (from a foot-of-page loading line — see `caption`'s own
            docstring) at the owner's request: this row sits directly under the month title and
            directly above the calendar, in view without scrolling on every load, unlike a line at
            the page's foot that a real load resolves too fast to notice. `min-w-0` on the wrapper
            plus `truncate` on the caption is what keeps the longest caption
            ("Counting passport stamps…") from pushing the month-nav buttons toward the screen edge
            at the 375px floor. */}
        <p
          className="text-ink-lo flex min-w-0 flex-1 items-center justify-center gap-1.5 text-xs"
          data-testid="schedule-mascot-caption"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a ~3 KB local SVG, same
              reasoning as `IntelConsole.tsx`. Decorative (`alt=""`) — the caption beside it already
              says what is happening. */}
          <img
            src="/mascot/mascot-thinking.svg"
            alt=""
            width={24}
            height={14}
            className="animate-pulse flex-none"
          />
          <span className="animate-pulse truncate">{caption}</span>
        </p>

        <button
          type="button"
          onClick={() => stepMonth(1)}
          disabled={effectivePeriod === null}
          aria-label="Next month"
          className="border-hairline bg-surface-2 text-ink-mid focus-ring h-11 w-10 flex-none rounded-sm border text-base font-semibold disabled:opacity-40"
          data-testid="schedule-period-next"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {effectivePeriod !== null ? (
        <ScheduleMonthGrid
          period={effectivePeriod}
          today={today}
          entries={gridEventEntries}
          trips={gridTrips}
          direction={direction}
          highlightDate={highlight?.date ?? null}
          onOpenDay={openDayDrawer}
          onSwipe={stepMonth}
        />
      ) : null}

      <ScheduleFilters
        active={filter}
        onChange={(next) => {
          if (next !== filter) playCue("select");
          setFilter(next);
        }}
      />

      <TripTimeline
        trips={tripsStore.trips}
        events={eventsStore.events}
        placesCountByTrip={placesCountByTrip}
        today={today}
        highlightTripId={highlight?.tripId ?? null}
        onOpenTrip={(trip) => {
          playCue("open");
          setTripForm({ trip });
        }}
      />

      <UpcomingList entries={upcoming} today={today} onOpen={openUpcoming} />

      {/* §13's CTA — floats over the bottom band, in thumb reach, matching `QuickAdd`'s own
          anchoring on the map surface. */}
      <div className="sticky bottom-3 mt-auto px-4 pt-4">
        <button
          type="button"
          onClick={() => {
            playCue("open");
            setDraftDate(null);
            setPickerOpen(true);
          }}
          className="bg-brand focus-ring h-12 w-full rounded-none text-sm font-semibold tracking-[0.16em] text-white uppercase shadow-e2"
          data-testid="schedule-cta"
        >
          + Schedule
        </button>
      </div>

      <DayDetailDrawer
        open={openDay !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDay(null);
        }}
        date={openDay}
        events={dayEvents}
        tripsOnDay={tripsOnOpenDay}
        onAddEntry={() => {
          // Step the day drawer out of the way rather than stacking three sheets on top of each
          // other; the date it was opened for carries into the new entry's form.
          playCue("open");
          setDraftDate(openDay);
          setOpenDay(null);
          setPickerOpen(true);
        }}
        onOpenEvent={(event) => {
          playCue("open");
          setOpenDay(null);
          setEventForm({ eventType: event.event_type, event });
        }}
        onOpenTrip={(trip) => {
          playCue("open");
          setOpenDay(null);
          setTripForm({ trip });
        }}
      />

      <NewEntryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPickTrip={() => {
          playCue("select");
          setPickerOpen(false);
          setTripForm({});
        }}
        onPickEventType={(eventType) => {
          playCue("select");
          setPickerOpen(false);
          setEventForm({ eventType });
        }}
      />

      {eventForm ? (
        <EventFormSheet
          open
          onOpenChange={(open) => {
            if (!open) setEventForm(null);
          }}
          eventType={eventForm.eventType}
          {...(eventForm.event ? { initialEvent: eventForm.event } : {})}
          {...(draftDate !== null ? { defaultDate: draftDate } : today !== null ? { defaultDate: today } : {})}
          trips={tripsStore.trips}
          onSaved={eventSaved}
          onDeleted={reload}
        />
      ) : null}

      {tripForm ? (
        <TripFormSheet
          open
          onOpenChange={(open) => {
            if (!open) setTripForm(null);
          }}
          {...(tripForm.trip ? { initialTrip: tripForm.trip } : {})}
          {...(draftDate !== null
            ? { defaultStartDate: draftDate }
            : today !== null
              ? { defaultStartDate: today }
              : {})}
          onSaved={tripSaved}
          onDeleted={reload}
        />
      ) : null}
    </div>
  );
}

/** The mascot's month-nav caption — one picked at random per mount, travel-flavoured rather than
 * Claude Code's own generic verbs, since this mascot has a place to be going. */
const MASCOT_CAPTIONS: readonly string[] = [
  "Charting the route…",
  "Packing the bags…",
  "Reading old maps…",
  "Counting passport stamps…",
  "Plotting the next stop…",
];

const NO_TRIPS: readonly Trip[] = [];

/**
 * Picked once per page load, on the client only. A `Math.random()` inside a `useState` initializer
 * ran on the server *and* again on the client, rendered different text, and threw React's
 * hydration-mismatch error (#418) on every visit. The server and hydration pass render the first
 * caption; the client swaps in its random pick straight after.
 */
let clientCaption: string | null = null;

function readClientCaption(): string {
  clientCaption ??= MASCOT_CAPTIONS[Math.floor(Math.random() * MASCOT_CAPTIONS.length)]!;
  return clientCaption;
}

function readServerCaption(): string {
  return MASCOT_CAPTIONS[0]!;
}

function subscribeToNothing(): () => void {
  return () => {};
}

function readNoToday(): DateOnly | null {
  return null;
}
