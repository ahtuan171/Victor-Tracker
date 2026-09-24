"use client";

import { daysBetween, type DateOnly } from "@/lib/dates";
import { formatDateOnlyShort } from "@/lib/period";
import { EVENT_TYPE_SYMBOL, TRIP_SYMBOL, type ScheduleEntry } from "@/lib/schedule";

/**
 * §11's Upcoming section: a compact chronological list below the Trip Timeline. §11 also asks a
 * useful empty state rather than invented placeholder data — met here by rendering nothing but the
 * empty state itself when `entries` is empty.
 */
export function UpcomingList({
  entries,
  today,
  onOpen,
}: {
  readonly entries: readonly ScheduleEntry[];
  readonly today: DateOnly | null;
  readonly onOpen: (entry: ScheduleEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <section aria-label="Upcoming" className="px-4 py-6 text-center" data-testid="upcoming-empty">
        {/* eslint-disable-next-line @next/next/no-img-element -- a ~3 KB local SVG, same reasoning
            as `IntelConsole.tsx`. Decorative (`alt=""`) — nothing scheduled yet, so the mascot
            naps rather than the section saying so twice. */}
        <img
          src="/mascot/mascot-asleep.svg"
          alt=""
          width={88}
          height={50}
          className="mx-auto mb-2"
        />
        <p className="text-ink text-sm font-semibold">No upcoming travel events</p>
      </section>
    );
  }

  return (
    <section aria-label="Upcoming" className="flex flex-col pb-4" data-testid="upcoming-list">
      <h2 className="text-ink-mid px-4 pt-4 pb-2 text-xs leading-none font-semibold tracking-[0.18em] uppercase">
        Upcoming
      </h2>
      <ul className="flex flex-col">
        {entries.map((entry, index) => (
          <li key={`${entry.kind}-${entry.refId}`} className="border-hairline border-t">
            <button
              type="button"
              onClick={() => onOpen(entry)}
              className="focus-ring-inset hover:bg-surface-2 anim-fade-up flex w-full items-center gap-3 px-4 py-2.5 text-left"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <span className="text-ink-lo w-12 flex-none text-xs font-semibold tracking-[0.04em]">
                {formatDateOnlyShort(entry.date)}
              </span>
              <span aria-hidden="true" className="text-ink-mid flex-none">
                {entry.kind === "trip" ? TRIP_SYMBOL : EVENT_TYPE_SYMBOL[entry.kind]}
              </span>
              <span className="text-ink min-w-0 flex-1 truncate text-sm">{entry.title}</span>
              {today !== null ? (
                <span className="text-ink-lo flex-none text-xs">{relativeDay(today, entry.date)}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function relativeDay(today: DateOnly, date: DateOnly): string {
  const days = daysBetween(today, date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.round(days / 7)} wks`;
}
