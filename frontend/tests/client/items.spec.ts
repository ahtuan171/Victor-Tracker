import { expect, test } from "@playwright/test";

import type { ContentItem, ContentItemCreate } from "@/lib/api";
import {
  INITIAL_ITEMS_STATE,
  isPending,
  itemsFailed,
  itemsLoaded,
  makePendingItem,
  pendingItemInserted,
  pendingItemReconciled,
  pendingItemRolledBack,
  groupByScheduledDate,
  selectBacklog,
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
