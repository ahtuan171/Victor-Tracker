import { expect, test } from "@playwright/test";

import type { ContentItem, ContentItemCreate, ContentItemUpdate } from "@/lib/api";
import {
  INITIAL_ITEMS_STATE,
  changesBetween,
  hasChanges,
  isPending,
  isValidPublishedUrl,
  itemChanged,
  itemRemoved,
  itemRestored,
  itemsFailed,
  itemWithChanges,
  countOverdue,
  isOverdue,
  itemsLoaded,
  makePendingItem,
  pendingItemInserted,
  pendingItemReconciled,
  pendingItemRolledBack,
  groupByScheduledDate,
  selectBacklog,
  selectByPlatform,
  type ItemsState,
} from "@/lib/items";

/**
 * `lib/items.ts` (T032, research.md R-007) — the pure half.
 *
 * `useContentItems` itself is not tested here and cannot be: `tech-defaults.md` rules out Jest and
 * React Testing Library at v0.1, so this project has no renderer. That constraint is the reason the
 * module is shaped the way it is — every decision about *what the state becomes* is a pure function,
 * and the hook is a shell holding the effect, the fetch, and the temporary id counter.
 *
 * What that buys is exactly the branches a browser test reaches least. The rollback path only runs
 * when the server refuses a write, and the overlap path only when a reload lands mid-save; through a
 * browser both need a request failed or delayed on purpose, and neither would ever be asserted at
 * the level of "which rows are in which order". Here they are ordinary unit tests.
 *
 * The hook's own wiring is covered by the browser tests at T033 and T034.
 */

const CREATED_AT = "2026-08-01T09:00:00.000Z";

function item(id: number, overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    title: `Item ${id}`,
    hook: null,
    platform: null,
    scheduled_date: null,
    status: "idea",
    published_url: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function ready(items: readonly ContentItem[]): ItemsState {
  return { items, status: "ready", error: null };
}

const ids = (state: ItemsState): number[] => state.items.map((each) => each.id);

test.describe("isPending", () => {
  test("a negative id is pending and a real one is not", () => {
    expect(isPending(item(-1))).toBe(true);
    expect(isPending(item(1))).toBe(false);
  });

  test("id 0 is not pending", () => {
    // Not a real id either — Postgres identity starts at 1 — but the predicate must not treat the
    // boundary as pending, or a strict-inequality slip would silently make row 1 unmutatable.
    expect(isPending(item(0))).toBe(false);
  });
});

test.describe("makePendingItem", () => {
  test("a title-only draft becomes a complete item", () => {
    const draft: ContentItemCreate = { title: "Ring light comparison" };

    const pending = makePendingItem(draft, -1, CREATED_AT);

    // Annotated rather than asserted with a type argument: Playwright's `toEqual` takes none, and
    // this way the build fails if `ContentItem` gains a field (see frontend/AGENTS.md).
    const expected: ContentItem = {
      id: -1,
      title: "Ring light comparison",
      hook: null,
      platform: null,
      scheduled_date: null,
      status: "idea",
      published_url: null,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    };
    expect(pending).toEqual(expected);
  });

  test("status defaults to idea, matching what the server would apply", () => {
    // A different guess here would show the row as one status and then visibly change it on
    // reconciliation, which is precisely the flicker optimism is meant to remove.
    expect(makePendingItem({ title: "x" }, -1, CREATED_AT).status).toBe("idea");
  });

  test("optional fields that are absent become null, not undefined", () => {
    // `ContentItemCreate` has `hook?: string | null` and `ContentItem` has `hook: string | null`.
    // Under exactOptionalPropertyTypes those differ, and a spread would carry `undefined` into a
    // field every surface is typed to receive as `null`.
    const pending = makePendingItem({ title: "x" }, -1, CREATED_AT);

    expect(Object.hasOwn(pending, "hook")).toBe(true);
    expect(pending.hook).toBeNull();
  });

  test("fields the draft does set are carried through", () => {
    const pending = makePendingItem(
      { title: "x", platform: "tiktok", scheduled_date: "2026-09-01", hook: "a hook" },
      -1,
      CREATED_AT,
    );

    expect(pending.platform).toBe("tiktok");
    expect(pending.scheduled_date).toBe("2026-09-01");
    expect(pending.hook).toBe("a hook");
  });
});

test.describe("itemsLoaded", () => {
  test("the first read fills an empty state and marks it ready", () => {
    const state = itemsLoaded(INITIAL_ITEMS_STATE, [item(2), item(1)]);

    expect(ids(state)).toEqual([2, 1]);
    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
  });

  test("a later read replaces the saved rows entirely", () => {
    // Deletions have to be able to disappear. A merge-by-id would leave a deleted row on screen
    // forever, which is why this is a replacement rather than an upsert.
    const state = itemsLoaded(ready([item(1)]), [item(9)]);

    expect(ids(state)).toEqual([9]);
  });

  test("pending rows survive a read that overlapped them", () => {
    // The case this function exists for: the creator taps save, then the in-flight list response
    // lands. Replacing wholesale would make the new row vanish and reappear seconds later.
    const state = itemsLoaded(ready([item(-1), item(1)]), [item(2), item(1)]);

    expect(ids(state)).toEqual([-1, 2, 1]);
  });

  test("a read clears a previous error", () => {
    const state = itemsLoaded(itemsFailed(ready([item(1)]), "offline"), [item(1)]);

    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
  });

  test("a row saved after the read was issued survives it too", () => {
    // The hole the Phase 3 `reviewer` pass recorded, closed at T044. The creator's capture has
    // *already* reconciled — the row has a real id, so `isPending` is false — but the response was
    // fetched before that id existed, so it is not in the list either. Without `savedSince` the row
    // is dropped until the next load, which reads as the save having failed.
    const state = itemsLoaded(ready([item(7), item(1)]), [item(1)], new Set([7]));

    expect(ids(state)).toEqual([7, 1]);
  });

  test("a row saved after the read and also returned by it is not duplicated", () => {
    // The overlap resolves the other way just as often: the read was issued before the save but the
    // server answered after it, so the response already contains the row.
    const state = itemsLoaded(ready([item(7), item(1)]), [item(7), item(1)], new Set([7]));

    expect(ids(state)).toEqual([7, 1]);
  });

  test("`savedSince` does not resurrect a row the server has stopped returning", () => {
    // The reason this is a narrow allowance rather than a merge-by-id. Absence from the response is
    // how a deletion arrives (T050); only ids this browser saved during *this* read may override it,
    // and the hook resets that set at the start of every read for exactly this reason.
    const state = itemsLoaded(ready([item(7), item(1)]), [item(1)], new Set([3]));

    expect(ids(state)).toEqual([1]);
  });
});

test.describe("isOverdue", () => {
  const TODAY = "2026-08-02";

  test("a passed day with the item still unpublished is overdue", () => {
    // The spec's edge case: "a scheduled date that has passed while the item is still idea or draft".
    expect(isOverdue(item(1, { scheduled_date: "2026-08-01", status: "idea" }), TODAY)).toBe(true);
    expect(isOverdue(item(1, { scheduled_date: "2026-08-01", status: "draft" }), TODAY)).toBe(true);
  });

  test("today is not overdue, and neither is tomorrow", () => {
    // Strictly before, so the day itself is still the creator's to use. An item due today reading as
    // overdue at 00:01 would be a nag rather than a signal.
    expect(isOverdue(item(1, { scheduled_date: TODAY, status: "idea" }), TODAY)).toBe(false);
    expect(isOverdue(item(1, { scheduled_date: "2026-08-03", status: "idea" }), TODAY)).toBe(false);
  });

  test("a posted item is never overdue, however old", () => {
    // `posted` ends the pipeline. Written as `!== "posted"` rather than as a list of the other two,
    // so a fourth status could not silently become non-overdue by omission.
    expect(isOverdue(item(1, { scheduled_date: "2020-01-01", status: "posted" }), TODAY)).toBe(
      false,
    );
  });

  test("an undated item is never overdue", () => {
    // The whole backlog. This is why `BacklogDrawer` can omit `today` entirely — the data decides,
    // not the surface.
    expect(isOverdue(item(1, { scheduled_date: null, status: "idea" }), TODAY)).toBe(false);
  });

  test("nothing is overdue before the browser's clock has been read", () => {
    // `null` is the honest "not known yet", not a missing value to work around. `dates.today()`
    // throws outside the browser on purpose, so this is the state every server render is in — and
    // rendering no treatment is what keeps the hydration flip in R-006's addendum impossible.
    expect(isOverdue(item(1, { scheduled_date: "2020-01-01", status: "idea" }), null)).toBe(false);
  });

  test("the comparison is lexicographic and crosses year and month boundaries", () => {
    // `YYYY-MM-DD` is fixed-width and big-endian, so string order is chronological order — no Date,
    // no timezone, no DST. The cases a naive numeric compare would get wrong.
    expect(isOverdue(item(1, { scheduled_date: "2025-12-31" }), "2026-01-01")).toBe(true);
    expect(isOverdue(item(1, { scheduled_date: "2026-01-09" }), "2026-01-10")).toBe(true);
    expect(isOverdue(item(1, { scheduled_date: "2026-01-10" }), "2026-01-09")).toBe(false);
  });
});

test.describe("countOverdue", () => {
  test("counts every loaded item, whatever period is on screen", () => {
    const state = [
      item(1, { scheduled_date: "2026-05-01", status: "idea" }),
      item(2, { scheduled_date: "2026-08-01", status: "draft" }),
      item(3, { scheduled_date: "2026-08-01", status: "posted" }),
      item(4, { scheduled_date: null }),
      item(5, { scheduled_date: "2026-09-01", status: "idea" }),
    ];

    // Two: the May idea and the August draft. An overdue item three months back is exactly the one
    // the creator has lost track of, so the count must not narrow with the period.
    expect(countOverdue(state, "2026-08-02")).toBe(2);
  });

  test("is zero before the clock is known", () => {
    expect(countOverdue([item(1, { scheduled_date: "2020-01-01" })], null)).toBe(0);
  });
});

test.describe("itemsFailed", () => {
  test("what was on screen stays on screen", () => {
    // FR-023a permits a view to show what it loaded, so stale rows plus a visible error beat a
    // blank page — a creator who hits a dead spot mid-scroll should not lose the list.
    const state = itemsFailed(ready([item(2), item(1)]), "Could not reach the server.");

    expect(ids(state)).toEqual([2, 1]);
    expect(state.status).toBe("error");
    expect(state.error).toBe("Could not reach the server.");
  });
});

test.describe("optimistic create", () => {
  test("a pending row appears at the front immediately", () => {
    const state = pendingItemInserted(ready([item(2), item(1)]), item(-1));

    expect(ids(state)).toEqual([-1, 2, 1]);
  });

  test("reconciliation swaps the row in place rather than moving it", () => {
    // In place matters once anything else has been created since: remove-and-prepend would make the
    // row jump position at the exact moment it saved.
    const withPending = pendingItemInserted(ready([item(2)]), item(-1));
    const withAnother = pendingItemInserted(withPending, item(-2));

    const state = pendingItemReconciled(withAnother, -1, item(7));

    expect(ids(state)).toEqual([-2, 7, 2]);
  });

  test("reconciling an id that is no longer present changes nothing", () => {
    // A concurrent read may already have replaced the row with its saved self. That is not an
    // error and must not resurrect a duplicate.
    const state = pendingItemReconciled(ready([item(2), item(1)]), -1, item(7));

    expect(ids(state)).toEqual([2, 1]);
  });

  test("a rollback removes only the refused row", () => {
    const withTwo = pendingItemInserted(pendingItemInserted(ready([item(1)]), item(-1)), item(-2));

    const state = pendingItemRolledBack(withTwo, -1);

    expect(ids(state)).toEqual([-2, 1]);
  });

  test("a rollback leaves status and error untouched", () => {
    // A refused *write* is the capture sheet's to render beside its own field. Folding it into the
    // list's error would blank the calendar because one save failed.
    const state = pendingItemRolledBack(pendingItemInserted(ready([item(1)]), item(-1)), -1);

    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
  });
});

test.describe("itemWithChanges", () => {
  const stored = item(7, {
    title: "Ring light review",
    hook: "The one nobody mentions",
    platform: "tiktok",
    scheduled_date: "2026-08-04",
    status: "draft",
    published_url: "https://example.com/v/1",
  });

  test("a field the caller omitted keeps its stored value", () => {
    const next = itemWithChanges(stored, { status: "posted" });

    expect(next.status).toBe("posted");
    expect(next.hook).toBe("The one nobody mentions");
    expect(next.platform).toBe("tiktok");
    expect(next.scheduled_date).toBe("2026-08-04");
    expect(next.published_url).toBe("https://example.com/v/1");
  });

  test("an explicit null clears the field, and omission does not", () => {
    // The whole of FR-023's partial-update semantics, on the optimistic side of the wire. A merge
    // written with `??` collapses these two into one and silently keeps the old value.
    expect(itemWithChanges(stored, { scheduled_date: null }).scheduled_date).toBeNull();
    expect(itemWithChanges(stored, { hook: null }).hook).toBeNull();
    expect(itemWithChanges(stored, { platform: null }).platform).toBeNull();
    expect(itemWithChanges(stored, { published_url: null }).published_url).toBeNull();

    expect(itemWithChanges(stored, { title: "x" }).scheduled_date).toBe("2026-08-04");
  });

  test("clearing one field leaves the others alone", () => {
    const next = itemWithChanges(stored, { scheduled_date: null });

    expect(next.title).toBe("Ring light review");
    expect(next.status).toBe("draft");
    expect(next.published_url).toBe("https://example.com/v/1");
  });

  test("several fields at once, which is what one sheet save is", () => {
    const next = itemWithChanges(stored, {
      title: "Ring light, honestly",
      platform: "youtube",
      status: "posted",
    });

    expect(next.title).toBe("Ring light, honestly");
    expect(next.platform).toBe("youtube");
    expect(next.status).toBe("posted");
  });

  test("the id and the timestamps are never guessed", () => {
    const next = itemWithChanges(stored, { status: "posted" });

    // `updated_at` belongs to the server. Advancing it optimistically would put a time on screen
    // that no row ever had, and the reconciliation would silently correct it a beat later.
    expect(next.id).toBe(7);
    expect(next.created_at).toBe(stored.created_at);
    expect(next.updated_at).toBe(stored.updated_at);
  });

  test("the stored item is not mutated", () => {
    itemWithChanges(stored, { status: "posted", platform: null });

    expect(stored.status).toBe("draft");
    expect(stored.platform).toBe("tiktok");
  });

  test("an empty change set is the identity, field for field", () => {
    // The backend refuses `{}` with a 422 (`minProperties: 1`), so this never leaves the browser —
    // but the merge must not invent a value on the way to finding that out.
    const empty: ContentItemUpdate = {};

    expect(itemWithChanges(stored, empty)).toEqual(stored);
  });
});

test.describe("changesBetween", () => {
  const stored = item(7, {
    title: "Ring light review",
    hook: "The one nobody mentions",
    platform: "tiktok",
    scheduled_date: "2026-08-04",
    status: "draft",
    published_url: null,
  });

  test("an untouched draft produces nothing to send", () => {
    const changes = changesBetween(stored, { ...stored });

    expect(changes).toEqual({});
    expect(hasChanges(changes)).toBe(false);
  });

  test("only the fields that differ are sent", () => {
    const changes = changesBetween(stored, { ...stored, status: "posted" });

    // Not `{title, hook, platform, scheduled_date, status, published_url}` — sending the whole item
    // is a full replacement wearing a PATCH's clothes.
    expect(changes).toEqual({ status: "posted" });
    expect(hasChanges(changes)).toBe(true);
  });

  test("a cleared field is sent as an explicit null, not omitted", () => {
    const changes = changesBetween(stored, { ...stored, scheduled_date: null });

    expect(changes).toEqual({ scheduled_date: null });
    // Omission would mean "leave the date alone", which is the opposite of unscheduling.
    expect("scheduled_date" in changes).toBe(true);
  });

  test("clearing the platform is a change, which is how platform_locked becomes reachable", () => {
    expect(changesBetween(stored, { ...stored, platform: null })).toEqual({ platform: null });
  });

  test("several edits in one save, which is what SC-012 depends on", () => {
    // A title-only idea given a platform *and* advanced in one request. Two requests would make the
    // first one a guaranteed 409 — the backend validates the item as it would be after the change,
    // precisely so this single request exists.
    const idea = item(9, { title: "Car idea" });

    const changes = changesBetween(idea, { ...idea, platform: "youtube", status: "draft" });

    expect(changes).toEqual({ platform: "youtube", status: "draft" });
  });

  test("id and the timestamps are never sent, because they are not the caller's to set", () => {
    const changes = changesBetween(stored, {
      ...stored,
      id: 999,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
    });

    expect(changes).toEqual({});
  });

  test("it is the inverse of itemWithChanges", () => {
    // The invariant that keeps the two halves of the edit path honest: whatever the sheet computes
    // as a diff, applying it optimistically must reproduce the draft it came from.
    const draft = { ...stored, status: "posted" as const, hook: null, scheduled_date: null };

    expect(itemWithChanges(stored, changesBetween(stored, draft))).toEqual(draft);
  });
});

test.describe("optimistic update", () => {
  test("the changed row is replaced in place, not moved", () => {
    // Same reason as reconciliation: a row that jumps to the front the moment its status changes is
    // the artifact optimistic updates exist to avoid.
    const state = itemChanged(ready([item(3), item(2), item(1)]), item(2, { status: "posted" }));

    expect(ids(state)).toEqual([3, 2, 1]);
    expect(state.items[1]?.status).toBe("posted");
  });

  test("it is its own inverse, which is what makes rollback one function", () => {
    // Apply the optimistic row, then put the original back. Two callers, one transition — there is
    // no separate rollback shape that could drift from the shape that applied the change.
    const before = item(2, { status: "idea" });
    const applied = itemChanged(
      ready([item(3), before, item(1)]),
      itemWithChanges(before, { status: "posted" }),
    );

    const rolledBack = itemChanged(applied, before);

    expect(ids(rolledBack)).toEqual([3, 2, 1]);
    expect(rolledBack.items[1]).toEqual(before);
  });

  test("a row that is no longer present is not resurrected", () => {
    // A list read can land between the optimistic write and the server's answer. If it deleted this
    // row — the way a deletion on another device arrives — putting it back would undo that.
    const state = itemChanged(ready([item(3), item(1)]), item(2, { status: "posted" }));

    expect(ids(state)).toEqual([3, 1]);
  });

  test("no other row is touched", () => {
    const first = item(3);
    const state = itemChanged(ready([first, item(2)]), item(2, { title: "changed" }));

    expect(state.items[0]).toBe(first);
  });

  test("status and error are left alone", () => {
    // A refused *write* is the item sheet's to render beside its own controls (T053). Folding it
    // into the list's error would blank the calendar because one edit was refused.
    const state = itemChanged(ready([item(1)]), item(1, { status: "posted" }));

    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
  });
});

test.describe("optimistic delete", () => {
  test("the row goes immediately, and only that row", () => {
    const state = itemRemoved(ready([item(3), item(2), item(1)]), 2);

    expect(ids(state)).toEqual([3, 1]);
  });

  test("removing a row that is already gone changes nothing", () => {
    // The common case when the same item was deleted on another device: absence from a list response
    // is how that arrives, so the row may already have gone.
    expect(ids(itemRemoved(ready([item(3), item(1)]), 2))).toEqual([3, 1]);
  });

  test("a refused delete puts the row back in the list's own order, not at the front", () => {
    // `created_at DESC, id DESC`. Restoring by a remembered index would be stale the moment anything
    // else landed; re-deriving it from the ordering is correct whatever happened in between.
    const older = item(1, { created_at: "2026-08-01T09:00:00.000Z" });
    const middle = item(2, { created_at: "2026-08-02T09:00:00.000Z" });
    const newer = item(3, { created_at: "2026-08-03T09:00:00.000Z" });

    const state = itemRestored(itemRemoved(ready([newer, middle, older]), 2), middle);

    expect(ids(state)).toEqual([3, 2, 1]);
  });

  test("it restores to the front when the row is the newest", () => {
    const older = item(1, { created_at: "2026-08-01T09:00:00.000Z" });
    const newest = item(9, { created_at: "2026-08-09T09:00:00.000Z" });

    expect(ids(itemRestored(ready([older]), newest))).toEqual([9, 1]);
  });

  test("it restores to the end when the row is the oldest", () => {
    const oldest = item(1, { created_at: "2026-07-01T09:00:00.000Z" });
    const newer = item(4, { created_at: "2026-08-01T09:00:00.000Z" });

    expect(ids(itemRestored(ready([newer]), oldest))).toEqual([4, 1]);
  });

  test("id breaks a tie, exactly as the server's ORDER BY does", () => {
    const first = item(5);
    const second = item(3);

    expect(ids(itemRestored(ready([first]), second))).toEqual([5, 3]);
    expect(ids(itemRestored(ready([second]), first))).toEqual([5, 3]);
  });

  test("it restores behind pending rows, never among them", () => {
    // Pending rows are ordered by when *this browser* created them, not by the server's answer, so a
    // saved row has no position among them.
    const state = itemRestored(ready([item(-1), item(-2), item(1)]), item(4));

    expect(ids(state)).toEqual([-1, -2, 4, 1]);
  });

  test("a row that is somehow still present is not duplicated", () => {
    expect(ids(itemRestored(ready([item(2), item(1)]), item(2)))).toEqual([2, 1]);
  });

  test("status and error are left alone in both directions", () => {
    const removed = itemRemoved(ready([item(1)]), 1);
    expect(removed.status).toBe("ready");
    expect(itemRestored(removed, item(1)).error).toBeNull();
  });
});

test.describe("selectBacklog", () => {
  test("only undated items, in the order they arrived", () => {
    const items = [item(3), item(2, { scheduled_date: "2026-09-01" }), item(1)];

    expect(selectBacklog(items).map((each) => each.id)).toEqual([3, 1]);
  });

  test("a pending undated row is included", () => {
    // T034 captures title-only, so the row it creates is undated by definition — if the drawer did
    // not show it, the optimistic update would be invisible on the only surface that renders it.
    expect(selectBacklog([item(-1), item(1)]).map((each) => each.id)).toEqual([-1, 1]);
  });

  test("everything dated gives an empty backlog", () => {
    expect(selectBacklog([item(1, { scheduled_date: "2026-09-01" })])).toEqual([]);
  });

  test("the input is not mutated", () => {
    const items = [item(2, { scheduled_date: "2026-09-01" }), item(1)];

    selectBacklog(items);

    expect(items.map((each) => each.id)).toEqual([2, 1]);
  });
});

test.describe("groupByScheduledDate", () => {
  test("indexes dated items by their day", () => {
    const grouped = groupByScheduledDate([
      item(3, { scheduled_date: "2026-03-17" }),
      item(2, { scheduled_date: "2026-03-01" }),
      item(1, { scheduled_date: "2026-03-17" }),
    ]);

    expect([...grouped.keys()].sort()).toEqual(["2026-03-01", "2026-03-17"]);
    // Insertion order inside a day is the server's order — newest-created first — because the grid
    // shows only the first two chips and a remainder count, so *which* two is a product decision.
    expect(grouped.get("2026-03-17")!.map((each) => each.id)).toEqual([3, 1]);
  });

  test("and it is the exact complement of selectBacklog", () => {
    const items = [
      item(3, { scheduled_date: "2026-03-17" }),
      item(2),
      item(1, { scheduled_date: "2026-03-01" }),
    ];

    // US2 scenario 4 — "no item appears in both" — as a partition rather than as two filters that
    // happen to agree. Every item is in exactly one side, and nothing is lost between them.
    const dated = [...groupByScheduledDate(items).values()].flat().map((each) => each.id);
    const undated = selectBacklog(items).map((each) => each.id);

    expect([...dated, ...undated].sort()).toEqual([1, 2, 3]);
    expect(dated.filter((id) => undated.includes(id))).toEqual([]);
  });

  test("a day nobody scheduled is simply absent", () => {
    // The grid asks for 42 days and takes what it finds, so an empty map entry per empty day would be
    // 42 allocations to say nothing. `undefined` is the answer, and `MonthGrid` shares one frozen
    // empty array for it.
    expect(groupByScheduledDate([item(1)]).get("2026-03-17")).toBeUndefined();
    expect(groupByScheduledDate([]).size).toBe(0);
  });
});

test.describe("selectByPlatform", () => {
  test("null returns every item, and the same array", () => {
    // Identity rather than a copy: the filter is off almost all of the time, and every surface calls
    // this on every render. A `[...items]` here would allocate the whole list on each one.
    const items = [item(1, { platform: "tiktok" }), item(2)];

    expect(selectByPlatform(items, null)).toBe(items);
  });

  test("one platform returns only that platform's items, in order", () => {
    const items = [
      item(3, { platform: "youtube" }),
      item(2, { platform: "tiktok" }),
      item(1, { platform: "youtube" }),
    ];

    expect(selectByPlatform(items, "youtube").map((each) => each.id)).toEqual([3, 1]);
  });

  test("an item with no platform is excluded by every filter", () => {
    // US4 scenario 4, and the assertion that would fail if `null` were ever treated as "undecided,
    // so show it anyway". Tempting reading, and the spec refuses it — an unplatformed idea is
    // reachable by clearing the filter, which is what T062's empty state exists to offer.
    const items = [item(1), item(2, { platform: "tiktok" })];

    for (const platform of ["tiktok", "instagram", "youtube"] as const) {
      expect(selectByPlatform(items, platform).map((each) => each.id)).not.toContain(1);
    }
  });

  test("and clearing the filter brings it back", () => {
    // US4 scenario 2, plus the control for the test above: without it, "not visible under any
    // filter" would be just as green against a function that returned nothing at all.
    const items = [item(1), item(2, { platform: "tiktok" })];

    expect(selectByPlatform(items, null).map((each) => each.id)).toEqual([1, 2]);
  });

  test("a platform nothing targets gives an empty list", () => {
    // What T062 draws its empty state from. An empty array, never null — a caller that has to
    // distinguish "no items" from "no answer" is a caller with two empty states to render.
    expect(selectByPlatform([item(1, { platform: "tiktok" })], "youtube")).toEqual([]);
  });

  test("a pending row is filtered on its platform like any other", () => {
    // A pending row is a real `ContentItem` with a negative id, so it needs no case of its own here.
    // Worth pinning anyway: capture is title-only (T034), so a pending row's platform is always null
    // and an active filter therefore hides the item the creator has just captured. That is correct —
    // it matches what a reload would show — and it is exactly the kind of behaviour someone would
    // later "fix" by special-casing `isPending` into this function.
    expect(selectByPlatform([item(-1), item(1, { platform: "tiktok" })], "tiktok")).toHaveLength(1);
  });

  test("it composes with selectBacklog in either order", () => {
    // The drawer takes items the shell has already filtered, then narrows to the undated ones. Both
    // are pure filters over one list, so the order cannot matter — asserted rather than assumed,
    // because `CalendarShell` picks one order and the drawer picks the other.
    const items = [
      item(3, { platform: "tiktok" }),
      item(2, { platform: "tiktok", scheduled_date: "2026-03-01" }),
      item(1, { platform: "youtube" }),
    ];

    const filteredThenBacklog = selectBacklog(selectByPlatform(items, "tiktok"));
    const backlogThenFiltered = selectByPlatform(selectBacklog(items), "tiktok");

    expect(filteredThenBacklog.map((each) => each.id)).toEqual([3]);
    expect(backlogThenFiltered.map((each) => each.id)).toEqual([3]);
  });

  test("the input is not mutated", () => {
    const items = [item(2, { platform: "tiktok" }), item(1)];

    selectByPlatform(items, "tiktok");

    expect(items.map((each) => each.id)).toEqual([2, 1]);
  });
});

test.describe("isValidPublishedUrl", () => {
  /*
   * This predicate has two callers with opposite failure modes, which is why it is one function.
   *
   * T065 builds an `<a href>` from it, so anything it wrongly *accepts* becomes a live link — the
   * `javascript:` case below is the one that matters there. T066 gates the save on it, so anything it
   * wrongly *rejects* is a value the API would have stored and the client refused — invisible from
   * the backend suite, and the direction T063 warned about when it characterised a bare scheme as
   * accepted rather than tightening it. Both directions are asserted here.
   */

  test("accepts the two schemes the contract's pattern names", () => {
    expect(isValidPublishedUrl("https://www.tiktok.com/@creator/video/74012345678")).toBe(true);
    expect(isValidPublishedUrl("http://example.com/post")).toBe(true);
  });

  test("accepts a bare scheme, because the contract does", () => {
    // T063 pinned this on the backend deliberately: `format: uri` is a JSON Schema *annotation* that
    // validators need not enforce, so `^https?://` is the whole of the machine-checkable rule.
    // Tightening it is a `contracts/openapi.yaml` amendment first — not a client-side opinion.
    expect(isValidPublishedUrl("https://")).toBe(true);
  });

  test("refuses every scheme that is not http(s)", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "//evil.example.com",
      "www.tiktok.com/@creator",
      "",
    ]) {
      expect(isValidPublishedUrl(url), url).toBe(false);
    }
  });

  test("the scheme must be at the start, not merely present", () => {
    expect(isValidPublishedUrl("javascript:https://ok.example.com")).toBe(false);
  });

  test("bounds the length at the contract's 2048, inclusive", () => {
    const prefix = "https://example.com/";
    const at = prefix + "a".repeat(2048 - prefix.length);
    expect(at.length).toBe(2048);

    expect(isValidPublishedUrl(at)).toBe(true);
    expect(isValidPublishedUrl(at + "a")).toBe(false);
  });
});
