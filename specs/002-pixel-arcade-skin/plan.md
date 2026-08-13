# Implementation Plan: Pixel-Arcade Presentation Layer

**Branch**: `002-pixel-arcade-skin` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-pixel-arcade-skin/spec.md`

## Summary

Replace the product's presentation layer — typefaces, colour tokens, control treatment, and the frame
around the working area — with a pixel-arcade language, across **every existing surface in one
iteration**, and add the three things that language needs to be operable: a navigation drawer that
holds settings and sign-out, a remembered dark/light choice, and optional sound cues.

The technical shape follows from two facts about the existing code. First, `frontend/app/globals.css`
is already the only file in the project allowed to contain a colour, and every surface reads named
tokens from it — so the colour and type layer is a **one-file replacement**, not a sweep through
forty components. Second, `app/layout.tsx` hard-codes `class="dark"` on `<html>`, which is exactly the
place a server-rendered theme decision has to be made, so FR-013's "never show the wrong presentation
first" is reachable without an inline blocking script.

The parts that are genuinely new work, in rough order of risk: the **frame's width budget at 375px**
(the action band was measured at 356px of a 375px floor, leaving 19px, and a frame costs from both
sides); the **light presentation**, which exists today only on `/login` and is therefore new on ten
surfaces; and the **account-stored preferences**, which are the one place this presentation iteration
touches the database and the API.

## Technical Context

**Language/Version**: TypeScript 5 / React 19.2.4 / Next.js 16.2.12 (App Router); Python 3.13 for the
two backend operations.

**Primary Dependencies**: Tailwind 4, shadcn/ui, `next/font` (self-hosting VT323 + Silkscreen at build
time), Web Audio API (no audio assets, no library). **No new runtime dependency is added** — see
research R-004 and R-009.

**Storage**: PostgreSQL — two new columns on the existing `creator` row (`theme`, `sound_enabled`).
Plus one non-credential cookie, `ch_theme`, which exists solely so the server can pick the right
presentation before the document is sent.

**Testing**: Playwright across the existing four projects (`contract`, `proxy`, `client`,
`mobile-375`) and pytest for the backend. Three new suites: a text-size audit (SC-014), a theme
persistence/first-paint suite (FR-013, FR-013a, FR-013b), and a sound suite against a stubbed
`AudioContext` (SC-015).

**Target Platform**: Mobile browsers first, 375×667 as a hard floor. Deployed on Vercel (frontend) and
Render (backend) against Neon.

**Project Type**: Web application — existing `backend/` + `frontend/` trees, no new tree.

**Performance Goals**: Theme switch visibly applied in under 1 second and without navigation (SC-005).
**No additional round trip on the critical first-paint path** — the cold path already measured 44.18s
for the `/calendar` document at T072, so anything that makes the first paint wait for the network is
disqualified regardless of how correct it is.

**Constraints**: 375px floor with no horizontal body scroll; 44px minimum tap target; 16px content
text and a 12px absolute floor (FR-032–FR-034); the decorative frame must yield before any of these
(FR-008). Both presentations must satisfy every one of them, which doubles the audit surface.

**Scale/Scope**: One user. Eleven existing surfaces plus one new overlay. No new screens (FR — Out of
Scope), no new content data.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — result at the bottom of
this section.*

| Principle | Verdict | Reasoning |
|---|---|---|
| **I. Mobile-First, Thumb-First** | **PASS, and it is the principle most at risk** | FR-004–FR-009 restate it and SC-002/SC-003 measure it. The threat is specific and known: a decorative frame consumes width from both sides on a screen where the action band was measured at 356px of 375px. FR-008 makes the frame the thing that yields, and the plan spends US2 (the drawer) to buy the space back before spending it. `viewport-audit.spec.ts` already exists and is the gate. |
| **II. Personal Data Is Private By Default** | **PASS** | No entity data leaves the origin. Typefaces are self-hosted by `next/font` at build time, so there is **no runtime request to Google Fonts** and no IP disclosure (R-009). Sound is synthesised in-browser, so there is no asset request either (R-004). The one new stored fact per person is a presentation preference, which is not entity data and is returned only to its own account. |
| **III. One Core Capability Per Module** | **PASS, with the trap named** | This iteration ships **zero** new capabilities. The navigation drawer is a surface over existing screens, not a destination (spec Assumptions), and theme and sound are preferences attached to the presentation, not features of their own. The trap is FR-015 — "lists every screen" — which will be tempting to grow into a home screen, a dashboard, or a settings *page*. It is a drawer with a list and three controls. |
| **IV. The Spec Is The Source Of Truth** | **PASS, and it was exercised** | `spec.md` contains no technology. It was also the principle under load on 2026-08-06: the owner's choice to store preferences against the account **contradicted the spec's own "no new records" clause**. That was resolved by amending the spec — Clarifications and Key Entities both say so in those words — rather than by building around it. This plan inherits the amended spec, not the original framing. |
| **V. Working And Deployed Beats Polished And Local** | **PASS — this iteration *is* the dedicated pass** | It reads like a violation and is the opposite. Principle V defers visual polish "to a dedicated pass after the pipeline runs end to end"; the pipeline ran end to end at v0.1 and was tagged, so this is that pass arriving on schedule. What the principle still forbids is unchanged and applies here in full: responsive behaviour, focus states, and destructive-action confirmation are structural and may not be skipped in the restyle. |
| **VI. Merges Are Gated, Not Trusted** | **PASS** | One task, one merge request, merged only behind a green pipeline, on the project-owned runner. Nothing about a presentation change relaxes this. |
| **VII. Build For One User Until There Is A Second** | **PASS** | Two preference columns are added to the **existing single `creator` row**. That is not speculative multi-tenancy: it is data about the one user that the one user asked to be remembered. No `user_id` appears anywhere, and `content_item` is not touched. |

**Post-design re-check (after Phase 1)**: no verdict changed. The two additions Phase 1 made — the
`ch_theme` cookie and the two `/preferences` operations — were each re-tested against II and VII. The
cookie carries a two-value preference and no identifier; the operations read and write only the
authenticated account's own row and add no owner column anywhere. The one thing Phase 1 *did* change
is that principle I now has a named numeric budget rather than a warning, recorded in R-003.

## Project Structure

### Documentation (this feature)

```text
specs/002-pixel-arcade-skin/
├── plan.md              # This file
├── research.md          # Phase 0 output — R-001…R-009
├── data-model.md        # Phase 1 output — the two new columns
├── quickstart.md        # Phase 1 output — V1…V10
├── contracts/
│   └── openapi.yaml     # Phase 1 output — the two new operations plus the amended login response
├── checklists/
│   └── requirements.md  # Written at stage 1, re-validated after clarification
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

No new tree. Everything lands in the two that exist.

```text
backend/
├── app/
│   ├── models.py                # + Theme enum, + two columns on Creator
│   ├── schemas.py               # + PreferencesRead / PreferencesUpdate
│   ├── api/
│   │   ├── auth.py              # login response gains the account's preferences
│   │   └── preferences.py       # NEW — GET and PATCH
│   └── main.py                  # + router registration
├── alembic/versions/            # NEW revision — two columns, one enum type
└── tests/
    ├── test_preferences.py      # NEW
    └── test_schema.py           # amended: creator gains two columns, content_item unchanged

frontend/
├── app/
│   ├── globals.css              # THE restyle — tokens, frame, lettering, focus ring
│   ├── layout.tsx               # reads ch_theme server-side, emits the class on <html>
│   ├── login/                   # restyled
│   └── (app)/calendar/          # restyled
├── components/
│   ├── arcade/                  # NEW — Frame, Ticker, NavDrawer, SoundToggle, ThemeToggle
│   ├── calendar/ item/ backlog/ # restyled in place, behaviour untouched
│   └── ui/                      # shadcn primitives, restyled
├── lib/
│   ├── theme.ts                 # NEW — the cookie, the toggle, the correction
│   ├── sound.ts                 # NEW — synthesised cues, lazy AudioContext
│   ├── items.ts                 # + nextDue(), beside the existing countOverdue()
│   └── api.ts                   # + getPreferences / updatePreferences
└── tests/
    ├── e2e/text-size-audit.spec.ts   # NEW — SC-014
    ├── e2e/theme.spec.ts             # NEW — FR-011, FR-013, FR-013a, FR-013b
    ├── e2e/sound.spec.ts             # NEW — SC-015, stubbed AudioContext
    └── e2e/viewport-audit.spec.ts    # existing — becomes the frame's gate

design/002-pixel-arcade-skin/
└── BRIEF.md                     # stage 2, written BEFORE any surface is touched
```

**Structure Decision**: the existing two-tree web application layout is kept unchanged. The only new
directory is `frontend/components/arcade/`, which holds the chrome this iteration introduces — the
frame, the ticker, the navigation drawer, and the two preference controls. It is a directory rather
than files scattered among the calendar components because none of it belongs to the calendar: the
travel map consumes the same chrome in iteration 003, and putting it under `components/calendar/`
would guarantee it gets rewritten then.

## Stated deviations from the workflow

Two, both required to be recorded here rather than absorbed silently.

### 1. Stage 2 is built directly, not exported from Claude Design

`.claude/rules/workflow.md` stage 2 and `.claude/rules/design.md` both say components are exported
from claude.ai/design into `design/<feature>/` and then adapted. **This iteration will not do that**,
on the owner's agreement.

The reason is that the two situations are not alike. At 001 there was no visual language at all and
the export's job was to invent one from a written prompt — which is what a design tool is good at.
Here the direction's source of truth is a **screen recording of a reference site**, every surface
already exists with its behaviour settled and tested, and what changes is the token layer plus the
chrome around it. An export would produce eleven new surfaces that then have to be reconciled against
eleven working ones, which is more reconciliation than design.

**What is kept, because it is what the stage-2 gate is actually for**: `design/002-pixel-arcade-skin/BRIEF.md`
is written **before** any surface is restyled; it carries the reference observations, the hard
constraints traced to requirements, and the `DO NOT INVENT` list; and the owner reviews 375px
screenshots **in both presentations** and signs off on the typefaces and the frame thickness before
any surface is touched. The audit that BRIEF.md exists to make mechanical still runs.

### 2. This iteration changes the shared token layer

`.claude/rules/design.md` previously read "Later modules consume them; they do not introduce competing
ones", which read literally forbids this iteration. That rule was **corrected in this branch** rather
than waived: the thing it protects is a feature module growing a second parallel token set, not the
freezing of the token layer forever. The corrected rule permits replacement only by an iteration whose
entire subject *is* the token layer and which restyles every existing surface at once — which is the
definition of this one — and never as a side effect of building a feature.

## Complexity Tracking

One item. It is not a constitution violation, but it is a deliberate widening of an iteration's scope
by the owner and it should be visible rather than buried in a research note.

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Preferences stored **against the account** — two columns, two API operations, one migration, in an iteration whose Input description says it adds no records | The owner chose it on 2026-08-06 after the cost was stated: the choice then follows them to every device instead of being re-made per browser. | **Device-local storage** was recommended and rejected by the owner. It needs no database, no endpoint and no migration, and it satisfies FR-013 trivially because the answer is already on the machine. Its cost is that the choice is re-made on each device. The owner's decision stands; what it buys is recorded here so the price is not mistaken for an accident. |
| A `ch_theme` cookie **in addition** to the account column | FR-013 forbids showing the wrong presentation even briefly, and an account-stored value is not knowable when the server renders the document. The cookie is what the server reads. | **Reading the account value server-side per request** was rejected: it puts a database round trip in front of the first paint, on a stack whose cold document already measured 44.18s. **An inline blocking script reading `localStorage`** was rejected for a subtler reason — see R-002. |
