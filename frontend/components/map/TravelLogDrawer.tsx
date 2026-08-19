"use client";

import { useMemo, useState } from "react";
import type { Destination, DestinationStatus, Trip } from "@/lib/api";
import { filterLogEntries, sortDestinationsForLog } from "@/lib/log";
import { TravelLogCard } from "./TravelLogCard";

export type LogStatusFilter = "all" | DestinationStatus;

interface TravelLogDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly destinations: readonly Destination[];
  readonly trips: readonly Trip[];
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
  onSelectDestination,
}: TravelLogDrawerProps) {
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>("all");

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
        aria-label="Close travel log"
      />

      <div className="w-full max-h-[85dvh] bg-background border-t border-border rounded-t-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>Travel Log</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground" data-testid="log-count">
                {filteredEntries.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chronological timeline of your travel memory
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="travel-log-close-btn"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring rounded-lg"
            aria-label="Close Travel Log"
          >
            ✕
          </button>
        </div>

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
      </div>
    </div>
  );
}
