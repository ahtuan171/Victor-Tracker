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
  deleteContentItem,
  listContentItems,
  updateContentItem,
  type ContentItem,
  type ContentItemCreate,
  type ContentItemUpdate,
  type ListContentItemsParams,
} from "./api";
import { isBeforeDateOnly, nowInstant, type DateOnly } from "./dates";

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
 * **Rows saved since the read began survive it**, and that is the whole subtlety of this function. A
 * capture and a reload can overlap — the creator taps save, then something triggers a re-read, and the
 * list response was already in flight before the new row existed. Replacing `items` wholesale would
 * make the row vanish mid-save and reappear seconds later, which reads as data loss.
 *
 * Two kinds of row need protecting, and only the first was protected until T044:
 *
 * 1. **Still pending.** No server id yet, so it cannot be in any response. Re-prepended, and
 *    reconciliation later swaps it for its saved counterpart.
 * 2. **Already reconciled, but after the read was issued.** This one is the hole the Phase 3
 *    `reviewer` pass recorded: the row now has a real id, so `isPending` is false, and the response —
 *    fetched before the row existed — does not contain it either. It was dropped until the next load.
 *    `savedSince` names exactly those ids so they are kept.
 *
 * **`savedSince` is a narrow allowance, not a merge.** A general merge-by-id would be wrong in the
 * other direction: it would leave an item deleted on another device on screen forever, because absence
 * from the response is precisely how a deletion arrives (T050). Only ids the *browser itself* saved
 * during this read qualify, and only while they are missing from the response.
 */
export function itemsLoaded(
  state: ItemsState,
  items: readonly ContentItem[],
  savedSince: ReadonlySet<number> = NONE,
): ItemsState {
  const returned = new Set(items.map((item) => item.id));
  const kept = state.items.filter(
    (item) => isPending(item) || (savedSince.has(item.id) && !returned.has(item.id)),
  );

  return { items: [...kept, ...items], status: "ready", error: null };
}

/** The default for a read that overlapped no save — the common case, and one shared empty set. */
const NONE: ReadonlySet<number> = new Set<number>();

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

/**
 * Merge a set of changes onto a stored row, giving the row to show while the server is thinking.
 *
 * **This is FR-023's omit-versus-null distinction on the optimistic side of the wire**, and it is
 * the one place in the frontend where getting it wrong is silent. A field the caller omitted keeps
 * its stored value; a field set to explicit `null` is cleared. Written as a spread per field rather
 * than `changes.hook ?? item.hook`, because `??` treats `null` as "no opinion" and would make
 * "unschedule this item" mean "leave the date alone" — a drag back to the backlog that appeared to
 * do nothing.
 *
 * `exactOptionalPropertyTypes` is what makes `=== undefined` an exact test for "the caller omitted
 * this": under that flag no caller can pass an explicit `undefined`, so an own property is always a
 * field someone meant to write. See `ContentItemUpdate` in `lib/api.ts`.
 *
 * `id`, `created_at` and `updated_at` are never touched. `updated_at` in particular is the server's
 * to set — advancing it here would put a timestamp on screen that no row ever had, and the
 * reconciliation would quietly correct it a beat later.
 */
export function itemWithChanges(item: ContentItem, changes: ContentItemUpdate): ContentItem {
  return {
    ...item,
    ...(changes.title === undefined ? {} : { title: changes.title }),
    ...(changes.hook === undefined ? {} : { hook: changes.hook }),
    ...(changes.platform === undefined ? {} : { platform: changes.platform }),
    ...(changes.scheduled_date === undefined ? {} : { scheduled_date: changes.scheduled_date }),
    ...(changes.status === undefined ? {} : { status: changes.status }),
    ...(changes.published_url === undefined ? {} : { published_url: changes.published_url }),
  };
}

/**
 * What changed between the row as stored and the row as edited (T052).
 *
 * The item sheet holds its draft as a whole `ContentItem` — the same shape it renders — and this is
 * what turns that draft back into the minimal `PATCH` body. Sending the whole item instead would be
 * a full replacement dressed as a partial update: correct today, and silently destructive the moment
 * two surfaces edit one item, because every unchanged field would be rewritten with whatever this
 * screen last read (FR-023a's last-write-wins is about *fields the creator touched*, not about every
 * field they happened to have on screen).
 *
 * **A cleared field becomes an explicit `null`, and that is a change like any other.** Emptying the
 * date input unschedules the item; emptying the hook removes it. `itemWithChanges` is the inverse and
 * the two are asserted against each other in `tests/client/items.spec.ts`.
 *
 * `id`, `created_at` and `updated_at` are not comparable fields — they are not in `ContentItemUpdate`
 * and the server owns them. `title` and `status` have no null spelling, matching the contract.
 *
 * An empty result means nothing changed, and the caller must **not** send it: the backend refuses an
 * empty body with a 422 (`minProperties: 1`), deliberately, so that a frontend bug which dropped its
 * payload cannot look like a successful save.
 */
export function changesBetween(original: ContentItem, draft: ContentItem): ContentItemUpdate {
  return {
    ...(draft.title === original.title ? {} : { title: draft.title }),
    ...(draft.hook === original.hook ? {} : { hook: draft.hook }),
    ...(draft.platform === original.platform ? {} : { platform: draft.platform }),
    ...(draft.scheduled_date === original.scheduled_date
      ? {}
      : { scheduled_date: draft.scheduled_date }),
    ...(draft.status === original.status ? {} : { status: draft.status }),
    ...(draft.published_url === original.published_url
      ? {}
      : { published_url: draft.published_url }),
  };
}

/** Whether a change set would be refused as empty — the caller's cue to close without saving. */
export function hasChanges(changes: ContentItemUpdate): boolean {
  return Object.keys(changes).length > 0;
}

/**
 * Replace a row with another version of itself, **in place**, matched on `id`.
 *
 * One transition serving all three steps of an optimistic edit — show the change, accept the
 * server's answer, or put the original back — which is deliberate: a separate rollback function
 * would be free to drift from the function that applied the change, and rollback is the branch a
 * browser test reaches least.
 *
 * In place rather than remove-and-prepend, for the same reason as `pendingItemReconciled`: a row
 * that jumps to the front of the backlog the moment its status changes is exactly the artifact
 * optimistic updates exist to avoid.
 *
 * **A row that is no longer present is left absent, not resurrected.** A list read can land between
 * the optimistic write and the server's answer, and absence from a response is how a deletion made
 * on another device arrives (see `itemsLoaded`) — re-inserting here would undo it.
 *
 * `status` and `error` are untouched: a refused *write* is the item sheet's to render beside its own
 * controls (T053), while `state.error` describes a failed *read* of the whole list.
 */
export function itemChanged(state: ItemsState, next: ContentItem): ItemsState {
  return {
    ...state,
    items: state.items.map((item) => (item.id === next.id ? next : item)),
  };
}

/**
 * Take a row off the surface (T056, FR-020, FR-004).
 *
 * The optimistic half of a delete. Matched on id and a no-op if the row is already absent, which is
 * the common case when the same item was deleted on another device — absence from a list response is
 * how that arrives.
 */
export function itemRemoved(state: ItemsState, id: number): ItemsState {
  return { ...state, items: state.items.filter((item) => item.id !== id) };
}

/**
 * Put a deleted row back where it belongs, when the server refused to delete it.
 *
 * **By the list's own ordering, not by a remembered index**, and that is the interesting choice. An
 * index captured before the removal is stale the moment anything else lands — a list read, another
 * edit — and restoring to a stale index puts the row in a position it never occupied. Re-deriving the
 * position from the ordering is correct whatever happened in between, and it needs nothing captured.
 *
 * The ordering is the server's: `created_at DESC, id DESC` (see `backend/AGENTS.md`), which is total,
 * which is why `selectBacklog` can filter without sorting. Pending rows sit ahead of every saved row
 * and are skipped, because they are ordered by when this browser created them rather than by the
 * server's answer.
 *
 * Both timestamps come from the same serialiser, so comparing them as strings is chronological. `id`
 * breaks the tie exactly as the server's `ORDER BY` does.
 *
 * A row that is somehow still present is left alone rather than duplicated.
 */
export function itemRestored(state: ItemsState, item: ContentItem): ItemsState {
  if (state.items.some((each) => each.id === item.id)) return state;

  const at = state.items.findIndex((each) => !isPending(each) && sortsBefore(item, each));
  const items = [...state.items];
  items.splice(at === -1 ? items.length : at, 0, item);

  return { ...state, items };
}

/** `created_at DESC, id DESC` — the server's ordering, as a predicate. */
function sortsBefore(a: ContentItem, b: ContentItem): boolean {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.id > b.id;
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
 * Whether this item's scheduled day has passed with the item still unpublished (T045, spec Edge
 * Cases and Overdue items).
 *
 * `scheduled_date < today AND status !== "posted"`. The spec words it as "still `idea` or `draft`",
 * which is the same set — three statuses, and `posted` is the one that ends the pipeline. Written as
 * the negation so a fourth status could never silently become non-overdue by omission.
 *
 * ## `today` is a parameter, and that is the enforcement
 *
 * `dates.today()` **throws** outside the browser on purpose (research.md R-006 addendum): Vercel's
 * clock is UTC, so a creator in UTC+7 opening the app at 06:00 on the 5th is at 23:00 UTC on the 4th,
 * and an item dated the 4th would render *not overdue* in the server HTML and *overdue* a moment later
 * on hydration — a visible flip plus a React mismatch warning, in a cue FR-017 says must be reliable.
 * Taking the day as an argument means this function cannot be the thing that reads a clock, and
 * **`null` is a first-class answer**: before the browser's clock is known, nothing is overdue yet.
 *
 * The comparison is plain string ordering. `YYYY-MM-DD` is fixed-width and big-endian, so
 * lexicographic order *is* chronological order — no `Date`, no timezone, no DST (see `lib/dates.ts`).
 */
export function isOverdue(item: ContentItem, today: DateOnly | null): boolean {
  if (today === null || item.scheduled_date === null) return false;
  return item.status !== "posted" && isBeforeDateOnly(item.scheduled_date, today);
}

/**
 * How many loaded items are overdue — the export's second header count (`1c`'s `3 overdue`).
 *
 * Derived from the list already in memory rather than stored, which is what the stage-2 data-shape
 * audit in `design/content-calendar/BRIEF.md` cleared: no `spec.md` amendment was needed because
 * overdue is not a field. It counts **every** loaded item, not only the ones in the visible period —
 * an overdue item two months back is exactly the one the creator has lost track of, and a count that
 * emptied itself as they navigated away from the problem would be the opposite of what the treatment
 * is for.
 */
export function countOverdue(items: readonly ContentItem[], today: DateOnly | null): number {
  return items.filter((item) => isOverdue(item, today)).length;
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
  /**
   * Change some fields of an item, showing the change immediately (T051, FR-023).
   *
   * The single write behind both halves of FR-014 and FR-015: the item sheet's taps (T052) and the
   * drag onto a day (T054) both land here, which is what makes "both paths produce an identical
   * result" true by construction.
   *
   * **Takes the row, not just its id.** Three reasons, and each would otherwise need machinery: it
   * makes the `isPending` guard read as itself rather than as an inline `id < 0`; it is what the
   * change is merged onto; and it *is* the rollback value, so a refusal restores the row the
   * creator was actually looking at with no snapshot to capture and no index to remember.
   *
   * Resolves with the saved row and **rejects with the original `ApiError`** once the optimistic
   * change has been rolled back — including the 409s, which T053 renders beside the platform
   * control. Callers should keep the sheet open on a rejection.
   */
  readonly updateItem: (item: ContentItem, changes: ContentItemUpdate) => Promise<ContentItem>;
  /**
   * Delete an item, taking it off the surface immediately (T056, FR-004, FR-020).
   *
   * **A 404 resolves rather than rejecting**, and that is a decision this layer is entitled to make.
   * T050 settled that the backend answers 404 for an id that does not exist rather than an idempotent
   * 204, which is right for an API. But this call is reconciling a *screen*, not committing a
   * transaction: the creator asked for the item to be gone, and it is gone. Telling them a deletion
   * failed because the item was already deleted would be an error message describing success.
   *
   * Every other failure rejects with the original `ApiError`, after the row has been put back where
   * the list's ordering says it belongs.
   */
  readonly deleteItem: (item: ContentItem) => Promise<void>;
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

  /**
   * Ids this browser has saved since the in-flight read was issued — see `itemsLoaded`.
   *
   * Reset at the start of every read rather than accumulated, because a row saved *before* a read was
   * issued is already in the database and therefore already in that read's response: keeping it in the
   * set could only resurrect a row the server has since stopped returning.
   */
  const savedSinceRead = useRef<Set<number>>(new Set());

  useEffect(() => {
    // Guards the response, not the request. A period change or a reload can land out of order, and
    // an unmounted component receiving one is React's classic warning; more importantly, a slow
    // first response arriving after a fast second one would show the wrong period's items.
    let current = true;

    const savedSince = new Set<number>();
    savedSinceRead.current = savedSince;

    listContentItems(stableParams)
      .then((items) => {
        if (current) setState((previous) => itemsLoaded(previous, items, savedSince));
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
      // Registered before the state update so a list response that lands in the same tick cannot
      // find the row reconciled and the id unregistered — the exact interleaving the hole was.
      savedSinceRead.current.add(saved.id);
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

  const updateItem = useCallback(
    async (item: ContentItem, changes: ContentItemUpdate): Promise<ContentItem> => {
      // A caller bug, not a server response: the id does not exist yet, so this would be a 404 that
      // rolled the edit back and showed the creator an error about an item they can see. Every
      // surface offering an edit must skip pending rows — the chip exposes `aria-busy` for exactly
      // this. Loud here so that omission surfaces in development rather than as a mystery 404.
      // (The proxy would refuse it anyway: `PARAM_PATTERNS.item_id` is digits-only, so a negative
      // id never reaches FastAPI. That is a backstop, not the mechanism.)
      if (isPending(item)) {
        throw new Error(`Cannot update item ${item.id}: it has not been saved yet.`);
      }

      setState((previous) => itemChanged(previous, itemWithChanges(item, changes)));

      try {
        const saved = await updateContentItem(item.id, changes);
        // The server's row, not the optimistic one — it carries the real `updated_at`, and any
        // field the backend normalised on the way in.
        setState((previous) => itemChanged(previous, saved));
        return saved;
      } catch (error) {
        // `item` is the row as it was before the optimistic change, so restoring it needs no
        // snapshot. Under FR-023a's last-write-wins this is also the right answer when something
        // else has moved underneath: the creator's screen returns to what they were looking at.
        setState((previous) => itemChanged(previous, item));
        // Rethrown for the same reason `createItem` rethrows: a refused write belongs beside the
        // control that attempted it, not in `state.error`, which would blank the calendar.
        throw error;
      }
    },
    [],
  );

  const deleteItem = useCallback(async (item: ContentItem): Promise<void> => {
    // Same guard as `updateItem`, same reason: the id does not exist on the server yet. `ItemChip`
    // will not open a pending row, so the sheet's delete button cannot be reached for one — this is
    // the backstop, not the mechanism.
    if (isPending(item)) {
      throw new Error(`Cannot delete item ${item.id}: it has not been saved yet.`);
    }

    setState((previous) => itemRemoved(previous, item.id));

    try {
      await deleteContentItem(item.id);
    } catch (error) {
      // Already gone is the outcome that was asked for. See `deleteItem` in `ContentItemsStore`.
      if (error instanceof ApiError && error.status === 404) return;

      setState((previous) => itemRestored(previous, item));
      throw error;
    }
  }, []);

  return { ...state, reload, createItem, updateItem, deleteItem };
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
