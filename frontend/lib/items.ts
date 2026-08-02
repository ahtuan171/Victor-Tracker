"use client";

/**
 * Item state for every content surface (T032, research.md R-007).
 *
 * R-007 settles the largest open question in an App Router application: the calendar and the backlog
 * drawer are **client components holding item state locally, with optimistic updates**, and no query
 * library. The reason is not preference — SC-005 gives filtering a one-second budget, US3 scenario 3
 * wants a status cue to update "immediately", and Render's free tier spins down, so the first request
 * of the day can take tens of seconds. A server round trip behind every toggle would pass on
 * localhost and fail in production, which is the worst place to find out.
 *
 * This module is where that decision is implemented **once**. T033's calendar, T034's capture sheet,
 * T035's backlog drawer, and T061's platform filter all read from here. Do not add a second
 * data-fetching strategy per surface — that is the failure the post-review pass in `tasks.md` caught
 * before it happened, when T038 and T061 would each have invented one in separate merge requests.
 *
 * ## The shape, and why it is split in two
 *
 * Everything that decides *what the state becomes* is a *pure function* over `ItemsState`, exported
 * and tested directly in `tests/client/items.spec.ts`. The React hook at the bottom is a thin shell
 * that owns the effect, the fetch, and the temporary ids.
 *
 * That split is forced by a real constraint rather than chosen for elegance: `tech-defaults.md`
 * rules out Jest and React Testing Library at v0.1, so there is **no renderer in this project** and a
 * hook cannot be exercised in isolation. Left as one lump, the rollback path — the branch that only
 * runs when the server rejects a write — would be reachable only through a full browser test that
 * has to fail a request on purpose. As pure functions the interesting cases are ordinary unit tests,
 * and the hook keeps only the parts a browser test does cover.
 *
 * ## Pending items are real items with a negative id
 *
 * An optimistic row has no server id yet, so it gets a negative one. Surfaces can therefore render
 * `items` as a single list, key on `item.id`, and show a pending row exactly like a saved one —
 * which is the point of an optimistic update.
 *
 * The rule is `isPending(item)`, and it is **load-bearing beyond rendering**: a pending item cannot
 * be the target of a `PATCH` or a `DELETE`, because the id it would name does not exist. T049 and
 * T050 bring those operations, and every surface offering them must skip pending rows. That is why
 * the predicate is exported rather than left as an inline `id < 0` at each site.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  createContentItem,
  listContentItems,
  type ContentItem,
  type ContentItemCreate,
  type ListContentItemsParams,
} from "./api";
import { nowInstant } from "./dates";

// --- Pending items --------------------------------------------------------------------------

/**
 * Whether this row exists only in the browser and has never been saved.
 *
 * Postgres identity columns start at 1 and never go negative, so a negative id cannot collide with a
 * real one. That is a stronger guarantee than a `_pending` flag on the object, which a spread or a
 * reconciliation could drop while leaving the row looking saved.
 *
 * **Check this before offering any operation that names an id.** A `PATCH /content-items/-1` is a
 * 404 at best; the correct behaviour is to not offer the control until the row has reconciled.
 */
export function isPending(item: ContentItem): boolean {
  return item.id < 0;
}

/**
 * Build the row to show while the server is still thinking.
 *
 * `createdAt` is a parameter rather than read from the clock inside, which is what lets this be
 * tested without stubbing time — and it keeps the module's only `Date` access at the hook boundary,
 * where `lib/dates.ts` provides it.
 *
 * The `?? null` on each optional field is not defensive noise: `ContentItemCreate` has them as
 * `hook?: string | null` while `ContentItem` has them as `hook: string | null`, and under
 * `exactOptionalPropertyTypes` those are genuinely different types. This is the same normalisation
 * `toContentItem` does to responses, applied to the request so a pending row and a saved row render
 * through identical code.
 */
export function makePendingItem(
  draft: ContentItemCreate,
  tempId: number,
  createdAt: string,
): ContentItem {
  return {
    id: tempId,
    title: draft.title,
    hook: draft.hook ?? null,
    platform: draft.platform ?? null,
    scheduled_date: draft.scheduled_date ?? null,
    // FR-005: capture is title-only and everything starts in `idea`. The server applies the same
    // default, so an optimistic row that guessed differently would visibly change status on
    // reconciliation.
    status: draft.status ?? "idea",
    published_url: draft.published_url ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

// --- State, and the pure transitions over it --------------------------------------------------

/** `loading` covers the first read only; a reload keeps the previous items on screen. */
export type ItemsStatus = "loading" | "ready" | "error";

export interface ItemsState {
  /**
   * Newest-created first, which is the order the server returns (`created_at DESC, id DESC`) and
   * the order FR-011 specifies for the backlog. Pending rows sit at the front, where a row created
   * a moment ago belongs.
   */
  readonly items: readonly ContentItem[];
  readonly status: ItemsStatus;
  /** A sentence safe to render. Null whenever `status` is not `error`. */
  readonly error: string | null;
}

export const INITIAL_ITEMS_STATE: ItemsState = { items: [], status: "loading", error: null };

/**
 * A completed read.
 *
 * **Pending rows survive it**, and that is the whole subtlety of this function. A capture and a
 * reload can overlap — the creator taps save, then pulls to refresh, and the list response was
 * already in flight before the new row existed. Replacing `items` wholesale would make the row
 * vanish mid-save and reappear seconds later, which reads as data loss. They are re-prepended
 * instead, and reconciliation later swaps each one for its saved counterpart.
 */
export function itemsLoaded(state: ItemsState, items: readonly ContentItem[]): ItemsState {
  return {
    items: [...state.items.filter(isPending), ...items],
    status: "ready",
    error: null,
  };
}

/**
 * A failed read.
 *
 * Whatever was already on screen stays there. A creator who scrolls into a dead spot should not
 * lose the list they were reading — and under FR-023a a view is explicitly permitted to show what
 * it loaded, so stale content plus a visible error is honest rather than a compromise.
 */
export function itemsFailed(state: ItemsState, error: string): ItemsState {
  return { items: state.items, status: "error", error };
}

/** Show an optimistic row immediately, at the front. */
export function pendingItemInserted(state: ItemsState, pending: ContentItem): ItemsState {
  return { ...state, items: [pending, ...state.items] };
}

/**
 * Swap an optimistic row for the one the server saved, **in place**.
 *
 * In place rather than remove-and-prepend: the two differ once anything else has been created since,
 * and a row that jumps position at the moment it saves is the visual artifact optimistic updates
 * exist to avoid.
 *
 * A `tempId` that matches nothing is not an error. The read that ran concurrently may already have
 * replaced this row with its saved self, in which case there is nothing to reconcile and the state
 * is already correct.
 */
export function pendingItemReconciled(
  state: ItemsState,
  tempId: number,
  saved: ContentItem,
): ItemsState {
  return {
    ...state,
    items: state.items.map((item) => (item.id === tempId ? saved : item)),
  };
}

/**
 * Drop an optimistic row the server refused.
 *
 * The row goes; the error is the caller's to surface. `createItem` rethrows so the capture sheet can
 * keep the creator's text on screen — silently discarding both the row and the typing would be the
 * worst outcome of a failed save.
 */
export function pendingItemRolledBack(state: ItemsState, tempId: number): ItemsState {
  return { ...state, items: state.items.filter((item) => item.id !== tempId) };
}

// --- Selectors ------------------------------------------------------------------------------

/**
 * The backlog: undated items, newest first (FR-011).
 *
 * Exported as a pure function rather than as another field on the store, so the rule has one
 * definition without the store growing a member per view. The ordering needs no sort — the array is
 * already newest-first and filtering preserves order, which is exactly why the server's ordering is
 * a total one (`created_at DESC, id DESC`; see `backend/AGENTS.md`).
 *
 * This is a client-side narrowing of items already in memory, not a second request. R-007 is
 * explicit that the calendar loads the period once and the drawer reads from the same state; a
 * `scheduled=none` fetch alongside it would double the round trips and let the two disagree.
 */
export function selectBacklog(items: readonly ContentItem[]): readonly ContentItem[] {
  return items.filter((item) => item.scheduled_date === null);
}

/**
 * Dated items, indexed by the day they fall on (T042, FR-012).
 *
 * The month grid's counterpart to `selectBacklog`, and together the two are a **partition**: every
 * item is in exactly one of them, which is US2 scenario 4 ("no item appears in both") expressed as
 * code rather than as two filters that happen to agree today.
 *
 * A `Map` keyed by `YYYY-MM-DD` rather than a scan per cell: the grid draws 42 cells and would
 * otherwise walk the whole list 42 times. Insertion order within a day is the server's order —
 * newest-created first — because `filter`/`push` preserve it and the endpoint's ordering is total
 * (`created_at DESC, id DESC`).
 *
 * **This does not narrow to the visible month.** The grid asks for the days it draws, including the
 * adjacent-month days in its first and last weeks, and takes what it finds. That is the shape the
 * Phase 3 checkpoint's amendment to T042 requires: the calendar loads every item in one
 * unparameterised read and narrows here, because a `date_from`/`date_to` read would return no undated
 * rows and silently empty the backlog drawer, which reads from the same state.
 */
export function groupByScheduledDate(
  items: readonly ContentItem[],
): ReadonlyMap<string, readonly ContentItem[]> {
  const byDay = new Map<string, ContentItem[]>();

  for (const item of items) {
    if (item.scheduled_date === null) continue;
    const day = byDay.get(item.scheduled_date);
    if (day === undefined) {
      byDay.set(item.scheduled_date, [item]);
    } else {
      day.push(item);
    }
  }

  return byDay;
}

// --- The hook -------------------------------------------------------------------------------

export interface ContentItemsStore extends ItemsState {
  /** Re-read from the server. Keeps the current items visible while it runs. */
  readonly reload: () => void;
  /**
   * Create an item, showing it immediately.
   *
   * Resolves with the saved row and **rejects with the original `ApiError`** if the server refuses,
   * after the optimistic row has been rolled back. Callers should keep the creator's input on screen
   * when it rejects.
   */
  readonly createItem: (draft: ContentItemCreate) => Promise<ContentItem>;
}

/**
 * Load the items for a period and hold them in state.
 *
 * `params` is read through a JSON key rather than depended on directly, because a caller writing the
 * idiomatic `useContentItems({ scheduled: "none" })` creates a new object every render — and an
 * effect depending on that object refetches forever. Callers therefore do not need `useMemo`, which
 * is the kind of requirement nobody remembers and nothing enforces.
 *
 * The one read this hook performs is deliberately unparameterised in US1: T033 loads everything and
 * the drawer narrows it client-side via `selectBacklog`. `date_from`/`date_to` arrive at T037 and the
 * platform filter at T060, and both go through this same hook.
 */
export function useContentItems(params: ListContentItemsParams = {}): ContentItemsStore {
  const paramsKey = JSON.stringify(params);
  const stableParams = useMemo(() => JSON.parse(paramsKey) as ListContentItemsParams, [paramsKey]);

  const [state, setState] = useState<ItemsState>(INITIAL_ITEMS_STATE);
  const [reloadCount, setReloadCount] = useState(0);

  /**
   * The next temporary id. A ref, not state: bumping it must not re-render, and two captures in the
   * same tick must not receive the same value — which is exactly what a `useState` counter read
   * during a handler would do.
   */
  const nextTempId = useRef(-1);

  useEffect(() => {
    // Guards the response, not the request. A period change or a reload can land out of order, and
    // an unmounted component receiving one is React's classic warning; more importantly, a slow
    // first response arriving after a fast second one would show the wrong period's items.
    let current = true;

    listContentItems(stableParams)
      .then((items) => {
        if (current) setState((previous) => itemsLoaded(previous, items));
      })
      .catch((error: unknown) => {
        if (current) setState((previous) => itemsFailed(previous, messageFor(error)));
      });

    return () => {
      current = false;
    };
  }, [stableParams, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const createItem = useCallback(async (draft: ContentItemCreate): Promise<ContentItem> => {
    const tempId = nextTempId.current;
    nextTempId.current -= 1;

    const pending = makePendingItem(draft, tempId, nowInstant());
    setState((previous) => pendingItemInserted(previous, pending));

    try {
      const saved = await createContentItem(draft);
      setState((previous) => pendingItemReconciled(previous, tempId, saved));
      return saved;
    } catch (error) {
      setState((previous) => pendingItemRolledBack(previous, tempId));
      // Rethrown rather than folded into `state.error`: a failed *write* is the capture sheet's
      // problem to render beside its own field, while `state.error` describes a failed *read* of
      // the whole list. Collapsing the two would blank the calendar because one save was refused.
      throw error;
    }
  }, []);

  return { ...state, reload, createItem };
}

/**
 * A sentence to show a human, from anything that was thrown.
 *
 * `ApiError.detail` is safe verbatim — the contract makes every error body a single string and the
 * backend flattens FastAPI's validation array into one, so this never renders `[object Object]`.
 * Anything else is a bug rather than a server response, and gets wording that does not pretend to
 * diagnose it.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Something went wrong loading your items. Try again.";
}
