"use client";

import type { LogEntry } from "@/lib/log";
import { pinTreatment } from "@/lib/map";

interface TravelLogCardProps {
  readonly entry: LogEntry;
  readonly onSelect: (id: number) => void;
}

export function TravelLogCard({ entry, onSelect }: TravelLogCardProps) {
  const treatment = pinTreatment(entry.status);
  const { destination, tripName, formattedDateRange } = entry;

  return (
    <button
      type="button"
      onClick={() => onSelect(destination.id)}
      data-testid={`travel-log-card-${destination.id}`}
      className="w-full text-left min-h-[44px] p-3 rounded-lg border border-border bg-card hover:bg-accent/10 focus-ring transition-colors flex items-start justify-between gap-3"
      aria-label={`Open details for ${destination.name}, status ${treatment.label}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${treatment.borderClass} ${treatment.textClass} border`}
            data-testid={`log-status-cue-${destination.id}`}
          >
            <span>{treatment.label}</span>
          </span>
          {tripName && (
            <span className="text-xs text-muted-foreground truncate" data-testid={`log-trip-${destination.id}`}>
              · {tripName}
            </span>
          )}
        </div>
        <h3 className="font-bold text-base text-foreground truncate" data-testid={`log-name-${destination.id}`}>
          {destination.name}
        </h3>
        {formattedDateRange && (
          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`log-date-${destination.id}`}>
            {formattedDateRange}
          </p>
        )}
      </div>
    </button>
  );
}
