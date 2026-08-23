"use client";

import { useId, useState } from "react";

import { ApiError, searchLocations, type LocationCandidate } from "@/lib/api";

/**
 * A place-name search resolving to real coordinates (T041, FR-011, FR-012, User Story 3
 * scenario 2/3).
 *
 * Explicit search-on-submit, not search-as-you-type: Nominatim's usage policy is roughly one
 * request per second (`app/services/geocoding.py`), and a debounce is still a request per pause
 * rather than per deliberate search. A button costs one extra tap and removes the whole question.
 *
 * **Two distinct empty outcomes, never collapsed into one "nothing found" message** (FR-012,
 * `design/003-travel-map/BRIEF.md`'s `LocationSearch` row): zero candidates is a normal 200 with
 * an empty array; an unreachable Nominatim is the contract's 502, thrown as an `ApiError` here.
 * The first says "try a different search"; the second says "try again" — a search-string problem
 * versus a transport problem, and conflating them tells the owner the wrong thing to fix.
 */
export function LocationSearch({
  onSelect,
  testIdPrefix = "location-search",
}: {
  /** Called with the candidate the owner picked. Does not itself create a Destination — the
   * caller decides what a selection means (T042: `POST /destinations` with a Trip attached). */
  readonly onSelect: (candidate: LocationCandidate) => void;
  /**
   * Namespaces this instance's `data-testid`s. Added at T049, when `QuickAdd` became the second
   * caller and both it and `TripPanel` could be mounted at once — two instances sharing one set
   * of testids is a Playwright strict-mode failure, and the surfaces are genuinely different
   * places to a person. The default keeps `TripPanel`'s own selectors as they were.
   */
  readonly testIdPrefix?: string;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "results" | "empty" | "error">(
    "idle",
  );
  const [results, setResults] = useState<readonly LocationCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(): Promise<void> {
    const trimmed = query.trim();
    if (trimmed === "" || status === "searching") return;

    setStatus("searching");
    setError(null);
    try {
      const candidates = await searchLocations(trimmed);
      setResults(candidates);
      setStatus(candidates.length === 0 ? "empty" : "results");
    } catch (err: unknown) {
      setResults([]);
      setStatus("error");
      setError(err instanceof ApiError ? err.detail : "Search failed. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search a place name
        </label>
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a place…"
          className="border-hairline bg-surface-3 text-ink focus-ring h-11 flex-1 rounded-sm border px-3 text-base"
          data-testid={`${testIdPrefix}-input`}
        />
        <button
          type="submit"
          disabled={query.trim() === "" || status === "searching"}
          className="bg-brand focus-ring-inset h-11 shrink-0 rounded-sm px-4 text-xs font-semibold tracking-[0.1em] text-white uppercase disabled:opacity-50"
          data-testid={`${testIdPrefix}-submit`}
        >
          {status === "searching" ? "Searching…" : "Search"}
        </button>
      </form>

      {status === "empty" ? (
        <p className="text-ink-mid text-xs" data-testid={`${testIdPrefix}-empty`}>
          No places matched &ldquo;{query.trim()}&rdquo;. Try a different search.
        </p>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="text-danger-hi text-xs" data-testid={`${testIdPrefix}-error`}>
          {error}
        </p>
      ) : null}

      {status === "results" ? (
        <ul className="flex flex-col gap-1.5" data-testid={`${testIdPrefix}-results`}>
          {results.map((candidate, index) => (
            // Nominatim returns no stable id — `name`+`address`+coordinates together are what
            // this list has to key on, and two candidates sharing all four would be the same
            // place returned twice.
            <li
              key={`${candidate.name}-${candidate.address}-${candidate.latitude}-${candidate.longitude}-${index}`}
              className="border-hairline bg-surface-3 flex items-center gap-2 rounded-sm border px-3 py-2"
              data-testid={`${testIdPrefix}-result`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-sm font-semibold">{candidate.name}</p>
                <p className="text-ink-mid truncate text-xs">{candidate.address}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelect(candidate)}
                className="border-hairline text-ink focus-ring h-9 shrink-0 rounded-sm border px-3 text-xs font-semibold tracking-[0.08em] uppercase"
                data-testid={`${testIdPrefix}-add`}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
