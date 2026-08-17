# Retro 03 — Travel Map (v0.3)

**Feature**: `specs/003-travel-map` · **Written**: 2026-08-17 (workflow.md stage 8) ·
**Not deployed** — the `deploy` jobs stay manual per `tech-defaults.md`, and pushing `003` to the
live Render/Vercel environment is a separate, deliberate step after the tag.

62 tasks, 8 phases, 32 merge requests from the pre-planning spike (!66) through the quickstart walk
(!97), 71 commits. This is the iteration the constitution's 2.0.0 amendment was written for: the
world map is now the product's core capability in fact and not only on paper.

It is also the first iteration to close with **an acceptance path it cannot claim works**. That is
recorded in §1.3 without softening, because the alternative — a retro that reads as though everything
landed — is exactly what a retro exists to prevent.

This document does three things, in order: it checks shipped behaviour against every acceptance
criterion; it records the process facts stage 8 asks for, including two this iteration is not proud
of; and it says what to do differently.

---

## 1. Shipped behaviour against every acceptance criterion

**Where the evidence comes from.** T056 hand-walked `quickstart.md` V1–V9 against a **real production
build** — `pnpm build && pnpm start` on port 3400, `API_BASE_URL` on the compose backend, real
Postgres, the single seeded account signing in for real, **real CARTO tiles and real Nominatim**.
Nothing was stubbed. Where the walk and the automated suite could both speak to a criterion, the walk
is cited first, for the reason `001`'s retro gives and `002`'s repeats: a green suite is evidence
about the frontend in isolation, never about the seam. The walk is re-runnable as
`frontend/scripts/t056-walk.mjs`.

**16 of 17 checks passed. The one that did not could not be run at all.**

### 1.1 Success criteria

| | Criterion | Result | Evidence |
|---|---|---|---|
| **SC-001** | Places in every status tellable apart without tapping | **PASS** | T056 V1; `map.spec.ts`. Shield silhouette, outline→half→solid — shape, not colour alone, so it survives the greyscale test the design brief's `1b` screenshot already passed |
| **SC-002** | A visited place's photos and notes one tap from its pin | **PASS** | T056 V2; `photo-upload.spec.ts` |
| **SC-003** | Marking a new place ≤ 3 interactions, no intermediate page | **PASS** | T056 V5; `quick-add.spec.ts` counts them mechanically |
| **SC-004** | Map fully usable at 375px | **PASS** | T056 V1 (no horizontal overflow after a pan, every control inside 375px); the `viewport-audit` sweep |
| **SC-005** | A real place name resolves to coordinates, no hand-typed lat/long | **PASS** | T056 V3 against **real Nominatim** |
| **SC-006** | No tile or search request carries a place name, note, or photograph | **PASS** | T056 V9 — 14 real tile requests plus the search request, none carrying a stored record; `network-disclosure.spec.ts` asserts it in CI |

**All six pass.** Worth noting against `001`, which closed with SC-001 failing cold: nothing here is
latency-bound, because the map's own read is one unparameterised request and every surface narrows it
client-side. The stacked Render+Neon cold start `.claude/memory.md` tracks is unchanged and still
applies to the first request of the day; no criterion in this spec measures it.

### 1.2 Functional requirements

All 28 are realised. Rather than restate the traceability table `data-model.md` already carries, the
four worth commenting on:

- **FR-002's Currently-Traveling overlay** is computed, never stored — and T056 V7 confirmed the
  stored `status` really does stay `planned` while the overlay draws. That is the half a schema
  inspection cannot prove.
- **FR-013 (no entity data on a third-party request)** is the constitution's principle II made
  testable. Geocoding is proxied server-side so Nominatim's User-Agent policy is satisfied by one
  identified caller; the tile provider learns the viewport and nothing else.
- **FR-017's containment flag is a flag, not a refusal** — a Destination dated outside its Trip is
  saved and marked, which is the behaviour a person planning a trip actually needs.
- **FR-028 (free-direction status change) works and is under-tested.** See §1.4.

### 1.3 The gap: FR-023–FR-025, photograph upload

**The Cloudflare R2 bucket was never provisioned.** All four `r2_*` settings are empty in every
environment, so the presigned-`PUT` path has never run against real object storage anywhere. The
backend tests stub `object_storage` entirely; the frontend tests stub the proxy. T056 could not walk
V6 at all.

**Nothing in the 62 tasks provisions it, and that is the root cause rather than an oversight on the
day.** `quickstart.md`'s Prerequisites table says "not yet provisioned — first implementation task",
but T001 adds only the four *setting names* and states in its own line that no code reads them. The
prerequisite was named in one artifact and never became work in another. `/speckit-analyze` found
this at T057 — at the *end* of the iteration, which is the latest possible moment for a finding whose
whole content is "a thing that should have been task 1 was never a task."

**The owner's decision (2026-08-17) was to record it as a known gap against `v0.3.0` rather than block
the tag**, matching how `001` recorded SC-001 failing cold. Provisioning R2 and re-running V6 is owed.

The half that did not need a Cloudflare account is fixed: an unconfigured R2 previously failed inside
botocore with `ValueError: Invalid endpoint: https://.r2.cloudflarestorage.com` — a 500 naming neither
R2 nor a setting, assembled out of an empty account id. It now raises a message naming all four
variables. **This is T001's own stated purpose failing one layer later than T001 predicted**: its task
line gives "prevents the empty-variable-overrides-a-default trap" as its reason, and an empty default
is not an absent variable, so nothing noticed for 55 tasks.

### 1.4 The other gap: FR-028 has no automated frontend coverage

`DestinationSheet`'s status radio group is not clicked by any test in any Playwright project. FR-028 —
the requirement with its own Clarification session behind it, whose entire subject is that status may
move in any direction — is covered at the API layer and by T056's hand-walk of V7, and nowhere else.

**`plan.md` claimed otherwise**, attributing V7 to `e2e/map.spec.ts`. That file covers the *computed
overlay* half and never the *transition* half, and the two are easy to conflate because both are
"about status". Left open on the owner's explicit decision; recorded in `plan.md` and here so it stays
visible.

---

## 2. Process

### 2.1 The estimate held, and the shape of the work did not

62 tasks was the plan after two pre-implementation `/speckit-analyze` passes took it 57 → 60 → 62.
Every one of the 62 shipped. **No task was dropped, split mid-flight, or found to be two tasks.** That
is the first iteration of the three where that is true, and the credit belongs to the two analyze
passes running *before* any code existed — both were full renumbers rather than lettered IDs precisely
because nothing was built and no issue references could drift.

What did not hold is the **one merge request per task** rule, and this iteration broke it far more
than either predecessor.

### 2.2 Scope creep: none. Process drift: substantial, and unrecorded until now

**Scope was held exactly.** Route, budget, category, priority, Activity and a Calendar surface were
all named as out of scope in `spec.md`'s own "Why this iteration" section and none of them appeared.
Two of them — route and budget — were *constitutionally permitted* by the 2.1.0 amendment and still
not built, which is the harder discipline and the one the spec argued for explicitly: **permission is
not an obligation.**

**Process drift is the finding this retro exists to record.** `tasks.md` line 299 says one MR per
task, and calls `001`/`002`'s two-task MRs "a recorded deviation, not a default to reach for here." In
practice:

| MR | Tasks | Count |
|---|---|---|
| !83 | T014–T020, T022 | 8 |
| !93 | T036–T048 (all of Phase 5) | 13 |
| !91 | T029–T032, T035 | 5 |
| !95 | T052–T055 | 4 |
| !96 | T049–T051 | 3 |
| !88 | T026–T028 | 3 |

62 tasks landed in roughly 26 implementation MRs. **No deviation was recorded anywhere** — not in
`tasks.md`, not in `.claude/memory.md`, not in a commit message — which is the part that matters. The
bundling itself is defensible task by task (a component and the task that wires it are one reviewable
change; a full pipeline is ~12–14 minutes, and thirteen of them for one phase is real time). What is
not defensible is that a document saying "one MR per task" and a history showing thirteen-task MRs
coexisted for the whole iteration with nothing reconciling them. **`001` and `002` both wrote their
exceptions down; this one did not, and the rule quietly stopped meaning anything.**

The honest fix is not "bundle less". It is to decide what the rule is and write that down — see §3.

### 2.3 The defect that shipped green over two whole phases

**MapLibre's worker dies under Turbopack, and the map still looks alive.** MapLibre 6 is ESM-only and
its worker imports a sibling as `./maplibre-gl-shared.mjs`; Turbopack emits both files under *hashed*
names without rewriting that import, so the worker 404s on its own dependency and dies at creation.

**What makes it survive review is the split between threads.** Style JSON, `tiles.json`, sprite JSON
and sprite PNG are all fetched on the **main thread** and succeed — so the attribution control renders
its licence text, `map.on("idle")` fires, markers mount, and `page.screenshot()` returns a perfectly
valid non-empty buffer. **Vector tiles are the only thing fetched from the worker.** The result is a
fully-wired map drawing a completely black canvas.

Every pre-existing test passed against it, **including one named "a genuine map renders — real tiles,
real attribution"**, whose attribution assertion is satisfied by the style load alone. Phases 3 and 4
both shipped "green" over it. This is the project's own recurring trap — *the half that works is the
half every test happens to use* — and the only assertion that could catch it is the one no main-thread
fetch can satisfy: **a real `.mvt` request**. Verified by breaking `setWorkerUrl` and confirming
exactly one test went red while the other seven stayed green.

**Then the fix itself shipped incomplete, and CI is what caught it.** `predev`/`prebuild` hooks
regenerate the worker files, which is enough locally — `pnpm build` writes them and `pnpm start`
afterwards serves what is already on disk in the same working tree. CI splits the two across separate
jobs: `test:e2e` runs `pnpm start` against `build:frontend`'s uploaded `.next/` artifact, that
artifact does not include `public/`, and `next start` fires no `prebuild`. So the just-added
regression test failed in CI while passing locally. Fixed with a matching **`prestart`** hook.

**The reusable lesson, recorded in `frontend/AGENTS.md`**: a `predev`/`prebuild` pair covers a
workflow that builds and starts in one directory, and stops covering it the moment a pipeline splits
build and start across separate machines or artifacts. Any generated-but-gitignored asset needs
regenerating before *every* command that serves the app, not just the one that compiles it.

### 2.4 The three checkpoint gates found six things, and did not overlap once

This is now measured across four checkpoints and it keeps coming out the same way, so it is worth
stating as a result rather than a habit.

- **The hand-walk (T056)** found the R2 gap. No automated gate could have: both suites stub object
  storage, correctly, and a stub cannot notice that the thing it stands in for does not exist.
- **`/speckit-analyze` (T057)** found FR-028's missing frontend coverage and two artifacts describing
  FR-010's filter as a server-side query parameter when T053 requires the opposite. **A code review
  cannot find that** — it is two specs disagreeing with a third, and nothing is wrong in the code.
- **The `reviewer` agent (T058)** found a reachable unhandled `IntegrityError` returning
  `500 text/plain` in violation of the API's uniform error body, and a constitution-VII regression
  guard that `data-model.md` promised and nobody wrote. **`/speckit-analyze` cannot find either** —
  the first needs the code executed, the second needs someone to check whether a named test exists.

**A note on the second `reviewer` finding, because it is the sharpest one here.** `data-model.md`'s
INV-2 states that a test asserts none of `trip`, `destination` or `photograph` has an owner column or
a foreign key to `creator`. No such test existed for any of the three, for the whole iteration —
principle VII's only regression guard, absent, in the iteration that added three tables. It exists
now, along with a test that adds `creator_id` inside a rolled-back transaction to prove the guard is
not vacuously green.

### 2.5 One thing this retro's own analysis got wrong

T057 reported constitution VII as covered by a real test for the three new tables. It was not, and the
`reviewer` pass corrected it. The mistake: `test_schema.py` has an `EXPECTED_TABLES` set containing
the literal strings `"trip"`, `"destination"`, `"photograph"` — and that was read as the column guard,
when it is a *table-name* allowlist whose own docstring says it does not duplicate a column review.

**A test whose name and contents mention the right nouns is not a test of the right claim.** This is
the same family as the trap in §2.3 (a test named "a genuine map renders" that could not see a black
map) and the same family as `001`'s "membership assertion about a filtered list is green against no
filter at all." Grepping for a noun finds files; it does not find guarantees.

### 2.6 Friction: SpecKit, GitLab, Design

**SpecKit — the cheapest of the three, and the two analyze passes are why.** Running
`/speckit-analyze` twice before implementation caught a missing `DELETE /destinations` task, three
tasks with no file paths, an untested SC-006, three endpoints with no backend test task, and a test
attributed to the wrong file. Every one of those would have been discovered mid-build at several times
the cost. Stage 1 is the cheapest place this project has found to fix anything.

**GitLab — the same trap, twice, and it is a foreground process.** The local runner died mid-session
again; `tasklist` showed no `gitlab-runner.exe` while the GitLab API still reported `online: true`.
MR !97's pipeline sat pending, then failed `runner_system_failure` once Docker Desktop had also
stopped. **Trust the process, not the API field** — this is documented in `CLAUDE.local.md` and it
still cost time, which suggests the documentation is not the binding constraint.

Separately, **roughly five jobs were lost to genuine registry/network timeouts** (`uv sync`,
`pnpm install`) where a bare retry was correct — and **exactly one job that looked identical in the
pipeline view was a real defect** (the `prestart` gap in §2.3). The discipline that separates them is
one command: `glab api projects/84983786/jobs/<id>/trace | tail -30`. **Read the trace before
retrying.** A retry that "fixes" a real defect by chance is the worst outcome available.

**Design — the stage that turned out not to be a pass-through.** The plan was to build straight
against `002`'s token layer. The owner chose a genuine Claude Design pass instead, and the session
discovered it **has no automated path into claude.ai/design's canvas** — `DesignSync` syncs an
existing component library and cannot generate a screen. The substitute was a `BRIEF.md` plus a
literal paste-in `DESIGN-PROMPT.md`, and the owner produced the export by hand.

The audit then found exactly **one** finding, and it was worth the whole exercise: the export's
`TripPanel` invents its own status words (Idea/Planning/Booked/In Progress/Completed/**Abandoned**)
against `data-model.md`'s ratified six, including a seventh value with no ratified equivalent.
Resolved **without** a spec amendment — implementation uses the ratified words — which is the correct
direction: `specs/` outranks an export.

### 2.7 The parallel-worktree experiment worked

US4 (Phase 6) and US5 (Phase 7) were built as two independent tracks in separate git worktrees, per
the owner's instruction to parallelise where files are genuinely disjoint. They touched no common
file, both merged behind their own green pipelines, and the only coordination needed was one rebase
when `main` moved under the slower one.

**The friction worth recording: one of the two agents died mid-run to a session limit and had to be
resumed.** The work survived — a worktree is a real directory with real commits — but it is a failure
mode a single-track build does not have, and it argues for keeping parallel tracks short enough that
losing one costs a resume rather than a restart.

The rule from `.claude/memory.md` held exactly as written: **split by tree, not by task count. If two
tasks would edit one file, they are one track.**

### 2.8 Two defects in the walk script, both of which produced a confident wrong answer

Recorded because a verification tool that lies is worse than no verification tool.

- **A fixed 4-second sleep reported "0 vector tile requests"** — the exact signature of the dead
  MapLibre worker from §2.3 — against a basemap that was merely still loading. A screenshot at 10s
  showed the map drawn correctly. **A timing artifact and a real defect presented identically.** The
  script now polls for a real `.mvt`. The general form: **wait for the thing itself, not for a
  duration.**
- **Matching the quick-added row by name deleted the wrong row.** Nominatim answered "Kyoto" with the
  local exonym (京都市), so `name.includes("kyoto")` matched a *pre-existing demo row* instead,
  reported its coordinates as the walk's own result, and deleted it — while leaking the row the walk
  had actually created, since cleanup only sweeps the `T056` prefix. Now identified by **id
  difference** against a list read taken before the flow. The data lost was disposable dev demo data;
  the lesson is not. **A fixture matched on a value a third party controls is not matched.**

---

## 3. What to do differently

1. **A prerequisite named in `quickstart.md` must become a task in `tasks.md`, or it will not
   happen.** The R2 bucket was named as "the first implementation task" in one artifact and was never
   a task in the other, and 62 tasks completed without it. When `/speckit-tasks` runs, walk
   `quickstart.md`'s Prerequisites table row by row and confirm each one either already exists or has
   a task. This is a five-minute check that would have moved a §1.3-shaped finding from the end of the
   iteration to the beginning.
2. **Decide the merge-request granularity and write it down, once.** The current state — a rule saying
   one MR per task and a history of up-to-thirteen-task MRs — is worse than either policy alone,
   because it makes the document unciteable. Either amend `tasks.md`'s working agreement to "one MR
   per coherent reviewable change, phases may land whole", or keep the rule and record each deviation
   the way `001` and `002` did. **Not deciding is the option that has been chosen by default twice.**
3. **When a library splits work across a worker or a second process, assert something only that side
   can produce.** A green main thread is not evidence about the worker. Already in
   `frontend/AGENTS.md`; repeated here because it cost two phases.
4. **Read the job trace before retrying a red job.** Five retries were right and one was a real defect,
   and they were indistinguishable in the pipeline view.
5. **Run all three gates, every time.** Six findings, zero overlap, four checkpoints running. This is
   no longer a hypothesis.

---

## 4. Where this leaves the product

Three iterations, three tags: `v0.1.0` (Content Calendar), `v0.2.0` (the pixel-arcade presentation
layer), `v0.3.0` (the Travel Map). **413 backend tests and 572 frontend tests on `main`, none
skipped.** The constitution's named core capability exists and works.

**Owed, and not a feature either of them**: provision Cloudflare R2 and re-run quickstart V6; rotate
`SEED_CREATOR_PASSWORD`, still outstanding from `001`.

**Not scheduled**: everything in `.claude/memory.md`'s Deferred section, which closes with a ranked
shortlist for whenever `004` gets a subject. It is a ranking, not a plan. Nothing on it gets built
until it has its own `spec.md`.
