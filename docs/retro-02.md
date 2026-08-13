# Retro 02 — Pixel-Arcade Presentation Layer (v0.2)

**Feature**: `specs/002-pixel-arcade-skin` · **Written**: 2026-08-11 (workflow.md stage 8) ·
**Not yet deployed** — this iteration replaces the presentation layer, not the deployment; MR !63
merges `002-pixel-arcade-skin` into `main`, and the `deploy` jobs stay manual per `tech-defaults.md`,
so pushing this to the live environment is a separate, deliberate step after the merge.

53 tasks, 7 phases (plus one inserted sub-phase, 7a), one merge request carrying the entire branch.
The product is what `spec.md` said it would be — every FR and SC hand-walked at T044, one real
production-only defect found and fixed along the way. Unlike 001, this iteration touches **zero**
content behaviour: FR-003/SC-010 require every task completable before this change to remain
completable afterwards, in no more interactions, and T044's V11 re-walked 001's entire quickstart to
prove it.

This document does three things, in order: it checks shipped behaviour against every acceptance
criterion; it records the process facts stage 8 requires — including one this iteration is not proud
of; and it says what to do differently next.

---

## 1. Shipped behaviour against every acceptance criterion

**Where the evidence comes from.** T044 hand-walked `quickstart.md` V1–V11 against a **real
production build** — `pnpm build && pnpm start`, real Docker `backend`, real Postgres, the single
seeded creator signing in for real — not the stubbed proxy every automated `tests/e2e/` file uses.
Where the walk and the automated suite could both speak to a criterion, the walk is cited first, for
the same reason 001's retro gives: a green suite is evidence about the frontend in isolation.

### 1.1 Success criteria (spec.md §Success Criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| SC-001 | Zero screens/overlays in the previous presentation | **PASS** | T044 V1: seven surfaces screenshot, eyebrow reads `VICTOR TRACKER · ISSUE #08`, no calendar-specific chrome text. |
| SC-002 | At 375px, zero controls have any part beyond the screen edge | **PASS, both presentations** | T044 V2/V2-light: `0 controls off-screen` each. |
| SC-003 | At 375px, zero horizontal body scroll | **PASS, both presentations** | Same walk: `body 375/375` each. |
| SC-004 | All three pipeline states plus overdue distinguishable in greyscale, both presentations | **PASS** | T043: 24 screenshots (`design/002-pixel-arcade-skin/greyscale/`); T044 V5/V5-light confirmed status cues visible after `grayscale(1)`. |
| SC-005 | Presentation switch takes effect in <1s, same scroll position | **PASS** | T044 V6: "switch dark→light applied in place." |
| SC-006 | Remembered presentation is first seen on 100% of return visits, incl. a new device and a slow connection | **PASS, with one leg not independently re-walked** | T044 V6 confirmed persistence, a second device, and no-flash (raw `<html>` carries the class server-side, before any JS runs). The "default is dark" leg and the throttled-connection leg were not re-walked by hand against the one seeded account — see §1.2. |
| SC-007 | Every screen reachable in ≤2 interactions from any other | **PASS** | T044 V7: dismiss-loses-nothing, two-overlays-coexist, and every drawer control present, all confirmed. |
| SC-008 | With reduced motion requested, no information available with motion is unavailable without it | **PASS, by the automated suite, not independently re-walked** | `tests/e2e/reduced-motion.spec.ts` (T042) drives this exact scenario against a real browser; T044 V9 cross-references it rather than repeating the same assertions by hand. |
| SC-009 | Fresh start, no choices made → zero sound across a complete pass | **PASS** | T044 V8: navigation-only produced zero oscillator calls while sound was off. |
| SC-010 | Every task from 001's validation walk still completes, in no more interactions | **PASS** | T044 V11 re-ran 001's entire quickstart (V2, V2b, V4, V5, V3, V6, V7, V8, US4, V9) against the same production build. All ten passed; capture is still 3 interactions, 1.55s. |
| SC-011 | Every control shows a focus indication, both presentations | **PASS, by the automated suite** | `tests/e2e/focus-states.spec.ts` (T008) compares focused/unfocused **bytes**, the only mechanism that has ever caught a clipped ring. |
| SC-012 | Every fact the strip reports is readable from a single still image | **PASS** | T044 V10: frozen screenshot readable (`ALL CLEAR · NOTHING DUE`). |
| SC-013 | The strip and any other surface reporting the same fact never disagree | **PASS** | T044 V10: header and ticker counts compared directly, agreed. |
| SC-014 | Zero text below 12px anywhere; zero content text below 16px | **PASS** | T044 V4: measured sizes all ≥12px; content text is 20px (T004's owner-verified sign-off). |
| SC-015 | With sound on, a complete pass produces sound only on data-changing actions and refusals | **PASS** | T044 V8, the most rigorously tested criterion here: capture produced one cue; navigation (view toggle, filter, both with sound on) produced **zero**; a refusal produced a distinguishable `sawtooth` cue. |

**Fifteen of fifteen hold.** Unlike 001 (eleven of twelve, one infrastructure-caused failure), nothing
here fails — the two "not independently re-walked" notes (SC-006's default leg, SC-008/SC-011's
reliance on the automated suite) are coverage notes, not failures, and are named rather than glossed
over for the same reason 001's SC-010 was: **a criterion whose evidence is a citation should say so.**

### 1.2 SC-006's un-walked leg, in full

Quickstart V6 has six checks. T044 walked five directly. The sixth — "with no choice ever made,
dark" — could not be independently re-verified against the one seeded production account, because
**that account no longer has no choice**: T044's own V6 walk switched it to light and back as part of
proving the switch itself works, so by the time this leg would run, the account has a real, explicit
preference. Re-seeding a second account to get a clean "never chosen" state is not available —
`CLAUDE.local.md` records that a different email is refused outright, because `content_item` has no
owner column and two creators would silently share every item.

**What closes the gap instead**: `research.md` R-002 and FR-010 fix the default in the code path
itself (`readTheme()` falls back to `"dark"` when the cookie is absent or invalid), and
`tests/e2e/preferences.spec.ts`'s stubbed suite constructs the fresh-account fixture the real database
cannot. Recorded as covered-by-citation rather than ticked from direct observation, the same honesty
001's SC-010 (session survives 30 days, unobservable in a day) was held to.

### 1.3 The one real defect found, and why only production caught it

**FR-018**: "Dismissing that place [the nav drawer] MUST return the person to exactly where they
were, losing nothing they had entered or opened." `nav-drawer.spec.ts`'s own test for this (T031) used
the drawer's **close button** and passed. T044's hand-walk tried the **Escape key** instead — an
equally natural dismiss gesture nobody had automated — and found it closed the capture sheet
underneath the drawer too, discarding whatever the creator had typed.

**The mechanism**: `CaptureSheet` is a `@base-ui/react` Dialog, which arms its own document-level
Escape listener the instant it opens. `NavDrawer` is deliberately *not* one of those primitives (its
own docstring explains why — becoming one would make it a focus trap, which would fight the very
sheet FR-018 protects), so it registered a second, independent, same-phase listener of its own. Two
listeners on the same phase run in **registration order**, and the sheet's — armed first, when it
opened — ran before the drawer's, closing the sheet before the drawer's own handler got a turn.

**It is racy, not deterministic, and that nearly produced a false "not a bug" conclusion.** A minimal
Playwright test reproducing the identical steps did *not* reproduce it under `next dev` — several
clean passes on the pre-fix code. A hand-rolled script running the same steps against the exact same
**production build** reproduced it five times running. The fix (a capture-phase listener plus
`stopPropagation()`, closing the race rather than depending on winning it) was verified the same way:
five consecutive clean runs against a fresh production build, plus a new regression test that is a
real CI guard (CI runs the production bundle) even though it cannot reproduce the original bug
locally under `next dev` — the same dev/production asymmetry 001's retro §2.4 already names as this
project's sharpest recurring lesson.

**Cost, and what it says about coverage**: this iteration shipped 511 Playwright tests and the bug
existed for the entire time NavDrawer's Phase 4 work was on this branch (since T031) without anything
catching it, because nothing had tried the Escape key against that specific combination of overlays.
Same shape as 001's §2.2: **coverage counting whether a scenario exists is not coverage of every
plausible route through it.**

---

## 2. Process facts stage 8 requires

### 2.1 The constitution VI exception this iteration created, and did not catch until T045

**This is the finding this retro is least comfortable writing, and it is written unsoftened anyway.**
`002-pixel-arcade-skin` accumulated **33 commits, T001 through T053, entirely on the feature branch,
with no merge request ever opened against `main`** — not a bounded, early exception like 001's (which
ran for 25 merges before the gate existed, then closed it), but the **entire iteration's history**,
discovered only when the `reviewer` agent was run at T045 and noticed the branch had never been
merged. `/speckit-analyze` — which reads artifacts against each other — structurally could not have
found this; it took a review that checks the repository's actual state.

**One concrete consequence**: the FR-018 fix from §1.3 existed only in an uncommitted working tree at
the moment the `reviewer` agent reported this, meaning the regression was still live on
`origin/002-pixel-arcade-skin` while this retro's earlier sections were already describing it as
fixed. Had this gone unnoticed, T047 would have tagged a release built from `main`, which would not
have contained *any* of Phase 6 through Phase 7a — no sound, no reduced motion, none of the
comic-tech pass, and a live FR-018 bug.

**Resolution, decided with the project owner rather than unilaterally** (the scale — 32+ commits
touching `main` for the first time this iteration — warranted asking): one merge request for the
**entire branch**, T001 through T053, rather than a retroactive one-MR-per-task split. Recorded here
as the stated constitution VI exception this iteration owns, the same shape as 001's own 25-merge
exception in kind, larger in scope. **There is no excuse recorded for *why* it happened this way** —
unlike 001's exception, which had a real constraint (no GitLab project existed yet), this branch had
a working remote and a working gate the entire time; commits simply kept landing directly on it
without anyone routing them through the MR flow the project's own `tasks.md` states as its working
agreement on every single phase. The honest account is that the working agreement was stated and not
followed, and the review gate is what caught it — which is exactly what the gate is for.

### 2.2 Two gates, findings, overlap

- **`/speckit-analyze`** — **1 finding** (MEDIUM): `spec.md`'s Assumptions section did not
  cross-reference the second, more detailed comic-tech brief that supplemented the original visual
  reference mid-iteration. Verified non-contradictory (both trace to the same
  `spidey-tracker.mp4`-derived, Spider-Verse direction) before fixing — a documentation gap, not a
  substance violation.
- **the `reviewer` agent** — **3 findings**: the unmerged-branch finding (§2.1, by far the most
  consequential of either gate this iteration), the still-live FR-018 regression (§1.3, found because
  the agent checked the *committed* code rather than trusting `tasks.md`'s claims about the working
  tree), and one stale comment (`PlatformFilter.tsx` claiming a token was "the darkest... in both
  presentations" when it is near-white in light mode — the rendered result was correct regardless,
  since the text always sits against the brand fill rather than the page background, but the
  reasoning as written was wrong).
- **Findings appearing in both lists: 0.** Same structural reason 001's retro gives: `analyze` reads
  artifacts against each other, `reviewer` reads the repository against the world. Here that
  difference was the whole story — the single most important finding of this iteration was invisible
  to the tool that only reads specs, because the defect was not in the specs.

### 2.3 A repeated shape: dev-mode testing is structurally blind to a class of production-only defect

Three separate incidents this iteration, all the same underlying shape — something that only manifests
under `next start` (or a non-default origin), never under `next dev`:

| Incident | What `next dev` hid |
|---|---|
| T057 (prior checkpoint, cited from `frontend/AGENTS.md`) | The dev overlay physically covers the `MONTH`/`WEEK` toggle at 375px |
| T043/T044 script (this iteration) | Turbopack's cross-origin dev-resource guard silently breaks hydration when a script points at `127.0.0.1` instead of `localhost` — no error, chunks all report 200, the page just never becomes interactive |
| NavDrawer's FR-018 bug (§1.3, this iteration) | The Escape-handler race reproduces reliably under a production build's timing and not at all under a slower dev-mode render |

**None of these are the same bug, and treating the pattern as one bug would be the wrong lesson.**
What they share is the two-part structure 001's retro §2.4 already named: CI runs the production
bundle, so a defect invisible in dev is not invisible to the gate — but a **human** iterating locally
with `pnpm dev` (the default, the faster inner loop) can go an entire session without ever seeing it.
**The fix each time was the same kind of fix**: verify the specific claim against the actual build
mode in question rather than trusting that dev and production agree, and when they visibly disagree,
trust production — it is what ships.

### 2.4 The greyscale/status encoding held under a full visual-language replacement

Worth recording as a **positive** finding, since 001's retro is mostly a list of things that went
wrong: FR-024/SC-004 required every appearance-based distinction to survive colour removal, in a
presentation-layer iteration whose entire job was to replace the appearance layer. It held without a
single fix needed. The reason is structural, not luck: 001 encoded status as **shape and fill**
(outline/half-fill/solid+check), never as hue, specifically so a future re-skin could change every
colour without touching the thing that carries the distinction. This iteration's comic-tech pass
(T050) even **added** a new shape-based cue (a squared corner on the active platform tab) rather than
a colour-only one, on the same principle. A design decision made for a stated reason in 001 paid for
itself, unprompted, in 002.

---

## 3. Estimates, scope, and friction

### 3.1 Phase 7a: a real, documented scope decision, not creep

The owner's 14-section "comic-tech" brief arrived mid-Phase-7 and was **not** treated as automatic
scope for this iteration. `.claude/rules/design.md`'s rule — a token-layer redesign is only permitted
in the iteration whose entire subject is the redesign — was the actual constraint that decided it:
finishing the brief here was the only compliant option, because deferring the remainder to a future
feature module would make that module's iteration a second, competing re-skin. This is the correct
reading of the rule, but it is worth naming that the rule effectively removed the choice rather than
the owner and Claude weighing scope on the merits — a presentation iteration that leaves its own
scope open for as long as this one did (2026-08-08 to 2026-08-11, mid-brief additions arriving after
Phase 6 was already built) is a harder shape to close cleanly than 001's fixed-scope original spec.

**Nothing outside `spec.md`'s FR set was built.** The comic-tech pass changed *how* FR-001/FR-002/
FR-024 were satisfied (chrome, branding text, micro-animations), not *what* the iteration does. The
one new piece of copy — `VICTOR TRACKER · ISSUE #NN` — was checked against FR-002 ("must not encode
anything specific to the calendar") both by the `reviewer` agent and by T044's own V1 walk, and holds:
it lives in calendar-specific code (`CalendarShell.tsx`), not the shared `Frame`/`Ticker`/`NavDrawer`
chrome, so it is calendar-*presenting* rather than calendar-*encoding* — but this is a distinction
worth stating for iteration 003, whose map will not reuse this exact eyebrow pattern, only the fonts
and frame underneath it.

### 3.2 The MR-bundling deviation was found late enough to have been expensive

§2.1 is the sharpest instance, but it is also a *process* finding worth separating from the specific
NavDrawer consequence: **nothing about `tasks.md`'s own "Verified: pnpm typecheck/lint/build clean...
N passed" notes, recorded after every single task in this iteration, distinguished a locally-verified
change from a CI-gated one.** Every note reads the same whether the code behind it was three commits
from `main` or thirty-three. That is the gap a future iteration should close structurally, not just
by remembering to check `git log --oneline main..HEAD` occasionally.

### 3.3 Friction between SpecKit, the working agreement, and the reviewer gate

- **The working agreement was correctly *stated*, in `tasks.md`'s own header, on every phase of this
  iteration** — "One task, one merge request, merged only behind a green pipeline" — **and was not
  followed once**, from T001 onward. Stating a rule at the top of a file is not the same as a
  mechanism that enforces it. 001 had `main`'s branch protection to force the issue after T025; this
  branch never pushed anything to `main` for the protection to apply to.
- **The `reviewer` agent, run at the checkpoint this project's own workflow schedules it for (T045,
  before tagging), is what caught it** — exactly the shape 001's retro recommends in its own §4.3
  ("run both review gates at every checkpoint"), except here the gate that mattered was the one whose
  job is reading the repository's actual state, not the specs.
- **The runner and the pipeline itself worked without incident** this iteration, once actually
  invoked — one transient network timeout downloading `pytest` (`ci_quota_exceeded`'s cousin, a
  `UV_HTTP_TIMEOUT`, not a quota problem), resolved by a retry with no code change, same lesson as
  001's §3.3 "the network, on the final night."

---

## 4. What to do differently in 003

1. **Push after every task, not at a checkpoint.** The single largest process failure this iteration
   produced (§2.1) is structurally prevented by doing what `tasks.md` already says to do — the fix is
   discipline, not a new rule, but it is worth making mechanical: `git log --oneline main..HEAD` as a
   literal step in the per-task checklist, not something only a review agent happens to notice.
2. **Verify a claimed fix against the build mode that actually ships**, every time, not just when a
   known trap (like the dev overlay) is already suspected. §2.3's three incidents were each found by
   accident-adjacent means (a screenshot script's silent hang, a hand-walk trying an untested key).
   The generalizable check: before trusting "verified locally," ask whether "locally" meant `next dev`
   or the production bundle CI actually runs.
3. **A hand-walk that tries an alternate route through an already-tested scenario is worth its own
   line item**, not just diligence. FR-018's bug existed behind a *passing* automated test the whole
   time; the walk found it by trying Escape where the test had only ever tried a button. Quickstart
   scenarios for 003 should name at least one "try it a different way" check per interactive overlay.
4. **Keep encoding meaning as shape/fill, never as hue alone**, and expect a future re-skin to pay for
   it the way this one did (§2.4). Nothing to change — a confirmation that the rule is worth carrying
   into the map's own pin/status vocabulary.
5. **State an iteration's scope boundary before mid-iteration input arrives, not after.** Phase 7a
   worked out cleanly, but it worked partly by luck of timing (Phase 6 was already built when the
   fuller brief landed). A rule like design.md's ("only the iteration whose entire subject is the
   redesign may touch tokens") is a good backstop; it should not be the *only* thing standing between
   an iteration and open-ended scope growth.

---

## 5. Constitution amendments proposed

**None from this iteration's own work.** The two preference columns (`theme`, `sound_enabled`) are
data about the single existing user, not speculative multi-tenancy (principle VII holds); no new
capability was added (principle III — the drawer is a surface over existing screens, not a
destination); FR-002 held under an entire chrome replacement including a second brief (principle IV,
tested at both `/speckit-analyze` and by the `reviewer` agent independently).

**One amendment is already scheduled, and belongs to iteration 003, not this retro**: `.claude/memory.md`'s
Deferred section records that the "Victor Tracker" travel/route/budget product spec needs a
constitution amendment (permitting route planning and budgets, both currently named exclusions) before
`/speckit-specify` can run against it. That amendment is 003's stage-1 work, not 002's — named here
only so it is not mistaken for something this retro should have done.
