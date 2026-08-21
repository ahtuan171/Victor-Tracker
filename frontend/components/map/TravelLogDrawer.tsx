"use client";

import { useMemo, useState } from "react";
import type { Destination, DestinationStatus, Trip } from "@/lib/api";
import type { DateOnly } from "@/lib/dates";
import { filterLogEntries, sortDestinationsForLog } from "@/lib/log";
import { TravelLogCard } from "./TravelLogCard";
import { TravelCalendarGrid } from "./TravelCalendarGrid";

export type LogStatusFilter = "all" | DestinationStatus;

/** The two ways to browse the same loaded Destinations — by recency, or placed on a calendar. */
type ViewMode = "list" | "calendar";

interface TravelLogDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly destinations: readonly Destination[];
  readonly trips: readonly Trip[];
  /** Null until the browser's clock is read — passed through to `TravelCalendarGrid`. */
  readonly today: DateOnly | null;
  readonly onSelectDestination: (id: number) => void;
}

const FILTER_OPTIONS: ReadonlyArray<{ readonly id: LogStatusFilter; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "visited", label: "Visited" },
  { id: "planned", label: "Planned" },
  { id: "wishlist", label: "Wishlist" },
];

export function TravelLogDrawer({
  isOpen,
  onClose,
  destinations,
  trips,
  today,
  onSelectDestination,
}: TravelLogDrawerProps) {
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const allLogEntries = useMemo(() => {
    return sortDestinationsForLog(destinations, trips);
  }, [destinations, trips]);

  const filteredEntries = useMemo(() => {
    return filterLogEntries(allLogEntries, statusFilter);
  }, [allLogEntries, statusFilter]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      aria-modal="true"
      role="dialog"
      data-testid="travel-log-drawer"
    >
      {/* Backdrop tap dismiss */}
      <button
        type="button"
        className="fixed inset-0 -z-10 w-full h-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close travel collection"
      />

      <div className="w-full max-h-[85dvh] bg-background border-t border-border rounded-t-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>Travel Collection</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground" data-testid="log-count">
                {filteredEntries.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chronological collection of your travel memory
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="travel-log-close-btn"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring rounded-lg"
            aria-label="Close Travel Collection"
          >
            ✕
          </button>
        </div>

        {/* View mode: by recency (the original Travel Log) or placed on a calendar
            (`TravelCalendarGrid`) — two presentations of the same loaded Destinations, so this
            costs no header space on `MapShell` the way a fourth trigger button there would have. */}
        <div className="border-b border-border p-3 shrink-0" data-testid="travel-log-view-toggle" role="radiogroup" aria-label="View">
          <div className="border-hairline flex overflow-hidden rounded-sm border">
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "list"}
              onClick={() => setViewMode("list")}
              data-testid="log-view-list"
              className={`focus-ring-inset h-11 flex-1 text-xs font-semibold tracking-[0.1em] uppercase ${
                viewMode === "list" ? "bg-brand text-white" : "bg-surface-2 text-ink-mid"
              }`}
            >
              List
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "calendar"}
              onClick={() => setViewMode("calendar")}
              data-testid="log-view-calendar"
              className={`focus-ring-inset h-11 flex-1 text-xs font-semibold tracking-[0.1em] uppercase ${
                viewMode === "calendar" ? "bg-brand text-white" : "bg-surface-2 text-ink-mid"
              }`}
            >
              Calendar
            </button>
          </div>
        </div>

        {viewMode === "calendar" ? (
          <div className="overflow-y-auto flex-1">
            <TravelCalendarGrid
              destinations={destinations}
              today={today}
              onSelectDestination={(id) => {
                onSelectDestination(id);
                onClose();
              }}
            />
          </div>
        ) : (
          <>
            {/* Status Filter Row */}
            <div className="p-3 border-b border-border flex items-center gap-2 overflow-x-auto shrink-0" data-testid="travel-log-filter-row">
              {FILTER_OPTIONS.map((opt) => {
                const isActive = statusFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStatusFilter(opt.id)}
                    data-testid={`log-filter-${opt.id}`}
                    className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors shrink-0 ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/50 text-secondary-foreground hover:bg-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Timeline Content List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3" data-testid="travel-log-list">
              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground" data-testid="travel-log-empty">
                  <p className="font-semibold text-sm">No places logged yet</p>
                  <p className="text-xs mt-1">
                    {statusFilter === "all"
                      ? "Mark places on the map to build your timeline."
                      : `No ${statusFilter} places found in your travel memory.`}
                  </p>
                </div>
              ) : (
                filteredEntries.map((entry) => (
                  <TravelLogCard
                    key={entry.destination.id}
                    entry={entry}
                    onSelect={(id) => {
                      onSelectDestination(id);
                      onClose();
                    }}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
