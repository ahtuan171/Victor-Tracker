# Retro 04 — Opening a Place (v0.4)

**Feature**: `specs/004-place-detail-panel` · **Written**: 2026-08-21 (workflow.md stage 8, run late —
see §2.5) · **Not deployed** — same standing policy as every prior iteration: the `deploy` jobs stay
manual, and pushing to the live Render/Vercel environment is a separate, deliberate step after the tag.

34 tasks (T001–T034 as ticked in `tasks.md`; T007–T009 renumbered once mid-plan so the true count is
34 rather than the 32 the plan opened with), 8 phases, roughly 20 implementation merge requests
(`e038851`…`c1afe25`) plus the spec-stage merge (`110aa87`) and a deferred-input docs merge
(`ee4b7e1`). This is the iteration that made two of the map's three pin statuses worth opening.

---

## 1. Shipped behaviour against every acceptance criterion

**Where the evidence comes from.** T031 hand-walked `quickstart.md` V1–V6 twice for stability against
a real production build (`pnpm build && pnpm start`, real dev Postgres, real backend), authenticated
with a minted token rather than the seed password. **19/19 scenarios passed.** The walk script,
`frontend/scripts/t031-walk.mjs`, is re-runnable.

### 1.1 Success criteria

| | Criterion | Result | Evidence |
|---|---|---|---|
| **SC-001** | Owner can still see which pin is open, without closing the detail | **PASS** | T031 V1; `place-selection.spec.ts` |
| **SC-002** | Opening the wrong place costs at most one dismissal, never a full screen | **PASS** | T031 V2; `place-detail.spec.ts` |
| **SC-003** | Each of the three statuses opens to distinct content, none blank | **PASS** | T031 V3–V5; `VisitedPanel`/`PlannedPanel`/`WishlistPanel` each their own component |
| **SC-004** | A Planned place shows its Trip, range and siblings without navigating away | **PASS** | T031 V4 |
| **SC-005** | Every new surface fully usable at the 375px floor | **PASS** | T029's `/map` block added to `viewport-audit.spec.ts` — the sweep `003` never extended to the map at all |
| **SC-006** | Marking a new place still ≤ 3 interactions | **PASS** | unchanged — this iteration touches opening, not capture |
| **SC-007** | No place gains a recorded field it did not have | **PASS** | no migration, no new column, confirmed by `data-model.md`'s own "No new entities" line |

**All seven pass**, with one caveat inherited rather than introduced here: **T031's V3 (Visited
gallery) carries the same R2 gap `retro-03.md` recorded** — no photograph has ever been uploaded to
real object storage, so "at least one photograph" was walked with a note only. The photo-*grid
rendering* stays covered by the stubbed suite. This iteration did not make the gap worse and did not
fix it either; it is still owed, unchanged.

### 1.2 Functional requirements

All 24 are realised (FR-001–FR-024). Three worth commenting on beyond the traceability table:

- **FR-020 (status always saves, even with a newly-asked field left empty) is the sharpest
  requirement in this spec**, because it is a promise not to narrow `003`'s FR-028 guarantee as a side
  effect of a form. It held — T034's suite includes the case explicitly, and no validation path
  refuses a save on an empty new field.
- **FR-004 (dismissing a selection leaves the map where it is)** is the one edge case a naive
  implementation gets backwards — the instinct is to snap back to the previous view. It does not, and
  T031 V1 confirms it by camera-position comparison, not just visually.
- **FR-016 (gallery/note never offered outside Visited)** had no negative assertion until the
  pre-implementation `/speckit-analyze` pass caught it (§1.3) and added one to T022/T025. Worth noting
  because it is structurally true by construction — `PlannedPanel`/`WishlistPanel` never import that
  UI — and this project has already learned once, in `003`, that "true by construction" and "verified"
  are not the same claim.

### 1.3 Two `/speckit-analyze` passes, one before code and one before merge

**Before any code** (2026-08-17): four findings, none CRITICAL — two wrong task-ID
cross-references (T012 cited T020/T023, the real tasks are T021/T024), FR-021/SC-005 had no task
(added T029), the 44px overlap-detection radius was never pinned to a number (fixed in
`research.md`/`data-model.md`), FR-016 had no negative assertion (added to T022/T025). All fixed in
the same pass, none carried into implementation.

**Before merge** (T032): two HIGH findings, both `spec.md`'s Edge Cases stating a plain resolution the
shipped code did not implement — **E1**, a place deleted elsewhere while its sheet is open (`spec.md`
says "the panel closes"; the code showed an in-sheet error and stayed open), and **E2**, the selected
place filtered out by the status filter (`spec.md` says "the selection is cleared"; `selectedId` was
independent of `statusFilter` entirely). Both are exactly the failure mode `.claude/memory.md`
documents repeatedly — a stale claim is dangerous in the spec-outranks-code direction, but here the
*code* was the one that had drifted from an already-correct spec, which is the less common but equally
real half of the same discipline.

**Then the fix itself shipped incomplete, and the `reviewer` agent is what caught it (T033).** E1's
first fix closed the sheet on a 404 but never reloaded `MapShell`'s destination list and never cleared
`selectedId`/`confirmingId` — so a deleted-elsewhere place's pin stayed on the map, still rendered as
selected, indefinitely. The test that shipped with the first version only asserted the sheet closed,
never that the pin actually cleared. Fixed in the same MR (!120, second commit), tightened with a
mutable-list fixture so the gap could not pass by accident a second time.

**This is the fourth iteration running where the `/speckit-analyze` + `reviewer` combination finds
something the other misses**, and the first where it happened *inside a single task* rather than
across the whole Final Phase — T032 found what the code was missing, T033 found what T032's own fix
was missing. Two gates on one fix, not just two gates on one iteration.

---

## 2. Process

### 2.1 One genuine owner reversal, twice in the same session

`MINIMUM_SELECTION_ZOOM` moved **14 → 16** at T009's own follow-up (street-level, at the owner's
explicit request against reference images) and then **16 → 14** at T034, in the same session, because
street-level read as tighter than wanted once seen in practice. Both directions are recorded at their
respective tasks rather than silently overwritten — worth naming because a constant that moves twice
in one session looks like indecision in a diff and is actually two informed calls, and the second one
is the one that shipped.

### 2.2 Scope held; the deferred list was written down before code, not after

Cost, travel companions, a scheduled itinerary, and merging Trip into Place were all named out of
scope in `spec.md`'s own "Why this iteration" section, with a stated reason for each, before
`/speckit-tasks` ran. None of them appeared in the 34 tasks. This is the discipline `003`'s retro
recommended (§3.1 there: "decide what a rule is and write it down") applied one level up — not to MR
granularity this time, but to scope itself.

### 2.3 MR granularity held closer to one-task-one-MR than `003` managed

Roughly 20 implementation MRs for 34 tasks — several single-task (T001, T002, T003, T016, T031), a few
bundled where the bundling is the same defensible shape `003`'s retro already accepted (a component
and the task that wires it landing together: T012–T015 as `VisitedPanel`, T019–T022 as `PlannedPanel`,
T023–T025 as `WishlistPanel`). **No MR bundled an entire phase**, unlike `003`'s thirteen-task !93.
This is the corrective `003`'s retro asked for (§3, item 2) — not written down as a new rule anywhere,
but demonstrated in the history, which is a weaker form of the same fix and worth naming as such: the
next iteration should not have to reconstruct this from `git log` the way this retro just did.

### 2.4 A hand-walk bug that was in the walk script, not the app, and cost real dev data

T031's walk found the dev database already carries the owner's own real Destinations spanning nearly
the whole globe, so `fitBoundsOnce`'s initial camera sits at a near-world zoom regardless of where the
walk's own fixtures land — two markers genuinely far apart in the real world rendered within a few
screen pixels of each other at that zoom, and a naive `{force: true}` click silently selected the
*wrong* pin three separate times before this was diagnosed. Fixed with a `zoomInUntilSeparated` helper
(scroll-zoom centred on the pins' own midpoint) and by never seeding a scenario's fixtures until the
previous scenario's are cleared.

**Same family as `003`'s retro §2.8**: a verification tool that fails quietly is worse than no
verification tool, and the fix in both cases was the same shape — stop trusting a fixed geometry or a
fixed delay, and poll for the thing itself.

### 2.5 This retro is being written two days late, and that is itself the finding for §3

`004`'s spec-only merge landed 2026-08-17 06:36 UTC (`110aa87`) and implementation began the same
morning (`e038851`, 07:15); the session then broke and resumed, and the Final Phase closed
2026-08-19 09:54 UTC (`c1afe25`). `005-travel-log` was built entirely later the same day, 14:07–15:12
UTC — meaning **`004` and `005` both finished on 2026-08-19**, with `005` landing on top of a `004`
that was already fully shipped but not yet tagged or retro'd. No `v0.4.0` tag existed, `CHANGELOG.md`
was never touched, and `CLAUDE.md`/`CLAUDE.local.md` continued asserting `004` was still at "Stage 1,
nothing built" for the next two sessions after it had, in fact, fully shipped — including through the
whole of `005`'s build. This retro and `retro-05.md` are both being written together on 2026-08-21,
out of order relative to when the work happened, because Stage 8 was skipped in place at the time
rather than merely delayed.

---

## 3. What to do differently

1. **Tag and update `CHANGELOG.md` at the same session a Final Phase closes**, not later. `004`'s own
   Final Phase (T029–T034) finished cleanly with a hand-walk, two analyze passes and a reviewer pass —
   every input Stage 8 needs was already sitting there for four days before anyone read it back.
2. **A status-tracking file (`CLAUDE.md`, `CLAUDE.local.md`) that says "nothing built yet" needs to be
   falsifiable in one command.** `git log --oneline main | grep 004` would have contradicted the claim
   in `CLAUDE.local.md`'s "Current focus" section on the very next session. The fix is procedural: the
   first action of a session that opens a status file should be a one-line sanity check against
   `git log`, not trust in the file's own prose — which is exactly the "executable artifact outranks
   prose" rule `.claude/memory.md` already states for a different kind of drift.
3. **The two-analyze-passes-plus-reviewer pattern is worth keeping as the default**, not just for `003`
   sized iterations. It caught a genuinely incomplete fix inside a single task here, not just at a
   phase boundary.

---

## 4. Where this leaves the product

Four iterations, three tags so far — `v0.4.0` is cut alongside this retro, at `c1afe25`, the commit
where T034 (the last task) landed. **413 backend tests, 640 frontend tests across four Playwright
projects on `main`, none skipped** (`pnpm lint` and `pnpm exec tsc --noEmit` both silent). Two-thirds
of the map's pin statuses now open to real content instead of a near-empty sheet.

**Still owed, unchanged from `003`**: provision Cloudflare R2 and re-run the photo-upload walk; rotate
`SEED_CREATOR_PASSWORD`.

**Not scheduled**: `.claude/memory.md`'s Deferred section, ranked shortlist unchanged. `005-travel-log`
was picked up next and is covered in `retro-05.md`.
