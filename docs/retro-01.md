# Retro 01 — Content Calendar (v0.1)

**Feature**: `specs/001-content-calendar` · **Written**: 2026-08-05 (workflow.md stage 8) ·
**Shipped**: [victor-tracker-at.vercel.app](https://victor-tracker-at.vercel.app), backend on Render,
database on Neon.

77 tasks, 8 phases, 55 merge requests, 271 backend and 432 frontend tests. One module of four.
The product is what `spec.md` said it would be, with **one acceptance criterion failing** — SC-001
cold, for reasons that are the hosting tier rather than the design.

This document does three things, in order: it checks shipped behaviour against **every** acceptance
criterion; it records the process facts stage 8 requires; and it says what to do differently in
002.

---

## 1. Shipped behaviour against every acceptance criterion

**Where the evidence comes from.** Every row below is backed by the T072 walk against the **deployed**
environment (browser → Vercel → Render → Neon, nothing stubbed), by the test suite, or by both. Where
they disagree the walk wins, and the reason is the rule this project learned the hard way: **every
automated frontend test stubs the proxy**, because CI has no FastAPI behind it, so a green suite is
evidence about the frontend *in isolation* and never about the seam.

### 1.1 Success criteria (spec.md §Success Criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| SC-001 | Capture in <15s and ≤3 interactions | **FAILS COLD, HOLDS WARM** | 3 interactions, **1.89s warm**; **47.27s** on the first interaction of the day. See §1.2. |
| SC-002 | `idea` → `posted` with zero navigations to a detail page | **PASS** | T072 V4: the URL never changed across the whole journey. |
| SC-003 | Month, week and backlog fully usable at 375px, no horizontal body scroll | **PASS** | T072 V6: five surfaces, body 375/375, **zero** controls off screen. |
| SC-004 | Status identifiable without distinguishing red from green | **PASS** | T072 V3: greyscale screenshot inspected — hollow / half / solid fill, plus a dashed border for overdue. |
| SC-005 | Filter applies or clears in <1s, no full reload | **PASS** | T072 US4: 5 chips → 1 → 5 restored in **0.44s**. |
| SC-006 | Signed-out visitor gets no content data at any address | **PASS** | T072 V1: `/` and `/calendar` 307 to `/login`, **no item title in any body**, `/api/content-items` 401. |
| SC-007 | No deletion without explicit confirmation | **PASS** | T072 V7: confirmation required; "keep" left the item intact. |
| SC-008 | 5 undated ideas onto days in <60s | **PASS** | T072 V9: **3.25s** — a twentieth of the budget. |
| SC-009 | Date, status, platform and link changes survive a reload | **PASS** | T072 V8: persisted across a reload **and a real sign-out/sign-in**. |
| SC-010 | Intermittent use does not force a re-login within 30 days | **PASS BY CONSTRUCTION, UNPROVEN BY OBSERVATION** | See §1.3 — this is the one criterion no gate can honestly close. |
| SC-011 | Full journey completable with no drag; scheduling also works by drag, same end state | **PASS** | T072 V4 (taps only) and V9 (drags) reached the same state; `tests/e2e/pipeline.spec.ts` completes the journey **by keyboard**, which cannot produce a drag. |
| SC-012 | A title-only item can gain a platform and reach `posted` without an unresolvable refusal | **PASS** | T072 V5: platform+status in **one** PATCH → 200; every refusal carries the control that resolves it. |

**Eleven of twelve hold. One fails, and it is recorded unsoftened below rather than rounded off.**

### 1.2 SC-001, the one failure, in full

| Measurement | Value | Budget |
|---|---|---|
| Interactions to capture | **3** | ≤3 ✅ |
| Capture, warm | **1.89s** | <15s ✅ |
| First interaction of the day (cold) | **47.27s** | <15s ❌ |
| `/calendar` document alone, cold | **44.18s** | — |
| Same walk, warm | **3.92s** | — |

**Why it fails, and what it does not mean.** The first request of the day crosses **two** suspended
services: Render's free tier spins down *and* Neon's free tier auto-suspends, and they stack. About
**43 of the 47.27 seconds is that wake-up**. The half of SC-001 the product actually controls — the
interaction count — is **3 either way**, and the capture path itself is 1.89s. So this is a hosting
decision failing a product criterion, not a design failing one.

**It was predicted before it was measured, which is the part worth keeping.** When T071 moved the
database to Neon, `plan.md` recorded that the substitution stacked a second cold start and that the
result would be reported "as measured, including if it fails". It was, and it did. A prediction
written down before the measurement is what made this an expected cost rather than a surprise.

**The remedy is out of scope for v0.1 and is deferred deliberately**: a paid tier, or a keep-warm
ping. Both are operational, neither is a design change. Recorded in `.claude/memory.md` under
Deferred.

### 1.3 SC-010, and why it is the honest exception

SC-010 asks that a creator using the app intermittently is not asked to sign in again **within 30
days**. Nothing shipped can *observe* that in a day: it is a claim about a month.

What is proven: the token's TTL, the sliding reissue past half-life, the `X-Access-Token` header, the
proxy's cookie rewrite, and the `Max-Age` derived from the token's own `exp` are each unit- and
contract-tested, and T072 V8 confirmed a real sign-out and sign-in against production. What is not
proven is the passage of 30 days. **Stated as "correct by construction, unobserved" rather than
ticked**, because a criterion marked PASS on a mechanism rather than an observation is exactly the
kind of citation-shaped evidence §2.2 is about.

### 1.4 User story acceptance scenarios

All five stories' scenarios were walked. **Every one holds.** The ones worth naming are those where
shipped behaviour is *stricter* than the scenario, or where the scenario needed a decision:

| Scenario | Result |
|---|---|
| US1.2 — empty title refused, told a title is required | **PASS, and stricter than written.** The save control is `disabled` while the title is empty, so the refusal happens *before* a request rather than after one. T072's first pass recorded this as a failure because it tried to click; the product was right and the walk was wrong. |
| US1.3 / US2.4 — dated on the grid, undated in the backlog, never both | **PASS.** `groupByScheduledDate` and `selectBacklog` are a partition over one loaded list, asserted against each other rather than left to agree by coincidence. |
| US3.5 — advancing with no platform is refused, and the creator is told | **PASS.** Verified against the deployed API: 409 `platform_required`, message *"Pick a platform before moving this item out of ideas."* |
| US3.7 — taps only land in the same state a drag would | **PASS.** V4 (taps) and V9 (drags) reached identical states; the keyboard journey in `pipeline.spec.ts` is the mechanical proof no drag was needed. |
| US4.4 — items with no platform hidden by a filter, reachable by clearing | **PASS.** Three empty states are kept distinct: nothing captured, the filter hid everything, and this period is empty. Only the second blames the filter. |
| US5.2 — a `posted` item with no link is valid | **PASS.** The link field is always rendered; only the *prompt* is conditional — a field hidden below `posted` would strand a retained link with no control able to clear it. |

**One scenario is stricter in the product than in the spec and the spec was left alone**: US3.6 says
deletion needs explicit confirmation and must not sit next to a common gesture. What shipped is
**three deliberate taps** with `KEEP ITEM` focused first, no dismissal by clicking outside, and the
destructive action carrying the *lower* visual weight. That exceeds the requirement; exceeding is not
drift, so nothing was amended.

---

## 2. Process facts stage 8 requires

### 2.1 The constitution VI exception, with its exact extent

Constitution principle VI makes `main` merge-request-only. **It was knowingly broken once, over a
bounded range, and this is the record.**

- **25 merge commits** reached `main` with no gate that could have stopped them.
- The range is **T001 through T024** — all 24 task tags appear across those 25 commits.
- Pinned at **`caca814~4`** (`81a1859`). The pin is load-bearing: `git log --merges` now includes the
  real MR merges, so the number means nothing unless anchored to the commit where it was taken.
- **Plus one local fast-forward** that left no merge commit at all: the stage-1 specs
  (`013957a`…`5d37048`). It predates even the local branch-per-task convention, which is why it has
  to be named separately — a count of *merge commits* cannot see it.
- **The gate became real at T025.** `only_allow_merge_if_pipeline_succeeds` was set to `true` and
  `main`'s allowed-to-push dropped to **no one**, both read back from the GitLab API rather than
  taken on trust. `96e60cc` is the first merge that passed it.

**Why it was taken**: with no remote there is no gate to satisfy, and creating the GitLab project
first would have blocked all implementation on an account setup that blocked nothing else.
Implementation still used one branch per task merged `--no-ff`, so the history has the shape the MR
flow later produced.

**There is no second exception.** When the free-tier CI compute quota ran out mid-pipeline on
2026-08-02, the answer was a **project-owned runner** — which does not draw on the shared quota —
rather than a relaxed gate. Every change since T025 has merged behind a green pipeline: **MRs !1
through !55**.

> **This section is itself a finding, twice over.** **Five** artifacts — `CLAUDE.md`,
> `.claude/memory.md`, `plan.md`, `CLAUDE.local.md` and `CHANGELOG.md` — stated the range as
> "**T008** through T024". The count (25) was right and the range was wrong; the merges start at
> **T001** (`299b496`). All five are corrected in the same merge request as this retro. That it was
> the *exception record itself* that had drifted, in the artifact set whose whole job is to carry it,
> is the sharpest possible illustration of §2.3.
>
> **The second finding is how the fifth one was nearly missed, and it happened while writing this
> section.** The first grep was scoped to the files that *seemed* likely — `CLAUDE.md`, `.claude/`,
> `specs/`, both `AGENTS.md` — and found four. `CHANGELOG.md` was not in that list and carried the
> same sentence; it surfaced only on an unscoped, repo-wide search afterwards. **A grep narrowed by
> intuition about where a claim lives reproduces the very defect it is run to catch**, because the
> artifact you forget to search is by definition the one you were not thinking about. The rule in
> `.claude/memory.md` says "grep the claim across `specs/` and both `AGENTS.md`" — that enumeration is
> now demonstrably too narrow. **Search the whole repository, then filter the hits.**

### 2.2 Two gates, twelve findings, zero overlap

At T074 both review gates were run over the whole feature:

- **`/speckit-analyze`** — **9 findings**
- **the `reviewer` agent** — **3 findings**
- **findings appearing in both lists: 0**

**They are not substitutes, and the reason is structural.** `analyze` reads artifacts *against each
other*, so it caught the stale claims **inside** `specs/`. The reviewer reads artifacts *against the
world*, so it caught the ones about deployment and CI — a contract naming a hostname that does not
exist, a CI file describing jobs as placeholders after they had fired. Neither can see the other's
class of defect. **All twelve were documentation drift; not one was in application code, and no test
changed.**

This is the second time the point has been made concretely. The first was earlier and sharper:
`/speckit-analyze` once reported **95% requirement coverage** on a `tasks.md` containing six blocking
gaps, including one that left every content item permanently stuck in `idea`. **Coverage counts
whether a requirement is *cited* by a task, not whether the tasks compose into something that
works.**

The same failure hid the sign-out gap for 76 tasks: FR-002a *is* cited — by **T018, a backend test** —
so coverage read 100% while nothing in the product could sign out. It took the Phase 7 checkpoint to
find it, and it became **T077**.

### 2.3 `contracts/openapi.yaml` took a finding at five consecutive checkpoints

Phase 4 (CRITICAL) → Phase 5 (HIGH) → Phase 6 (MEDIUM) → Phase 7 (MEDIUM) → T074. **Five for five.**

This is not bad luck, and treating it as bad luck is what let it run to five. The contract is
**the artifact least often opened while building a surface, and the one that outranks code when
someone does open it** — so a wrong sentence there survives longest and is obeyed hardest. `specs/`
outranking code means a stale spec gets *obeyed* where stale code gets caught by a test.

The five are worth distinguishing because each defeated a different defence:

| Checkpoint | Shape of the defect | What it defeated |
|---|---|---|
| Phase 4 | A claim overturned in `tasks.md` left standing in the contract — which had come to **contradict itself four lines apart** | "Fix the file you have open." A document that disagrees with itself is believed at whichever line the next reader opens. |
| Phase 5 | A missing default | Review of code against specs. |
| Phase 6 | A **true conclusion resting on a wrong reason** | "Check the conclusion." The reason is the load-bearing half, because it is what a future agent consults about a parameter that does not exist yet. Read literally it licensed exactly what it forbade. |
| Phase 7 | A **silence** — the contract never said which of `format: uri` and `pattern` it enforced, so the client guessed a subset and shipped a validator stricter than the API | **Grep. Grep finds a wrong sentence; it cannot find an absent one.** |
| T074 | A `servers:` block naming a hostname that never existed | Everything, because nothing consumes it — but Render answers an unknown host with a 404 *byte-identical* to the proxy's own misconfiguration 404, so it is a loaded trap for the next person verifying production. |

**The rule that came out of it**, and it is the single most expensive lesson in this iteration:
**an amendment applied to one artifact is not applied.** Grep the claim across `specs/` and both
`AGENTS.md`, and fix every artifact in the same merge request. Two refinements paid for separately:

- **When a grep comes back split, the tiebreaker is the *executable* artifact, never the count.** At
  T057 four artifacts said the Playwright config runs `next dev` and one line of
  `playwright.config.ts` said `` `${process.env.CI ? "pnpm start" : "pnpm dev"}` ``. **The majority
  was wrong.** Worse, the false claim did not sit inert — it **allocated work to T069 that did not
  exist**.
- **A false claim in `specs/` overwrites a correct record.** The T057 case overwrote a *correct*
  Phase 4 finding, which is worse than a stale claim nobody revisited.

### 2.4 The login credential leak: the strongest evidence for the seam rule

**Found at T072, on the very first automated sign-in against production.** The login form was putting
the creator's real password in the URL — `/login?email=…&password=…`, in the address bar, in browser
history, and in the edge's access logs.

**The mechanism.** `handleSubmit` calls `preventDefault()`, but React attaches it **at hydration**.
Before that, a `type="submit"` button inside a `<form>` is fully functional — and **a `<form>` with
no `method` defaults to GET**. Nothing chose that behaviour; it is the HTML default running in the
gap before the handler exists.

**Why 77 tasks and 432 frontend tests went past it.** Two independent blindnesses, and they compound:

1. **Every frontend test stubs the proxy**, because CI has no FastAPI behind it.
2. **The window is a property of the deployment, not of the browser.** On a fast local server
   hydration is effectively instant and the window is unobservable. On the free tier it is **~44
   seconds wide** — the cold document from §1.2 — with hydration behind that.

So the defect could not appear in CI *even in principle*, and it fired on the first real attempt.
**This is the strongest evidence this project has produced for its own rule: a green suite is
evidence about the frontend in isolation, and says nothing about the deployed seam.** The suite was
green, at 432 tests, the whole time.

`specs/` needed no amendment — FR-001, FR-002 and constitution II already required that credentials
stay private. **The implementation failed a requirement that was correctly stated**, and per
constitution IV the MR said so explicitly: the code was wrong. Fixed in two independent halves
(`method="post"`, and a hydration guard), each pinned by its own test, each verified by breaking it
and confirming *only* the matching test went red.

**It also created a second-order trap that cost two more full walks**, recorded in
`frontend/AGENTS.md`: with the guard in place, a script must wait for hydration **before typing**,
not merely before clicking. Playwright's `click()` auto-waits for an enabled control, so the guard
looks handled for free — but values typed into a React-controlled input before hydration live only in
the DOM, and hydration resets the input to React's empty state. The click submits an empty form, the
API answers 401, and the symptom is a navigation timeout indistinguishable from a dead backend or a
wrong password. **Auto-waiting protects the interaction you can see, not the state you established
before it.**

---

## 3. Estimates, scope, and friction

### 3.1 Where the estimates were wrong

**"One E2E flow" became 432 tests across four projects.** `tech-defaults.md` and `plan.md` both
budgeted a single Playwright flow. That was wrong by two orders of magnitude, and it was wrong in the
right direction: with **no renderer in the project** (Jest and RTL are ruled out at v0.1), Playwright
became the only place any frontend logic could be exercised at all. That single constraint is what
split `lib/items.ts` into pure functions plus a thin hook, and `lib/period.ts` out of the components
that draw it — both so the interesting cases could be ordinary unit tests instead of browser tests.
**The test-tool decision reshaped the module boundaries**, which no estimate anticipated.

**Seven merge requests carried two tasks each.** `tasks.md` asks for both "tests must fail first" and
"one MR per task", and the two collide whenever a task's entire subject is the next task: an MR
carrying it alone would be red, which the gate refuses. Each was recorded as a stated deviation
rather than a slip. **The pattern is the exception, not a licence** — but a task decomposition that
produces a red MR is a decomposition problem, and 002 should size tasks so that each is
independently green.

**Deployment was budgeted as one task and behaved like three.** T071 hit a database that could not be
created on the workspace at all, moved the stack to Neon, and every failure along the way looked like
a different failure (see §2.3's T074 row). The tag was then split out of T074 on the project owner's
instruction, deliberately: **tagging a release that no deployment had been walked against would make
the tag a claim without evidence.** That decision was right, and it is why this retro can be written
against measurements instead of intentions.

### 3.2 Scope creep: essentially none, and the mechanism worked

**Nothing outside `spec.md` was built.** The three deferred modules acquired no fields, no endpoints
and no screens, which was the main failure mode this project was structured to avoid. Ideas that
arrived mid-build went to `.claude/memory.md` under Deferred — multi-platform items, a fourth pipeline
state, time-of-day scheduling, bulk import, concurrent-edit detection, live-updating views — each with
the trigger that would justify picking it up.

**Four knowing departures from the design export**, every one a tap-reachability constraint rather
than taste, and every one pinned by a test so a restyle cannot quietly revert it: 44px status and
platform options, `text-base` on inputs (iOS zooms below 16px), the platform filter row above the
drawer, and the published link on its own full-width row.

**One task was *added* by a checkpoint** — T077, sign-out — and that is the system working, not creep.

### 3.3 Friction between SpecKit, GitLab and Claude Design

- **SpecKit ↔ GitLab**: `/speckit-taskstoissues` is GitHub-only and aborts on a GitLab remote. The
  issue import never happened and **blocked nothing**, which is the useful datum: for a solo module,
  `tasks.md` *was* the board. Do not spend 002's time on it unless a second person joins.
- **SpecKit's own artifacts**: the eight-artifact set is the source of both the project's strength and
  its single recurring defect. Every checkpoint found drift (§2.3). The artifacts are worth their
  cost; the **grep-every-artifact discipline is not optional**, and should be a checklist line in 002
  rather than a lesson re-learned.
- **Claude Design**: the export was created in a *regular* project rather than the design-system one
  that had been made specifically so its type would be right. Nothing was lost — `DesignSync` reads a
  regular project fine, and the project-type decision only ever protected pushing a component library
  *back*. **A project's type is immutable at creation**, so the guard was correct even though it
  turned out not to be needed.
- **The design → spec gate held.** The stage-2 data-shape audit ran **clean**: every control mapped to
  one of the six editable fields, so no `spec.md` amendment was needed and constitution IV was
  satisfied. Writing `BRIEF.md` — with its checklist derived mechanically from `data-model.md` — *before*
  the export existed is what made the audit have a fixed answer key instead of criteria invented after
  seeing the picture.
- **CI on a free tier**: the compute quota ran out mid-pipeline and the symptom lied —
  `stuck_pending_no_matching_runners`, which reads like a tags problem. The diagnostic is that a quota
  failure returns in ~0.2s with `ci_quota_exceeded` where a real runner problem queues. A
  project-owned runner fixed it **without touching the gate**.
- **The network, on the final night**: six jobs failed across three pipelines on git-clone SSL drops,
  npm registry timeouts and a `uv` download timeout. **Every one was infrastructure and none was
  code** — and `script_failure` is a misleading label for `exit code 128` out of `git clone`. Reading
  the trace before touching the code is the whole lesson; a retry cost minutes, a "fix" would have
  cost the evening.

---

## 4. What to do differently in 002

1. **Walk the deployed seam early, not at the end.** The single highest-value finding of this
   iteration (§2.4) was reachable on day one of having a deployment and was found at task 72 of 77.
   Deploy a skeleton at the *end of Phase 2* and hand-walk it, so the seam has been crossed before
   there are 400 tests giving false comfort.
2. **Make "grep the claim across every artifact" a checklist item**, not a remembered rule, and
   **search the whole repository rather than an enumerated list of likely files**. Five consecutive
   checkpoints found the same class of defect (§2.3), and §2.1 shows a scoped grep missing a fifth
   hit *while the section about scoped greps was being written*. Add a line to the checkpoint
   template: *name the claim, search the whole repo, list every artifact it appears in, resolve
   splits against the executable one — including `git log`, which is executable.*
3. **Run both review gates at every checkpoint, and expect zero overlap.** Twelve findings, no
   intersection (§2.2). Budget for both rather than treating one as a cheaper substitute.
4. **Size tasks so each one is independently green.** Seven double-task MRs came from a decomposition
   that put a test and its subject in different tasks (§3.1).
5. **Decide the hosting tier against the performance criteria, before writing them.** SC-001 is the
   only failing criterion and it fails on infrastructure the spec never chose (§1.2). Either budget
   for a warm tier or write the criterion to exclude a cold start explicitly — but do it in stage 1,
   not in the retro.
6. **State criteria that cannot be observed within the build as such.** SC-010 is a 30-day claim
   (§1.3). A criterion whose evidence is a mechanism rather than an observation should say so when it
   is written, so it is never ticked on a citation.

---

## 5. Constitution amendments proposed

**None.** Amendments are a stage-8 decision (workflow.md), and this is stage 8 — so the absence is a
finding rather than an omission. The seven principles held: the one that was broken (VI) was broken
knowingly, over a bounded range, with the record above; principle IV's "amend the spec first"
survived four knowing design departures and one added task; and principle VII's no-speculative-columns
rule is why `content_item` has no owner column, which is in turn why the single seeded creator cannot
be replaced by a second address.

The one table row that **was** amended is `tech-defaults.md`'s Auth row, at T075, which is the stage
this table may change in — permitting sliding reissue explicitly, while keeping the thing the original
row protected: **one access token, no refresh endpoint, no second token type.** The accepted weakness
is stated rather than hidden: reissue-on-use means a leaked token grants indefinite access, because
v0.1 has no denylist and therefore no revocation. Acceptable for a single-user tool; **the first
thing to revisit if this ever serves a second person.**
