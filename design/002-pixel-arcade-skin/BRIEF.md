# Design brief — Pixel-Arcade Presentation Layer (002)

Written **before any surface is touched**, per T001 and `.claude/rules/design.md`: this iteration has
no Claude Design export as its stage-2 gate — this brief plus the owner's screenshot sign-off (T004)
is the substitute. Nothing in Phase 3 of `tasks.md` may start until T004 is signed off.

> This is the only iteration permitted to change the product's shared presentation language
> (`.claude/rules/design.md`). Every later module consumes what lands here; it does not compete
> with it.

---

## Reference direction — verbatim, because it exists nowhere else in the repository

Source: `spidey-tracker.mp4` at the repository root (gitignored, 39.3s, 2880×1704) — a screen
recording of the reference site the owner chose the direction from on 2026-08-05. **The direction
itself is settled and is not re-opened here** (`spec.md`, Assumptions).

- A thick bevelled cyan machine frame surrounds the viewport, with elements at all four corners.
- Pixel lettering **everywhere**, content included.
- Palette: cyan / steel blue for the chrome, navy for the map area, red for accents.
- **Ruled tick marks** along the top and left edges of the map area — a "measuring instrument" motif.
- A spider-web compass/radar in the lower right corner.
- A strip of moving text along the bottom.
- A loading bar built from square blocks; the boot screen reads `INITIALIZING MAP...`.
- **Tapping a pin**: the camera flies to it, then **a card floats above the pin holding a thumbnail
  image and an underlined `VIEW SIGHTING` line**. No pulse, no radar sweep — simpler than it looks.

**How to re-watch it**: Playwright's bundled ffmpeg is built `--disable-everything` and **cannot
decode mp4**. Use Chromium/Edge as the decoder — `page.goto("file://…mp4")`, seek the `<video>`, then
`locator.screenshot()`. Do not use a canvas: `file://` taints it.

---

## What travels from the reference, and what does not

The reference is a *travel map* product. This iteration is a *presentation layer* for a product that
today is a content calendar, drawn in a language the travel map will later reuse (FR-002: "the
presentation language MUST NOT encode anything specific to the calendar"). Two consequences follow
directly from that requirement, stated here so they are decided once rather than re-litigated per
surface:

- **The frame, lettering, palette, tick-mark motif, loading bar and moving-text strip travel.** They
  are chrome — they say nothing about what is inside them.
- **The spider-web compass/radar and the "tap a pin → card with thumbnail + VIEW SIGHTING" interaction
  do not travel as built.** Both are literally about a map. A calendar has no pins and no sightings.
  If a compass-like decorative element is kept, it must be re-purposed as pure chrome with no
  functional binding to anything map-specific — that is a call for the owner at T004, not a default.
  **Do not invent a calendar equivalent of "VIEW SIGHTING"** (e.g. a card that flies to a day cell) —
  no such interaction exists in `spec.md` and building one is exactly "a fifth module wearing a
  costume."

---

## Hard constraints

Not preferences. Each traces to a ratified requirement or success criterion, and a design that breaks
one is rework, not polish.

| Constraint | Source |
|---|---|
| Designed at **375px** first and fully usable there. Page body **never** scrolls horizontally — wide content scrolls inside its own container. | constitution I, FR-004, FR-005, SC-002, SC-003 |
| Every tappable control **at least 44px** in its smallest dimension. | FR-006 |
| Text-entry fields large enough that focusing one does not change page scale (implies ≥16px, same floor as the text rule below). | FR-007 |
| Decorative framing consumes **less** width at narrow viewports than at wide ones, and is never the reason FR-004/FR-005 fail — **the frame yields, it does not compete.** | FR-008 |
| Controls used frequently stay within **one thumb's reach**. | FR-009, constitution I |
| Content text (title, hook, any value in a cell or row) **≥ 16px**. | FR-032 |
| **Nothing anywhere renders below 12px** — labels, counts, the moving strip, text inside the frame. | FR-033 |
| Any text set below 16px uses the **more legible** face (VT323), never the display face (Silkscreen). | FR-034 |
| Every distinction the product makes by appearance survives **greyscale**, in both presentations. | FR-024, SC-004 |
| Motion is never the only carrier of information; everything self-animating stops under `prefers-reduced-motion`, with nothing lost. | FR-025, SC-008 |
| Every control shows a visible focus indication, in both presentations, **not clipped by the control's shape**. | FR-026, SC-011 |
| One frame, one lettering system, one control treatment, on **every** screen and overlay — no surface left in the outgoing presentation. | FR-001, SC-001 |

### The status pipeline's encoding is inherited, not redesigned

`idea` outline circle · `draft` half-filled circle · `posted` solid circle with check · overdue = a
dashed left border, orthogonal to status. This encoding is locked by 001's `research.md` R-005 and
re-asserted for greyscale by this iteration's T019. **The re-skin may change colour, weight and the
frame around this cue. It may not change what shape means what state.**

---

## DO NOT INVENT — the fields and screens that exist, and no others

Constitution IV: design work implying a new data field requires a `spec.md` amendment first. This
iteration's `data-model.md` names its **entire** scope: two new columns on `creator` — `theme`
(`dark`/`light`) and `sound_enabled` — and nothing else. `content_item` is untouched.

**Every control on a calendar surface must map to one of these six fields**, unchanged from 001:

`title` · `hook` · `platform` · `scheduled_date` · `status` · `published_url`

**Every control governing presentation must map to one of these two**:

`theme` (dark/light) · `sound_enabled` (on/off)

Anything else is a product decision wearing a visual costume. It goes to `.claude/memory.md` under
Deferred, or becomes a `spec.md` amendment — it does not go into code.

The arcade direction specifically invites a set of temptations that have already been decided against.
Checked here so they are not rediscovered mid-build:

| If the reference or a mock shows… | It implies | Verdict |
|---|---|---|
| A score, streak, level, or "high score" readout | a gamification record | Not in spec. Out of scope. |
| A health/lives bar, XP bar, or progress-toward-a-goal meter | a new stat | Not in spec. The moving strip carries exactly two derived facts (FR-027) — nothing else. |
| A volume slider or multiple sound profiles | more than an on/off | FR-020/FR-022 name one boolean. Sound is on or off, nothing in between. |
| A functioning radar/compass tracking something | live map data | This product has no map yet (003 does). Decorative only, or cut — owner call at T004. |
| A "VIEW SIGHTING"-style card that flies to a day cell | a pin-tap interaction on the calendar | The calendar has no pins. Not built here. |
| More than two presentations (e.g. a third "high-contrast arcade" skin) | a third `theme` value | FR-010 names exactly two: dark, light. |
| Achievement badges, unlockables, or an avatar | gamified identity | Constitution VII, and not in spec. |
| Ambient background music or a soundtrack | continuous audio | FR-023a and the spec's Out of Scope name this explicitly: no ambient or background audio, ever. |
| A settings screen separate from the nav drawer | a new route | FR-015/FR-016 put every setting in the **one** drawer. This iteration adds no new destinations. |

**Write the result down even when it is clean** — append findings to the bottom of this file once T004
runs, same convention as 001's `BRIEF.md`.

---

## Surfaces this iteration restyles or builds

From `tasks.md`. Existing surfaces are **restyled in place** — behaviour does not change (FR-003).
Two things are genuinely new: the ticker (`Ticker.tsx`) and the navigation drawer (`NavDrawer.tsx`).

**Restyled** (Phase 3, US1): login, header (period title + overdue count), period nav + action band,
month grid + day cell, week list, item chip / status cue / platform cue, backlog drawer, capture
sheet, item sheet, delete confirm, platform filter, first-run and filtered-empty states, the shadcn
primitives these surfaces extend.

**New** (Phase 3–6): the moving-text strip (`arcade/Ticker.tsx`, reports overdue count + next due date
only, FR-027–FR-031); the machine frame (`arcade/Frame.tsx`, decorative corner elements, not
controls); the single navigation drawer (`arcade/NavDrawer.tsx`, Phase 4, holds theme + sound + sign
out); the theme control (Phase 5); the sound control (Phase 6).

---

## Two open questions for the owner — resolve at T004, before Phase 3 starts

1. **Content text size: 18px or 20px?** VT323's x-height at 18px lands close to the outgoing Barlow's
   at 16px (research R-001); 20px matches Barlow's x-height exactly but costs vertical space in the
   month grid, which is already tight at six rows.
2. **Frame thickness at 375px** — research R-003 measures today's action band at ~379px inside a
   363px frame with today's labels, already ~16px over budget before any frame is added. The frame
   must yield (FR-008); how much of the corner/edge treatment survives at the narrowest width is a
   judgement call, not a formula.

Screenshot `/login` and `/calendar` at 375×667, both presentations, on port 3400 (not 3100 — see
`CLAUDE.local.md`), and get sign-off on both questions before any Phase 3 task starts.

---

## Audit findings

**2026-08-08 — T004 run. Both open questions answered.**

Reviewed as a side-by-side comparison (an Artifact page, not a Claude Design export — this iteration
has none) rendering the real VT323/Silkscreen files T002 self-hosts, with:
- Question 1 on a real day-cell shape at 375px, both sizes, showing chip-title truncation.
- Question 2 as three frame-thickness options (6px / 10px / 14px) with corner rivets and each
  option's action-band budget line underneath.

**Decisions:**

| Question | Chosen | Rejected | Recorded in |
|---|---|---|---|
| Content text size | **20px** — VT323's x-height matches outgoing Barlow's exactly | 18px — closer to Barlow's advance width, but the owner weighted x-height (legibility) over the vertical-space cost | `research.md` R-001 |
| Frame thickness at 375px | **10px per side** | 6px (R-003's original working number) and 14px | `research.md` R-003 |

**Consequences neither question's answer erases, both now live in `frontend/AGENTS.md`:**

- The 10px frame leaves the action band **~18px** of spare width (355px inside, ~337px needed for
  VT323 labels + `+ NEW` + 16px padding) rather than the ~26px a 6px frame would have — still fits,
  with less margin for the real built component to come in worse than the estimate. T016 must run
  `viewport-audit.spec.ts` against the actual band, not trust this arithmetic.
- The 20px content size was **not** measured against the month grid's six-row-at-667px budget — that
  question is still open and belongs to T017, which inherits a *worse* starting point than the 18px
  estimate `research.md` was written against, not a better one.

Neither answer required a `spec.md` amendment — both are inside FR-032's ≥16px content floor and
FR-008's "frame yields, does not compete" rule, just at a different point each.
