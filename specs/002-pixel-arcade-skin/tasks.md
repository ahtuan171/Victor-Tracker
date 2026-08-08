# Tasks: Pixel-Arcade Presentation Layer

**Input**: Design documents from `/specs/002-pixel-arcade-skin/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml),
[quickstart.md](./quickstart.md)

**Tests**: Test tasks are included. This project's `.gitlab-ci.yml` gates every merge on them, and
`spec.md` carries fifteen success criteria that are only criteria if something checks them.

**Organization**: grouped by user story. Phases 1 and 2 block everything; Phase 3 (US1) is the MVP and
is already the whole visible outcome on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on an incomplete task
- **[Story]**: US1–US4, on user-story phases only

## Working agreement

Unchanged from 001, and none of it is relaxed by this being a presentation iteration:

- **One task, one merge request, merged only behind a green pipeline.** `main` refuses direct pushes.
  Start Docker Desktop and the project-owned GitLab runner first — the commands are in
  `CLAUDE.local.md` — or every pipeline hangs.
- **Tests fail first.** Where a task's entire subject is the next task, an MR carrying it alone would
  be red and the gate refuses it. Seven merge requests in 001 carried two tasks for exactly this
  reason; each was a **stated deviation**, recorded here, not a licence. The pairs where this is
  predicted are called out below.
- **A checkpoint amendment reaches every artifact in the same MR.** Grep the claim across the **whole
  repository**, then filter — an enumeration of likely files is a hint, not a boundary. This is the
  trap that has cost this project more than any other.

---

## Phase 1: Setup and the stage-2 gate

**Purpose**: settle the two things that are expensive to change after eleven surfaces exist — the
typefaces' real sizes, and whether the action band can hold its four controls at all.

**Nothing in Phase 3 may start until T004 is signed off.** That is the whole point of a design gate:
`.claude/rules/design.md` calls the export "the starting point, not a drop-in", and this iteration's
substitute for an export is a brief plus a screenshot review.

- [x] T001 Write `design/002-pixel-arcade-skin/BRIEF.md` **before any surface is touched**, carrying: (a) the reference observations below, verbatim, because they exist nowhere else in the repository; (b) the hard constraints traced to requirements (375px floor, 44px targets, FR-032–FR-034 text floors, FR-008 frame yields); (c) a `DO NOT INVENT` list naming every field the calendar has, so no control appears for data that does not exist.

  **Reference observations — `spidey-tracker.mp4` at the repository root (gitignored, 39.3s, 2880×1704). Copy these into BRIEF.md; if the recording is lost this task line is the only record.**
  - A thick bevelled cyan machine frame surrounds the viewport, with elements at all four corners.
  - Pixel lettering **everywhere**, content included.
  - Palette: cyan / steel blue for the chrome, navy for the map area, red for accents.
  - **Ruled tick marks** along the top and left edges of the map area — a "measuring instrument" motif.
  - A spider-web compass/radar in the lower right corner.
  - A strip of moving text along the bottom.
  - A loading bar built from square blocks; the boot screen reads `INITIALIZING MAP...`.
  - **Tapping a pin**: the camera flies to it, then **a card floats above the pin holding a thumbnail image and an underlined `VIEW SIGHTING` line**. No pulse, no radar sweep — simpler than it looks.

  **How to re-watch it**: Playwright's bundled ffmpeg is built `--disable-everything` and **cannot decode mp4**. Use Chromium/Edge as the decoder — `page.goto("file://…mp4")`, seek the `<video>`, then `locator.screenshot()`. Do not use a canvas: `file://` taints it.

- [x] T002 [P] Load **VT323** and **Silkscreen** through `next/font/google` in `frontend/app/layout.tsx`, exposed as CSS variables beside the existing three. Do **not** add a `preconnect` to any Google domain — `next/font` self-hosts at build time and a preconnect reintroduces the third-party request that research R-009 exists to avoid.

- [x] T003 Re-solve the action band at 375px and record the decision in `frontend/AGENTS.md`. Research R-003 measures it at **~379px inside a 363px frame** with today's labels — failing by ~16px before anything else goes wrong — and at ~493px if display lettering is used there at all. Measure with the real faces from T002; keep all four controls; do not relax the 44px floor to make it fit. **Assert with `viewport-audit.spec.ts`, never with a `scrollWidth` check**: the band clips silently, measured twice (T068, T077).

- [x] T004 Screenshot `/login` and `/calendar` at **375×667 in both presentations** and get the owner's sign-off on two open questions before Phase 3 starts: **content text at 18px or 20px** (research R-001's open item — 18px matches the outgoing Barlow's width, 20px matches its x-height) and the **frame thickness**. Screenshot on port **3400**, not 3100, and kill the server afterwards — Next 16 refuses a second `next dev` in the same directory whatever the port, and a stray server is silently adopted by the next `playwright test`. **Deviation, recorded**: `/login` and `/calendar` still carry the outgoing presentation at this point in the sequence (Phase 3 hasn't restyled them yet), so screenshotting them would show neither font at any size and answer nothing. Substituted a side-by-side comparison page instead — real VT323/Silkscreen files, a real day-cell shape, three real frame thicknesses with corner rivets — which is what the two questions actually needed. Owner sign-off obtained 2026-08-08: **20px content text, 10px frame**. Full record in `design/002-pixel-arcade-skin/BRIEF.md` Audit findings, `research.md` R-001/R-003, and `frontend/AGENTS.md`.

- [x] T005 [P] Teach `frontend/tests/contract/proxy-allowlist.spec.ts` and `frontend/tests/contract/api-types.spec.ts` to read **both** contract files, then place `GET`/`PATCH /preferences` in `PROXY_ALLOWLIST` and add `Theme` to the enum comparison. The contract's own header says why the operations are not simply appended to 001's file; do not resolve the red test that way.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the token layer every surface reads, and the backend the two preference stories need.

**Two tracks, and they touch disjoint trees** — T006–T009 in `frontend/`, T010–T013 in `backend/`.
`.claude/memory.md` records that parallel tracks are worth it exactly when the trees are disjoint;
these are. An agent working `backend/` in a worktree needs the root `.env` copied in, or
`app/config.py` refuses to import.

- [x] T006 Replace the token layer in `frontend/app/globals.css` — colour, type scale, spacing — in **one file**, keeping the two rules that travel with it: the accent colour is chrome and never meaning, and colour is decoration on the status cue rather than the cue itself. Both presentations get real values; light is no longer a placeholder. Screenshot afterwards: **a misspelled Tailwind class fails silently** and passes build, lint, typecheck and the whole suite.

- [x] T007 Add the frame in `frontend/app/globals.css` plus `frontend/components/arcade/Frame.tsx` — responsive per FR-008, **6px per side at 375px**, thicker at wide viewports. The four corner elements are **decorative rivets, not controls**: a button-shaped thing that does nothing is a wasted tap target, and this iteration adds no actions. **Built at 10px, not 6px**: this line was written before T004's sign-off, which ran first in the actual sequence (Phase 1 before Phase 2) and superseded R-003's 6px working number. `.arcade-frame` in `globals.css` and `frontend/AGENTS.md` both carry 10px; this line is left as the original instruction rather than silently rewritten, per the project's own rule that a task's line records what was asked, not what superseded it.

- [x] T008 Re-derive the focus indicator in `frontend/app/globals.css` against the new shapes. `.notch-card` / `.notch-sheet` are going away, so the two `.focus-ring-inset` cases must be re-established from scratch — **do not carry the old list over**. Keep `outline`, never a `ring-*` box-shadow, and keep `outline-offset`. Verify by breaking it: `focus-states.spec.ts` compares focused against unfocused **bytes** and is the only check that has ever caught a ring clipped away by a `clip-path`.

- [x] T009 Add `frontend/tests/e2e/text-size-audit.spec.ts` — sweep every route and overlay like the viewport audit does, read computed `font-size` on every visible text node, fail below **12px** anywhere or below **16px** for content (SC-014, FR-032–FR-034). **Expected to be red until Phase 3 lands**; that is the test working.

- [x] T010 [P] Add `Theme` and the two columns to `backend/app/models.py`, plus one Alembic revision. `values_callable` on the enum or it persists member **names**; explicit `postgresql.ENUM(..., create_type=False)` or the second `upgrade` fails with "type theme already exists". Run `upgrade → downgrade base → upgrade` and `alembic check` before opening the MR.

- [x] T011 [P] Implement `GET` and `PATCH /preferences` in `backend/app/api/preferences.py` with `PreferencesRead`/`PreferencesUpdate` in `backend/app/schemas.py`, registered in `backend/app/main.py`. Every 4xx declares `model=ErrorResponse`, and both routes go into `REACHABLE_4XX` in `backend/tests/test_errors.py`. Tests in `backend/tests/test_preferences.py`: an empty body is a **422**, an unknown key is a **422** (`additionalProperties: false`), no token is a **401** not a 403, and the response is the **full** object rather than the diff.

- [x] T012 [P] Add the optional `preferences` property to the login response in `backend/app/api/auth.py`, and add it to the login schema in **`specs/001-content-calendar/contracts/openapi.yaml`** — the single edit this iteration makes to 001's contract, and an addition to an existing operation rather than a new operation. This is the one artifact pair most likely to drift; change both in the same MR.

- [x] T013 [P] Amend `backend/tests/test_schema.py` so `creator`'s column allowlist grows by exactly two. **Leave every `content_item` assertion untouched** — INV-2 says that table is the same shape after this iteration as before, and a green run there is what proves it. Before trusting the amended assertions, make them fail: an absence test passes trivially when it is broken.

---

## Phase 3: User Story 1 — The product presents as one machine (P1) 🎯 MVP

**Goal**: every surface in one visual language, at 375px, in both presentations.

**Independent test**: open every screen and overlay and confirm each carries the same frame, lettering
and controls. One surface left in the previous presentation fails it (SC-001).

**Behaviour must not change.** Every one of these tasks restyles in place; if a component's tests go
red for any reason other than a deliberate class change, the restyle broke something FR-003 forbids
breaking.

- [x] T014 [P] [US1] Restyle `frontend/app/login/` — the one surface that already has a light presentation, so it is the cheapest place to find out whether the new light tokens work. Keep `h-11` fields and `h-12` submit, keep `text-base` on inputs (iOS zooms below 16px), keep `method="post"` and the hydration guard.
- [x] T015 [P] [US1] Restyle the header in `frontend/components/calendar/CalendarShell.tsx` — the period title and the overdue count. Sign-out stays here until T030 moves it.
- [x] T016 [US1] Restyle `frontend/components/calendar/PeriodNav.tsx` and the action band, **applying T003's decision**. Re-run `viewport-audit.spec.ts` as part of this task, not after it.
- [x] T017 [P] [US1] Restyle `frontend/components/calendar/MonthGrid.tsx` and `DayCell.tsx`. The 42-day span and the two-chip cap are behaviour and stay; if 18px content pushes six rows past 667px, that is T004's fallback question resurfacing and it is a conversation, not a silent cap change.
- [x] T018 [P] [US1] Restyle `frontend/components/calendar/WeekList.tsx` — seven vertical sections, still no chip cap.
- [x] T019 [US1] Restyle `ItemChip`, `StatusCue` and `PlatformCue`. **The greyscale criterion is checked in this task, not deferred to Phase 7**: three statuses plus overdue, distinguishable with colour removed, in both presentations (SC-004). Overdue stays a dashed left border — `[border-left-style:dashed]`, asserted as a *computed* style.
- [x] T020 [P] [US1] Restyle `frontend/components/backlog/` — the peek strip and the expanded drawer, including the drawer's own `+ CAPTURE`.
- [x] T021 [P] [US1] Restyle `frontend/components/capture/CaptureSheet.tsx`. Capture stays **three interactions** — `autoFocus` is load-bearing, not decoration.
- [x] T022 [US1] Restyle `frontend/components/item/ItemSheet.tsx`, including the published-link row and its open control. The link keeps its **own full-width row**; T065 measured 35 characters visible there against ~20 in a shared row.
- [x] T023 [P] [US1] Restyle `frontend/components/item/DeleteConfirm.tsx`. `KEEP ITEM` stays first in the DOM and focused; the destructive action keeps the **lower** visual weight. Watch the width trap: a `truncate`d title's min-content is the whole string, which once made this dialog **561px wide on a 375px screen**.
- [x] T024 [P] [US1] Restyle `PlatformFilter`, `FirstRun` and `FilteredEmpty`. All three empty states stay distinct — `FirstRun` accompanies the grid, `FilteredEmpty` replaces it.
- [x] T025 [P] [US1] Restyle the shadcn primitives in `frontend/components/ui/` that the surfaces above extend, so no surface hand-rolls a control the primitive should carry.
- [x] T026 [P] [US1] Add `nextDue()` to `frontend/lib/items.ts` as an exported pure function beside `countOverdue()`, with unit tests in `frontend/tests/client/items.spec.ts`. Pure function, not logic inside a hook — this project has **no renderer**, so anything inside a component is only reachable through a browser.
- [x] T027 [US1] Build the strip in `frontend/components/arcade/Ticker.tsx`, fed `visible` from `CalendarShell` and rendering `countOverdue(visible)` and `nextDue(visible)`. **One value, two presentations** (FR-028): it must narrow with the platform filter exactly as the header count does. Content fits 375px stationary; motion is a repeating band, off under `prefers-reduced-motion`. Empty state is a sentence, never a blank (FR-030).
- [x] T028 [US1] **Phase checkpoint.** Full `viewport-audit.spec.ts` and `text-size-audit.spec.ts` sweep across every surface **in both presentations**, plus a hand-walk of quickstart V1–V5. Run all three gates — the hand-walk, `/speckit-analyze`, and the `reviewer` agent — because each has found what the other two could not.

---

## Phase 4: User Story 2 — One place for navigation and settings (P2)

**Goal**: a single drawer, reachable from every screen, holding every screen plus the three account
controls.

**Independent test**: from each screen, open it, confirm every screen is listed, and confirm signing
out works from it.

- [ ] T029 [US2] Build `frontend/components/arcade/NavDrawer.tsx` and its trigger, present on every screen. It layers **above** the backlog drawer with its own scrim and its own dismissal; the backlog drawer is deliberately not a modal and cannot be relied on to get out of the way.
- [ ] T030 [US2] Move sign-out from the header into the drawer, at the **far end** of it (FR-017). Keep the refusal behaviour exactly as T077 built it: a refused sign-out keeps the owner on the calendar and says so, because only the proxy can clear an httpOnly cookie and a logout the server refused leaves the session alive.
- [ ] T031 [US2] Tests in `frontend/tests/e2e/nav-drawer.spec.ts`: reachable from every screen; at most 2 interactions between any two screens (SC-007); dismissing over an open capture sheet **keeps the typed text** (FR-018); and neither drawer traps the person when both are open (FR-019).

---

## Phase 5: User Story 3 — A remembered choice of dark or light (P3)

**Goal**: a switch that survives a reload, follows the account to another device, and never shows the
wrong presentation first.

**Independent test**: switch, close, reopen — the chosen presentation is what appears, including at
the very first moment anything is visible; then confirm the same on a second browser profile.

- [ ] T032 [US3] Add `frontend/lib/theme.ts` — read and write the `ch_theme` cookie, apply the class, reconcile against the account. Client-side only; it is not `httpOnly` because the client writes it on every toggle, and it carries one of two words and **no identifier**.
- [ ] T033 [US3] Make `frontend/app/layout.tsx` read `ch_theme` server-side and emit the class on `<html>` in the **initial HTML**, replacing the hard-coded `dark`. This is what makes FR-013 reachable without an inline blocking script; server and client then agree by construction and there is no hydration mismatch to suppress.
- [ ] T034 [US3] Add the presentation control to the drawer: apply locally and immediately (SC-005 wants under a second), write the cookie, then `PATCH`. The visible result never waits for the request.
- [ ] T035 [US3] Make the proxy at `frontend/app/api/[...path]/route.ts` write `ch_theme` from the login response's `preferences`, in the same response that sets the session cookie. The proxy already reads that body to lift the token out of it. Keep rebuilding the response rather than forwarding it — that is what makes "strip `X-Access-Token`" true by construction.
- [ ] T036 [US3] Add `frontend/tests/e2e/theme.spec.ts`: assert the class on `<html>` **in the served document, before JavaScript runs** (FR-013 — a correction in 50ms still fails); persistence across a reload (FR-011); dark by default (FR-012); correct under a throttled connection (FR-013a); and the signed-out screen using this device's last presentation (FR-013b).
- [ ] T037 [US3] Walk every surface in the **light** presentation at 375px and fix what it finds. It exists today only on `/login`, so this is ten surfaces being seen for the first time, not a re-check — FR-014 requires both presentations to satisfy every other requirement, so `viewport-audit`, `text-size-audit` and the greyscale check all run again here.

---

## Phase 6: User Story 4 — Sound feedback, silent until asked for (P4)

**Goal**: short cues on actions that change something, silence everywhere else, and nothing about
sound between opening the product and using it.

**Independent test**: a full pass from a fresh start produces no sound; turned on, actions produce it;
the choice survives reopening.

- [ ] T038 [US4] Add `frontend/lib/sound.ts` — cues synthesised with the Web Audio API, context created **lazily inside the first user gesture that needs one**. No assets, no library, no `<audio>`. Playback is fire-and-forget and every failure is swallowed: no code path may branch on whether a sound played (FR-023).
- [ ] T039 [US4] Wire the cues to exactly the actions FR-023a names — capture, save, delete, move to a date or back — plus a **distinguishable** cue for refusals. Navigation, view changes, filtering and panel toggles get nothing.
- [ ] T040 [US4] Add the sound control to the drawer, persisted through `PATCH /preferences` (FR-022). Off is immediate.
- [ ] T041 [US4] Add `frontend/tests/e2e/sound.spec.ts` against a **stubbed `AudioContext`**, counting `createOscillator` calls per interaction: a data-changing action produces exactly one cue, a navigation interaction produces **zero** (SC-015), and a fresh account produces zero across a complete pass (SC-009).

---

## Phase 7: Polish and cross-cutting

- [ ] T042 Reduced-motion pass across the product (FR-025, SC-008): everything self-animating stops under `prefers-reduced-motion: reduce`, and the set of readable information is **identical** with motion and without it.
- [ ] T043 Greyscale acceptance on every surface in **both** presentations (SC-004) — screenshots kept beside the brief in `design/002-pixel-arcade-skin/`, as 001 did.
- [ ] T044 Hand-walk [quickstart.md](./quickstart.md) V1–V11 against a production build at 375px, in both presentations, and record the results in this file **unsoftened**, including failures. V11 re-runs 001's own quickstart: capture must still be **three interactions** (SC-010, FR-003).
- [ ] T045 Run `/speckit-analyze` **and** the `reviewer` agent. They find different classes of defect — a coverage check reads artifacts against each other, which a code review cannot; a reviewer reads code against specs, which an artifact check cannot.
- [ ] T046 Documentation drift sweep, repo-wide. `CLAUDE.md`, both `AGENTS.md`, `.claude/memory.md`, `.claude/rules/design.md`, `CHANGELOG.md`, and every file this iteration's decisions touched. **Search the whole repository, then filter** — the fifth instance of this trap in 001 was found only by an unscoped grep, in the one file nobody thought to list.
- [ ] T047 Write `docs/retro-02.md` and tag the release, in that order and only after T044 has walked a deployment. Tagging a release no deployment has been walked against is backwards — 001 split its tag out of the drift pass for exactly this reason.

---

## Dependencies

```text
Phase 1 (T001–T005)
   └─ T004 sign-off GATES all of Phase 3
Phase 2 frontend (T006 → T007 → T008, T009)   ─┐
Phase 2 backend  (T010 → T011 → T012, T013)   ─┤ disjoint trees, run in parallel
                                               │
Phase 3 US1 (T014–T028)  ← needs T006–T009 + T004
   └─ T028 checkpoint
Phase 4 US2 (T029–T031)  ← needs T028
Phase 5 US3 (T032–T037)  ← needs T029 (the control lives in the drawer) + T010–T012
Phase 6 US4 (T038–T041)  ← needs T029 + T010–T012
Phase 7 (T042–T047)      ← needs everything
```

**Story independence**: US1 stands entirely alone and is the MVP. US2 depends on US1 only for the
language it is drawn in. **US3 and US4 both depend on US2**, because FR-016 puts their controls in
that drawer — that is a real dependency stated in the spec, not an artefact of this ordering.

**Predicted two-task merge requests**, so they are stated deviations rather than surprises: **T009
with T014** (the text audit is red until a surface complies) and **T011 with T012** (the login
response's new property has no schema to point at until `PreferencesRead` exists).

---

## Parallel opportunities

- **Phase 2**: the whole frontend track and the whole backend track, in separate worktrees.
- **Phase 3**: T014, T015, T017, T018, T020, T021, T023, T024, T025, T026 touch different files. **Do
  not parallelise T016, T019, T022 or T027** — T016 applies a measurement the others depend on, T019
  owns the cue vocabulary every chip-bearing surface reads, T022 and T027 both compose components the
  others define.
- **Phase 5 and Phase 6** can run together once T029 lands: `lib/theme.ts` and `lib/sound.ts` share
  nothing but a drawer that already exists by then.

---

## Implementation strategy

**MVP is Phase 1 + Phase 2 + Phase 3.** That delivers SC-001, SC-002, SC-003, SC-004, SC-014 and the
whole visible outcome of the iteration. Stopping there leaves a product entirely in one language with
no theme switch and no sound — which is exactly what US3 and US4 say about themselves.

**Deliver in that order and do not reorder US1 behind anything.** The failure this iteration exists to
avoid is the product spending a long branch in two visual languages; every task in Phase 3 shortens
that window and every task outside it lengthens it.

---

## Notes and amendments

*(Each phase records what its checkpoint found, as 001's did.)*

**2026-08-08 — T001.** `design/002-pixel-arcade-skin/BRIEF.md` written, carrying the three required
parts plus one addition not in the original task line: a "what travels from the reference, and what
does not" section. The reference site is a travel map — its spider-web compass/radar and its
tap-a-pin "VIEW SIGHTING" card interaction are both literally about a map, and this iteration is a
presentation layer for a *calendar* drawn in a language the eventual map will reuse (FR-002). Calling
that out now, rather than leaving it implicit in the reference recording, is what stops someone from
building a calendar-flavoured version of a map-specific interaction at T027 or later. Also added a
DO-NOT-INVENT table of arcade-specific temptations (score/streak readouts, XP or lives bars, a
functioning radar, ambient music, a third theme) — the generic six-field list from 001's brief does
not cover these because 001 was never tempted toward a game aesthetic.

**2026-08-08 — Phase 1 closed (T001–T005).** T002 loaded VT323 and Silkscreen through
`next/font/google`, no preconnect added, `pnpm build` verified both self-host correctly. T003
recorded the action band decision in `frontend/AGENTS.md` (VT323 labels, `+ CAPTURE` → `+ NEW`, 32px
padding → 16px), measured against the **real** fonts rather than the paper estimate in `research.md`.
T004 got the owner's sign-off — **20px content text, 10px frame** — via a side-by-side comparison
page instead of screenshotting `/login`/`/calendar`, because neither surface carries either font at
this point in the sequence; the deviation and its reason are on T004's own line. **The frame choice
(10px, not R-003's 6px working number) reopened T003's arithmetic**: the surviving margin is now
**~18px, not ~26px** — still fits, corrected in `research.md` R-003 and `frontend/AGENTS.md` in the
same pass as the sign-off, per the project's standing rule that an amendment reaches every artifact
in one MR. T005 taught both contract-reading tests to merge `paths`/`schemas` across 001's and 002's
`openapi.yaml`, added `/preferences` to `PROXY_ALLOWLIST` with two explicit rejection cases
(`POST`/`DELETE`), and added `THEMES` to `lib/api.ts` with a passing comparison test. All 16
`--project=contract` tests green; `pnpm typecheck` and `pnpm lint` silent.

**Phase 2 is next and is not started.** T006–T009 (frontend: token layer, frame, focus indicator,
text-size audit) and T010–T013 (backend: `Theme` column, `/preferences` routes, login response,
schema test) run in parallel per the dependency graph — nothing here is a Phase 3 restyle yet.

**2026-08-08 — Phase 2 closed (T006–T013), split across a worktree per `.claude/memory.md`'s rule
that parallel tracks are worth it exactly when the trees are disjoint.** Frontend (T006–T009) ran in
this checkout; backend (T010–T013) ran in an agent's isolated git worktree, merged back with
`--no-ff` once independently re-verified in this checkout (285 backend tests, `ruff`/`mypy`/the
`upgrade → downgrade base → upgrade` round trip all clean — not just trusted from the agent's own
report).

**The worktree agent's setup note, worth keeping**: its worktree was created from `main`'s tip, not
from `002-pixel-arcade-skin` — `specs/002-pixel-arcade-skin/` was entirely absent until it
fast-forwarded onto `ef52832` itself before starting. The brief assumed the worktree would inherit
the branch it was spawned from; it did not. Say so explicitly next time rather than assuming it.

**T006's font swap broke five passing test files it does not own, and this is expected, not a
regression to chase down.** `viewport-audit.spec.ts` (7 cases), `first-run.spec.ts`,
`period-nav.spec.ts`, `sign-out.spec.ts` and `stale-item.spec.ts` all went red the moment
`--font-sans` became VT323, every one of them on the same root cause: `+ CAPTURE` in VT323 now
overflows 375px, which is the **exact** failure `research.md` R-003 and T003 already measured and
already assigned to T016 ("Restyle `PeriodNav.tsx` and the action band, applying T003's decision").
Confirmed rather than fixed here, on purpose — fixing it now would be doing Phase 3's job inside
Phase 2 and outside the plan. **Do not be alarmed by these five files being red between now and
T016**; the Phase 3 checkpoint (T028) re-runs the full `viewport-audit.spec.ts` and
`text-size-audit.spec.ts` sweep specifically to confirm they come back.

**T008 narrowed rather than executed its own headline claim.** The task line says `.notch-card` /
`.notch-sheet` "are going away", which read as an instruction to delete them now. They were not
deleted: every current surface (login, capture sheet, item sheet, …) still wears them and Phase 3
has not restyled any of them yet, so removing the CSS now would silently flatten every one of those
surfaces for no test to catch (Tailwind's silent-failure mode, again) ahead of the tasks that are
actually supposed to do that restyle. What T008 did do: rewrote `.focus-ring-inset`'s documentation
so it no longer hard-codes 001's two clipping cases as if they were permanent, and left the
`outline`/`outline-offset` mechanism itself untouched. `focus-states.spec.ts` still 9/9 green — the
mechanism was never broken, only its stale explanation.

**2026-08-08 — Phase 3 closed (T014–T027), MVP delivered.** Every surface restyled onto the
pixel-arcade tokens, in one pass per component rather than per task in strict numeric order — T025
(primitives) first since T014/T019/T021–T024 extend them, then the independent surfaces, then the
sequential trio T016→T019→T022 plus T026→T027 last (T027 consumes T026). `.notch-card`/`.notch-sheet`
— which T008 deliberately left in place — **are now actually gone**, replaced with sharp-cornered
chrome matching the reference, as each surface's own restyle task reached it. `+ Capture` is `+ New`
everywhere it appeared (the action band, the backlog's own capture button, both empty-state copies
that named it), consistently, once T016 renamed the band's copy first. Two correctness fixes rode
along, found while restyling, not scoped in advance: several surfaces read `text-brand`/`brand-hi`
for error/destructive states, which was correct under 001's single accent but not after 002 split it
into chrome-cyan and a dedicated `danger` red — all moved to `danger`/`danger-hi`. And `DayCell`'s
"+N more" button needed `h-3.5` (14px) bumped to `h-4` (16px) to fit FR-033-compliant text — the one
place this restyle changed a dimension rather than only a colour/font, because the floor is not
optional.

**A real bug in T009's own test, found by running the full suite rather than each surface in
isolation.** `text-size-audit.spec.ts`'s content-floor check keyed off `item-chip`, which also wraps
`PlatformCue`'s monogram and `StatusCue`'s checkmark — both correctly kept at the 12px floor by T019,
not the 16px content floor, since they are chrome standing in for a value rather than the value
itself. The wider selector flagged both as false violations the moment T019 landed a correctly-sized
chip. Narrowed to the `item-title` testid specifically. Also caught in the same full-suite pass: one
`FilteredEmpty` button T024 missed on its first edit of that file (font-display still present) and a
`CalendarShell` violation pre-dating this iteration's own restyle tasks (the stale-notice dismiss
button, 10px Silkscreen) — both fixed alongside the test bug.

**A tracking gap, disclosed rather than quietly corrected**: T014–T027 were implemented, verified,
and committed correctly, but their checkboxes were not ticked until this checkpoint — the brief for
the agent that did most of Phase 3's restyle work was told not to touch `tasks.md` (to avoid a
concurrent-edit conflict with the frontend track), and updating it afterward was deferred and then
missed until `/speckit-analyze` read the file against the actual commit history and found the
mismatch. No code was affected; this is a documentation-only correction, made in the same pass as the
rest of this checkpoint rather than filed separately.

**T028's own two required audits ("in both presentations") needed a real fix, not just a run.** The
theme switch is Phase 5 and does not exist yet, so both `viewport-audit.spec.ts` and
`text-size-audit.spec.ts` were parameterised over a temporary light-mode override for this checkpoint.
The first two mechanisms tried — removing the `dark` class via `addInitScript`, then an injected
`<style>` tag via the same — were both silently reverted by React hydration (`RootLayout` renders
`<html>` itself), which a screenshot comparison caught: the "light" run was byte-identical to dark.
The mechanism that works applies the override with `page.evaluate` *after* `page.goto`/`page.reload`
resolves, once hydration has already happened. Full reasoning is in `viewport-audit.spec.ts`'s
comment, so a third attempt does not rediscover the same two dead ends.

**Results**: `viewport-audit.spec.ts` 28/28 and `text-size-audit.spec.ts` 18/18, both presentations.
SC-004's greyscale requirement — inherited from 001, verified by hand there and verified by hand
again here rather than assumed carried over, since the actual colour values are new — holds in both:
outline/half-filled/solid+check and the dashed overdue border all stay distinguishable with colour
removed, confirmed against real screenshots of all three statuses plus an overdue item, dark and
light alike. Full `mobile-375` project (all four Playwright projects, not just this one): 473 passed,
1 known flake (`capture.spec.ts`'s cancel test, the documented `next dev`-only overlay intercept,
confirmed passing in isolation and unrelated to this iteration). `pnpm build`/`typecheck`/`lint` all
clean throughout.

**`/speckit-analyze` and the `reviewer` agent are the other two required gates for T028** — see below
for what each found.

**`/speckit-analyze` found one finding, MEDIUM, and it was fixed in the same pass.** `quickstart.md`'s
V4 still framed content text as an open "18px or 20px" decision for the hand-walker to make live —
*"This is the scenario where the owner decides whether 18px is enough... Deciding it here... is much
cheaper than deciding it after eleven surfaces are drawn."* T004 had already closed that on
2026-08-08, and `research.md` R-001 already says so in as many words. Left as written, the V4 step
about to run below would have re-litigated a settled call using the wrong mechanism — a side-by-side
comparison page, not the real restyled surfaces. Rewritten to state 20px as chosen and reframe the
step as verification, not decision. A LOW finding alongside it (T017's "if 18px pushes six rows past
667px" framing, doubly stale — the actual value is 20px, and the grid scrolls in its own container
per `CalendarShell`'s `h-dvh`/`min-h-0` chain, so nothing gets "pushed") needed no artifact fix, only
eyes-on during the hand-walk below.

**The `reviewer` agent found three findings, all CONFIRMED, none caught by the automated sweeps
because none of them are geometry or font-size:**

1. **`/login` was never actually restyled off the outgoing `.notch-card`/`.notch-sheet` chrome.** T014
   fixed only the two FR-034 text violations `text-size-audit` had found; the panel and the submit
   button kept the clipped-corner shape from 001's presentation, on the one screen every session opens
   first. Direct contradiction of FR-001/SC-001, and of this checkpoint's own note above claiming both
   classes were "actually gone... as each surface's own restyle task reached it" — that claim was false
   for `/login` until this fix. Both classes are now unused repo-wide and removed from `globals.css`.
2. **`CalendarShell`'s list-load error banner still read `border-brand-hi`/`bg-brand-sunk`** — the one
   error surface T015 missed when every sibling (sign-out, `ItemSheet`, `CaptureSheet`,
   `DeleteConfirm`) moved to `danger`/`danger-hi` for the brand-is-chrome-only split. No
   `--ch-danger-sunk` token exists, so the fix follows the pattern every sibling error state already
   uses — a plain danger border and text, no background tint — rather than inventing one.
3. **`DayCell`'s "+N more" button was 16px tall against FR-006's unqualified 44px floor.** T017 bumped
   it 14px→16px for FR-033's text floor and left FR-006 unaddressed, with no documented exception the
   way the micro chips beside it have one. Bumped to `h-11` (44px) rather than documented away: this is
   genuinely "a control a person taps" in FR-006's sense, and the cost — a taller cell, only on the
   rare day that overflows two chips — is bounded, since the cell already grows in place for the
   `expanded` state.

All three fixed in the same pass (`git log`: "002 T028: fix three findings from the Phase 3 reviewer
pass"). Re-verified after: `pnpm typecheck`/`lint`/`build` clean; full suite green (259/260
`mobile-375` with the one known flake reproducing as a pass in isolation, 214/214 across
`contract`+`proxy`+`client`); both `/login` presentations screenshotted at 375px to confirm the
sharp-cornered chrome now matches the rest of the product.

**The hand-walk (V1–V5) is done, scripted against a `pnpm build && pnpm start` production server on
127.0.0.1:3100, real sign-in, at 375×667.** One local-only snag first: the seed account's password in
`.env` didn't match the running database — `docker exec creatorhub-backend-1 uv run python -m
app.scripts.seed_user` reported *creating* the row rather than updating it, meaning the account had
been lost (likely a volume recreated without a re-seed) despite the container's 10-hour uptime. Fixed
by re-seeding; not a product defect, and the test item this walk captured (`T028 hand-walk check`) was
deleted afterward so the account finishes at zero items, same convention T072's walk used.

- **V1** (one machine): login and calendar both carry the same frame, lettering and sharp-cornered
  chrome — confirmed after, not before, the `/login` fix above.
- **V2/V3** (thumb reach, 44px): action band, platform filter, backlog drawer's own `+ NEW`/`CLOSE
  DRAWER`, capture sheet's `SAVE TO BACKLOG`, item sheet's status/platform columns and `SAVE
  CHANGES`/`DELETE ITEM` — all comfortably sized, nothing clipped at 375px.
  Capture is confirmed still **three interactions** (tap `+ NEW`, type, tap save) — FR-003, SC-010.
- **V4** (text legibility): a captured item's title reads clearly at 20px both in the backlog's
  collapsed peek strip (truncated with an ellipsis, not clipped mid-glyph) and in the item sheet;
  status labels, platform toggles and field labels all legible at the 12px floor. No cell measured
  looked cramped — the U1 finding above about the six-row grid's vertical budget didn't manifest with
  a live item on screen.
- **V5** (greyscale): the full calendar screen — chrome, ticker, empty-state copy, controls — stays
  legible and structurally distinguishable with `filter: grayscale(1)` applied. Status-cue shape/fill
  distinguishability specifically was already verified with real dark/light screenshots of all three
  statuses plus an overdue item at T019, which this walk's empty-then-single-item account couldn't
  re-exercise on its own — not re-litigated here, only confirmed the walk's general screens don't
  regress it.

**All three T028 gates pass.** No open findings remain from any of them.
