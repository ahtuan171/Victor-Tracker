# Retro 05 — Travel Log (v0.5)

**Feature**: `specs/005-travel-log` · **Written**: 2026-08-21 (workflow.md stage 8, run late and, for
this iteration, run essentially from scratch after the fact — see §2) · **Not deployed** — same
standing policy as every prior iteration.

13 tasks (T001–T013 as ticked in `tasks.md`), 3 phases plus a Final Phase, **2 merge requests total**.
This is the smallest iteration by task count so far — no backend changes, no new columns, exactly the
scope `.claude/memory.md`'s Deferred section predicted when it ranked this item first: "re-presents
data the surfaces already load."

This retro is structured differently from `retro-01` through `retro-04`, and that difference is the
main thing it has to report. The other four each found genuine defects inside careful process. This
one has to report that the process itself mostly did not happen, and say so without softening it,
because that is what §1.3 of `retro-03.md` already established this document is for.

---

## 1. Shipped behaviour against the spec

**Where the evidence comes from — and this is already the first finding.** Unlike every prior
iteration, **no hand-walk script exists for `005`.** `frontend/scripts/` holds `t031-walk.mjs`
(`004`), `t044-walk.mjs`, `t056-walk.mjs` (`003`) and `t072-walk.mjs` (`001`) — no `t0NN-walk.mjs` for
this feature, and `tasks.md`'s Final Phase (T011–T013) contains a viewport-audit extension, a
lint/typecheck run, and an `/speckit-analyze` pass — no hand-walk task at all. `specs/005-travel-log/
quickstart.md` defines four scenarios (V1–V4) that no script and no recorded session ever walked.

**This is not a paperwork gap.** `.claude/memory.md`'s own Traps section states the reason in the
form that matters: "every automated frontend test stubs the proxy... a fully green frontend run says
nothing about whether the browser → proxy → FastAPI → Postgres path works... hand-walk the quickstart
at every phase checkpoint." `retro-03.md` restated it as recommendation 5, two days before this
iteration opened: "Run all three gates, every time... This is no longer a hypothesis." `005` ran one
of the three.

What evidence does exist: `frontend/tests/e2e/travel-log.spec.ts` (V1–V4 as automated Playwright
scenarios, all passing per the merged pipeline), `frontend/tests/client/log.spec.ts` (unit coverage
for `sortDestinationsForLog`), and the `/map` block `viewport-audit.spec.ts` already carries, extended
to include `TravelLogDrawer`/`TravelLogCard`. **All of that is real and passing.** What it cannot
speak to, per the trap above, is the seam a stubbed proxy cannot exercise — the same gap `001`'s early
sessions had before T072, and the same gap this project's own memory file exists to prevent recurring.

### 1.1 Success criteria

| | Criterion | Result | Evidence |
|---|---|---|---|
| **SC-001** | Owner can scan all places in time order without closing the timeline | **PASS (by suite)** | `travel-log.spec.ts` V1; no hand-walk |
| **SC-002** | Filtering updates <1s, no server round trip | **PASS (by suite)** | client-side filter, `log.spec.ts`; not independently timed |
| **SC-003** | Fully usable at 375px, 44px tap targets | **PASS (by suite)** | `viewport-audit.spec.ts`'s extended `/map` block |
| **SC-004** | Zero new columns or tables | **PASS** | confirmed — no migration exists, `git log backend/alembic/` shows nothing since `003` |

Four criteria, all narrower and more mechanically checkable than any prior iteration's — this is a
genuinely low-risk feature, which is very likely *why* the process shortcuts did not surface as a
production defect. That is a reason the gap was survivable, not a reason it was correct to leave it.

### 1.2 Functional requirements

All 7 (FR-001–FR-007) are realised per the automated suite. No functional requirement's evidence rests
on anything this retro can independently verify beyond re-reading the same suite that was already
green at merge time — there is no second, independent source the way `004`'s hand-walk was independent
of `004`'s own Playwright suite.

### 1.3 One correction landed the same week, on wording only

MR !122 (`fix/rename-log-to-collection`, `9e9e6fc`) changed the UI-facing label from "Travel Log" to
"Collection" in `MapShell.tsx` and `TravelLogDrawer.tsx` — cosmetic, no behavioural change, no new
test. Worth naming only because `specs/005-travel-log/`'s own files — `spec.md`, `tasks.md`,
`data-model.md`, the directory name itself — still say "Travel Log" throughout, and the file/feature
name and the on-screen word are now different by design in the same way `002`'s "Victor Tracker"
brand-text rename left infrastructure names lagging deliberately. **Not a defect**, but worth recording
so a future session does not read "Travel Log" in a spec and "Collection" on screen and conclude one
of them drifted by accident.

---

## 2. Process

### 2.1 The whole iteration — spec, plan, tasks, and all 13 tasks of implementation — landed in one
commit, in one merge request

`git log` shows exactly two merges for this entire feature: `b1a2234` (`feature/005-t001-t006-travel-
log-core`, a single commit `93e023d` containing `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`quickstart.md`, `tasks.md`, the requirements checklist, **and** `TravelLogCard.tsx`,
`TravelLogDrawer.tsx`, `lib/log.ts`, both test files, and the `MapShell.tsx` wiring — 14 files, 893
insertions) and `726927b` (the wording fix above).

This breaks two rules at once, not one:

- **`.claude/rules/workflow.md`'s Branch strategy**, step 2: "Merge that branch to `main` as soon as
  stage 1 finishes, **before implementation**. Specs belong on `main`... a spec stranded on a feature
  branch cannot be the source of truth." Every prior iteration did this as its own merge — `004`'s
  spec-only merge is `110aa87`, visibly separate from any implementation commit. `005` has no such
  commit; the spec became "the source of truth" and got implemented against in the same breath.
- **`tasks.md`'s own working agreement, "one task, one merge request."** `003`'s retro already recorded
  this rule eroding under bundling (up to 13 tasks in one MR) and named it as unrecorded drift worth
  fixing. `005` did not erode the rule further — it went past bundling entirely into a shape the rule
  was never written to describe: **one MR for the whole iteration**, plan and code together.

**Naming what this cost, honestly: apparently nothing, this time.** The pipeline for !121 passed, the
suite is green, `pnpm lint`/`tsc` are clean, and hand-re-reading the diff for this retro found no
functional defect. The branch name (`feature/005-t001-t006-travel-log-core`) itself is a residual
symptom — it names six of the thirteen tasks that ended up in it, which reads as though the scope grew
after the branch was named and nobody renamed the branch to match, the same shape as a stale claim
surviving because nothing forced a second look.

**Why this is still the finding this retro leads with, rather than a victimless shortcut**: the value
of "one task, one MR" was never "each individual bundling is dangerous" — `003`'s retro said the
opposite, that task-adjacent bundling is often defensible. The value is that **a small, reviewable
diff is where a `reviewer`-agent-shaped finding gets caught before merge**, and a 14-file, 893-line,
spec-and-code-together diff is exactly the size at which a reviewer pass either does not happen (see
§2.2) or does happen but has to hold the whole iteration in view at once to say anything useful. The
discipline is a precondition for the safety net working, not a formality sitting on top of it.

### 2.2 No `reviewer` agent pass is recorded, and no pre-implementation `/speckit-analyze` pass either

`004`'s Final Phase explicitly separates T032 (`/speckit-analyze`) from T033 (`reviewer`), each with
its own findings recorded inline. `005`'s Final Phase has **T013: "Run `/speckit-analyze` against
spec.md/plan.md/tasks.md before implementation"** — one task, no reviewer task at all, and no findings
recorded against T013 either in `tasks.md` or in either MR's description. It is not possible to tell
from the artifacts whether `/speckit-analyze` surfaced nothing, or was not actually run and the
checkbox was ticked against the plan rather than a result — and that ambiguity is itself the point:
`003`'s retro (§2.5) already recorded a near-miss of exactly this shape, where a checkbox and its
literal text were read as satisfying a claim they did not verify. This retro cannot rule that out
after the fact, which is a weaker position than every prior retro was in.

**`retro-03.md`'s own closing recommendation, written two days before this iteration opened**: "Run
all three gates, every time... This is no longer a hypothesis." `005` is the first iteration since
that sentence was written, and the first to run zero of the three with any surviving evidence.

### 2.3 Scope held

Cost, companions, transport, ratings and reviews are all named out of scope in `spec.md`'s own opening
section, and none of them appeared. Time-of-day and social sharing are named and excluded too, citing
the same standing exclusions `004` and `003` already carry. **This half of the discipline held even
where the process half did not** — worth stating plainly rather than letting the process finding above
read as though the whole iteration was undisciplined.

### 2.4 Stage 8 did not happen for two days, for either `004` or `005`

Covered fully in `retro-04.md` §2.5; the same gap applies here and compounds it — `004`'s Final Phase
closed the morning of 2026-08-19 (`c1afe25`) and `005` was built and merged that same afternoon, on
top of a `004` that already had no retro, no tag, and no `CHANGELOG.md` entry. Neither `CLAUDE.md` nor
`CLAUDE.local.md` was updated to reflect either iteration's completion until this session, two days
later.

---

## 3. What to do differently

1. **The spec-stage merge is not optional scaffolding — merge it before writing the first line of
   implementation, every time**, exactly as `.claude/rules/workflow.md` already states. `005` is the
   counter-example that shows what skipping it produces even when nothing breaks: an un-auditable diff
   and a branch name that stops describing its own contents.
2. **A Final Phase without a `reviewer` task is not a smaller Final Phase, it is a missing gate.**
   `004`'s Final Phase is the template to copy, task for task, regardless of how small the feature
   looks — SC-count is not a proxy for risk, and this iteration's own low SC count is precisely why its
   gaps did not surface, not evidence they were safe to skip.
3. **A hand-walk task belongs in every Final Phase**, even for a frontend-only, no-migration feature.
   The trap it guards against — a stubbed proxy hiding a real seam defect — does not care whether the
   backend changed.
4. **When a task's checkbox is ticked with no note attached, that is worth treating as "unknown"
   rather than "done with nothing to report.**" Every other Final Phase task in this project's history
   that ran clean still says so ("Verification note: both clean, no fixes needed" — `004` T030). Its
   absence here is not proof of a problem, but it removes the ability to rule one out, which this retro
   had to say explicitly rather than assume.
5. **Actually walk `quickstart.md` V1–V4 before this retro is treated as closing the loop.** This
   retro documents the gap; it does not discharge it. A `t0NN-walk.mjs` script and a real run against
   the compose backend is still owed, the same shape `003`'s R2 gap was recorded as owed rather than
   quietly dropped.

---

## 4. Where this leaves the product

Five iterations, four tags at this session's end — `v0.5.0` is cut alongside this retro, at `726927b`
(current `main` HEAD, the wording-fix commit — the last point at which `005`'s scope was complete).
**413 backend tests unchanged, 640 frontend tests across four Playwright projects on `main`, none
skipped.** The map now has a second, temporal way to read the same data it already draws spatially.

**Newly owed, from this retro**: hand-walk `005`'s `quickstart.md` V1–V4 against a real backend and
record the result, the same discipline every other iteration already has on file.

**Still owed, unchanged from `003`/`004`**: provision Cloudflare R2 and re-run the photo-upload walk;
rotate `SEED_CREATOR_PASSWORD`.

**Not scheduled**: `.claude/memory.md`'s Deferred section. The ranked shortlist's top item (Travel Log)
is now built; the full-screen photo viewer is next on that list, followed by Destination
category/priority.
