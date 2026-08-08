# Phase 0 research — Pixel-Arcade Presentation Layer

Nine decisions. The two that shape everything else are **R-001** (the typefaces, because their advance
width decides whether anything fits at 375px) and **R-002** (how an account-stored theme can be on
screen before the network has answered).

Every measurement below was taken, not estimated. Where a number is derived rather than observed, it
says so.

---

## R-001 — Typefaces: VT323 for content, Silkscreen for display

**Decision**: **VT323** carries all content text. **Silkscreen** carries display text and section
labels only. Both are loaded through `next/font/google`, which self-hosts them at build time.
**Press Start 2P is rejected.**

**Rationale — measured, from Next's own bundled font metrics.** Average advance width at 16px, and
what that means for the two widths this product actually has (the 375px floor and the 53px month-grid
day cell):

| Face | Role | Avg advance @16px | Chars per 375px | Chars per 53px cell | x-height @16px |
|---|---|---|---|---|---|
| **Barlow** (outgoing content) | content | 6.90px | 54 | 7 | 8.10px |
| **Oswald** (outgoing display) | display | 5.81px | 64 | 9 | 9.25px |
| **VT323** | content | **6.40px** | **58** | **7** | **6.40px** |
| **Silkscreen** | display | 10.67px | 35 | 4 | 8.00px |
| **Press Start 2P** | — | **16.00px** | **23** | **3** | 12.00px |

Three findings follow, and only the first is the one anyone expected:

1. **VT323 is *narrower* than the Barlow it replaces** — 6.40px against 6.90px. The feared outcome,
   that pixel lettering costs horizontal room in content, is the opposite of what the metrics say.
   Content text gains about 4 characters per line at 375px.
2. **VT323's x-height is 21% smaller than Barlow's at the same nominal size** (6.40px against
   8.10px). This is the real form of "hard to read at content size": it is not width, it is that
   16px of VT323 *looks* like about 13px of Barlow. **Resolved at T004 (2026-08-08): content is set
   at 20px**, where VT323's x-height (8.00px) matches Barlow's exactly, at the stated cost in
   vertical space. The 18px alternative — advance 7.20px, x-height 7.20px, still 11% under Barlow's —
   was screenshotted alongside it on a real day cell and rejected by the owner in favour of the exact
   x-height match. This is no longer open: the month grid's six-row-at-667px arithmetic (T017) has to
   be re-checked against 20px, not treated as settled by the 18px estimate above.
3. **Press Start 2P would have destroyed the layout, and now there is a number for it**: 16.00px per
   character is **2.3× Barlow**, giving 23 characters per 375px line and **3 characters in a day
   cell**. It is the closest face to the reference recording and it is unusable here. This settles
   the question rather than leaving it as taste.

**Consequence that has to be planned around, not discovered**: VT323 ships **one weight (400)**, and
Silkscreen ships two (400, 700). The outgoing scale used four Barlow weights and four Oswald weights.
**Typographic hierarchy can no longer be built from weight.** It has to come from size, case, colour
and the frame — which is how arcade equipment does it anyway, and which is why this is recorded as a
constraint rather than a loss.

**Alternatives considered**:

- **Press Start 2P everywhere**, the most faithful to the reference — rejected on the measurement
  above.
- **Pixelify Sans** (400–700 plus a variable axis) as a single face for both roles — it is the only
  candidate that keeps weight-based hierarchy. Rejected because one face for both roles removes the
  content/display distinction that FR-034 depends on: FR-034 requires text below 16px to use the
  *more legible* of two styles, which presupposes there are two.
- **Keeping Barlow for content and using a pixel face only for chrome** — rejected as the middle road
  the owner explicitly refused on 2026-08-05. Recorded so it is not re-proposed.

---

## R-002 — An account-stored theme that is correct at first paint

**Decision**: the authoritative value lives in the database on the `creator` row. A **`ch_theme`
cookie** mirrors it, and `app/layout.tsx` — already a server component that hard-codes `class="dark"`
on `<html>` — reads that cookie and emits the right class **in the initial HTML**. The account value
is read once per session and corrects the cookie if they disagree.

**Rationale**. FR-013 forbids the wrong presentation appearing "even briefly", and FR-013a says that
must hold even when the choice is stored remotely and the connection is slow. That rules out anything
that decides the theme after the document has been sent. Three mechanisms were on the table:

| Mechanism | Verdict |
|---|---|
| **Cookie read by the server component** | **Chosen.** The cookie arrives *with* the document request, so the decision is made before a single byte of HTML is written. Server and client agree by construction, so there is no hydration mismatch on `<html className>`. The project already runs a proxy that writes cookies from upstream responses (`app/api/[...path]/route.ts`), so the machinery exists and is tested. |
| **Inline blocking `<script>` reading `localStorage`** — the `next-themes` pattern | Rejected. It does work, and it is rejected for a specific reason rather than on taste: the server has already committed to a class by then, so the script must *correct* the DOM, which means either suppressing a hydration warning on `<html>` or accepting one. It also puts a `dangerouslySetInnerHTML` blocking script in `<head>` on every document to answer a question a cookie answers for free. |
| **Reading the account value server-side per request** | Rejected outright. It puts a database round trip in front of the first paint. T072 measured the cold `/calendar` document at **44.18s** on this stack; adding a query to that path is the one thing this plan will not do, however authoritative the answer would be. |

**How the two stay in step**, stated as rules because this is where such a design usually rots:

1. **At sign-in** the login response carries the account's preferences, and the proxy writes
   `ch_theme` in the same response that sets the session cookie. No extra round trip; the first
   authenticated document is already correct.
2. **On a toggle** the class changes immediately (SC-005 wants under a second and this is instant),
   the cookie is written from the client, and a `PATCH` goes to the backend. The visible result never
   waits for the request.
3. **On app mount** the shell reads the account value once, alongside the reads it already makes. If
   it disagrees with the cookie, the account wins and the cookie is rewritten.

**The accepted weakness, stated rather than hidden** — the same treatment `tech-defaults.md` gives to
sliding reissue. If the owner switches theme on device A, device B does **not** learn about it until
its next load, and on that load it paints the stale theme first and corrects within the same second.
FR-013a explicitly permits the device to answer from what it last showed, and the spec's edge case
explicitly anticipates the correction. What it costs is one visible flip on the *next* load of the
*other* device. Live push was rejected for the same reason `.claude/memory.md` defers live-updating
views: polling or push plus reconciliation is a larger build than this iteration's subject justifies.

**`ch_theme` is not a credential and is deliberately not `httpOnly`** — the client toggles it. It
carries one of two words and no identifier, so principle II is untouched. The session cookie's rules
are unchanged and nothing here goes near them.

---

## R-003 — The frame's width budget, and the action band problem it creates

**Decision**: the frame is **10px per side at ≤375px**, widening at larger viewports. Chosen by the
owner at T004 (2026-08-08) over the 6px working number this section originally proposed, from a
side-by-side against 14px — screenshotted with real corner rivets, not estimated. Independently of
the frame, **the action band must be re-solved before any surface is restyled**, because the
measurements below say it does not fit as it stands.

**Rationale**. The existing band was measured at T077: `MONTH/WEEK` toggle 123px, two arrows at 40px,
`+ CAPTURE` 97px = 300px of content, plus 24px of gaps and 32px of padding = **356px of the 375px
floor, leaving 19px**. A 10px frame on each side takes 20px of that — more than the 19px left, before
the type change is even applied.

Then the type change lands on top. Using R-001's advances, and holding each control's non-text chrome
constant:

| Band contents | Content width | Total with gaps + padding | Against the 355px inside a 10px frame |
|---|---|---|---|
| Today — Oswald labels | 300px | 356px | — (no frame today) |
| Silkscreen labels | ~437px | ~493px | **fails by ~138px** |
| VT323 labels at 16px | ~323px | ~379px | **fails by ~24px** |
| VT323 labels, `+ CAPTURE` → `+ NEW`, padding 32px → 16px | ~297px | ~337px | fits, **~18px spare** |

The chosen frame narrows the surviving margin from the 6px working number's ~26px to **~18px** — still
positive, but with less room to give back if a later measurement (real corner rivets, real gaps) comes
in worse than this table's estimate. `viewport-audit.spec.ts` at T016 is what confirms the built band
actually clears it; this table is not the last word.

Three things this settles:

- **Display lettering may not appear in the action band at all.** Silkscreen is 1.84× Oswald's
  advance; the band is the one place in the product with no room for that. FR-034 already forbids the
  display face below 16px; this adds a place where it is forbidden at any size.
- **Even the content face does not fit at today's label lengths.** This is not a surprise so much as
  a confirmation: T068 measured `+ CAPTURE FIRST IDEA` running 36px past the edge, and T077 measured
  a sign-out control in the band putting `+ CAPTURE` at x=417 on a 375px screen. **The band clips
  silently** — `frontend/AGENTS.md` records that a `scrollWidth` check does not catch it — so this
  has to be measured, never assumed.
- **`viewport-audit.spec.ts` is the gate**, not the overflow assertions. It sweeps every route and
  overlay and fails on any visible control whose box leaves 375px, which is the only check that has
  ever caught this failure mode.

**The four corner elements from the reference are decorative and are not controls.** They are drawn as
rivets, not buttons. A decorative element shaped like a button on a 375px screen is a tap target that
does nothing, and this iteration adds no actions (spec Out of Scope).

---

## R-004 — Sound: synthesised in the browser, no assets, no library

**Decision**: five or six short cues generated with the **Web Audio API** — an oscillator through a
gain envelope — created lazily inside the first user gesture that needs one. No audio files, no
`<audio>` elements, no library.

**Rationale**:

- **Nothing is downloaded**, so there is no asset pipeline, no format matrix, no preloading question,
  and no third-party request. Given principle II and given that the cold path already costs 44s, not
  adding bytes to it is worth more than fidelity to any particular sample.
- **Autoplay policy is satisfied by construction.** Browsers require an `AudioContext` to be created
  or resumed inside a user gesture. FR-023a restricts sound to actions — capture, save, delete, move,
  and refusals — so the first sound is *always* inside a gesture. FR-021 ("nothing about sound stands
  between opening the product and using it") is then true without special handling: no context is
  created until a sound is actually wanted.
- **FR-023 (behave identically whether or not sound is audible)** becomes a coding rule: playback is
  fire-and-forget, never awaited, and every failure is swallowed. No code path may branch on whether
  a sound played.

**Testing SC-015, which is the part that needs a decision rather than an implementation.** Playwright
cannot hear anything. The suite will **stub `AudioContext` in the page** and count `createOscillator`
calls per interaction — which asserts the real module's real decisions right up to the browser
boundary, and is a different thing from asserting a mock the module was written around. The two cases
worth pinning are the ones FR-023a is about: a data-changing action produces exactly one cue, and a
navigation interaction produces zero.

**Alternative considered**: short `.mp3`/`.ogg` assets, which is what an arcade cabinet actually
sounds like. Rejected on cost rather than on quality — cues are 40–120ms, and the synthesis is a
dozen lines against an asset set, two formats, a preload strategy and a cache story.

---

## R-005 — The moving strip is a projection of state the screen already holds

**Decision**: the strip renders **`countOverdue(visible)`** — the exact value the header count already
renders — and **`nextDue(visible)`**, a new pure function beside it in `lib/items.ts`. It is fed from
`CalendarShell`'s existing `visible` list. Motion is a CSS animation over content that **already fits
in 375px**, disabled under `prefers-reduced-motion: reduce`.

**Rationale**. FR-028 requires the strip and any other surface reporting the same fact to be "two
presentations of one value, never two independent readings". Passing `visible` and reusing
`countOverdue` makes that true by construction rather than by discipline: there is one function, one
call site chain, and no second query. It also inherits, correctly and for free, the non-obvious rule
`frontend/AGENTS.md` records — that the header counts **narrow with the platform filter** while period
navigation does not. A strip fed from anything else would have had to re-derive that rule and would
eventually have disagreed with the header.

**Why the strip moves at all if its content fits.** FR-031 requires everything readable while
stationary, which sounds like it makes the motion pointless. It does not: the strip scrolls a
*repeating* band — the two facts separated by arrow glyphs — so at any instant, moving or stopped, both
facts are on screen. The motion is the arcade affordance; the information is not in it. That is
exactly what FR-025 demands and it is why the two requirements do not collide.

**FR-030's empty state** is a sentence, never a blank: with nothing overdue and nothing scheduled the
strip reads `ALL CLEAR · NOTHING DUE`. A strip that empties itself reads as broken, and this product
already learned the general form of that at T068 — there are three distinct empty states on the
calendar and collapsing any two of them tells the owner something false.

---

## R-006 — What the existing 432 tests do under a re-skin

**Decision**: no baseline images exist anywhere in the suite, so **a re-skin cannot cause a mass
failure**. Three suites must be re-measured and three are new.

**Rationale, checked against the suite rather than assumed**:

- **`focus-states.spec.ts` compares screenshot bytes between *focused* and *unfocused* states of the
  same build.** There is no committed baseline to re-bless. It stays green through any restyle that
  keeps a visible focus indicator — which is precisely what it is for, and it is the only mechanism
  that has ever caught a focus ring clipped away by a `clip-path`. **What must be re-derived** is
  which shapes clip: `.notch-card` and `.notch-sheet` are being replaced by the frame treatment, so
  the two `.focus-ring-inset` cases have to be re-established from scratch, not carried over.
- **`viewport-audit.spec.ts` becomes the primary gate for FR-004/SC-002**, per R-003.
- **The 44px assertions scattered across `login.spec.ts`, `item-sheet.spec.ts` and
  `platform-filter.spec.ts` all survive** and are exactly what should stop the restyle shrinking a
  control. Do not relax one to make a pixel border fit.
- **Everything that asserts behaviour** — the pipeline flow, drag, the 409 handling, the published
  link, the three empty states — is untouched by this iteration and any failure there means the
  restyle changed behaviour, which FR-003 forbids.

**Three new suites**:

| Suite | Covers | Shape |
|---|---|---|
| `text-size-audit.spec.ts` | SC-014, FR-032–FR-034 | Sweeps every route and overlay like the viewport audit does, reads computed `font-size` on every visible text node, fails below 12px or below 16px for content. |
| `theme.spec.ts` | FR-011, FR-013, FR-013a, FR-013b | Asserts the class on `<html>` **in the served document**, before JavaScript runs — the only assertion that can tell "no flash" from "corrected quickly". |
| `sound.spec.ts` | SC-015, FR-020, FR-023a | Stubbed `AudioContext`, counting cues per interaction. |

**Both presentations double the audit surface.** The light presentation exists today only on `/login`,
so it is new work on ten surfaces, and every audit above has to run in both. That is a task-count fact
and belongs in `tasks.md`, but it is recorded here because it is the thing most likely to be
underestimated.

---

## R-007 — The navigation drawer beside the backlog drawer

**Decision**: the navigation drawer is a left-entering sheet over the whole viewport, layered **above**
the backlog drawer, with a scrim. It does not close the backlog drawer and does not restore it — it
covers it, and dismissing returns the screen exactly as it was.

**Rationale**. FR-019 says neither surface may trap the person nor cancel the other, and the spec's
edge case names two overlapping surfaces at 375px as the case most likely to strand someone. The
existing backlog drawer is deliberately **not** a modal dialog and has no focus trap, because capture
must stay reachable from it — so the navigation drawer cannot rely on the backlog drawer's own
dismissal behaviour and must sit cleanly on top with its own dismissal.

**FR-018 ("losing nothing they had entered or opened") is the requirement with teeth here.** The
capture sheet keeps its text through a refused save by design; opening and dismissing the navigation
drawer over an open capture sheet must not be the one thing that discards it. That is a test, not a
hope.

**FR-017 places sign-out.** It moves out of the header and into this drawer, and it sits at the
**far end** of it — further from the thumb than the navigation entries, per FR-017. This is the same
reasoning T077 recorded when it put sign-out in the header rather than the action band: distance from
the thumb is a feature for the one control whose mis-tap ends the session.

---

## R-008 — Building stage 2 directly instead of exporting from Claude Design

**Decision**: recorded in `plan.md` under *Stated deviations*, not here, because a deviation from the
workflow belongs where the constitution says a stack substitution belongs — in the plan, stated
explicitly. This entry exists so a reader of `research.md` alone is not left thinking it was
overlooked.

---

## R-009 — Typefaces are self-hosted, so no request leaves the origin

**Decision**: load both faces through **`next/font/google`**, which is already how Oswald, Barlow and
Geist Mono are loaded in `app/layout.tsx`.

**Rationale, and it is a principle II matter rather than a performance one.** `next/font/google`
downloads the font files **at build time** and serves them from the application's own origin; the
browser never contacts `fonts.googleapis.com` or `fonts.gstatic.com`. A runtime font request would
disclose the visitor's IP address and the page they are on to a third party on every visit. That is
not entity data, so it is not a principle II *violation* — but principle II's direction is clear
enough that a free alternative with zero third-party requests needs no argument.

**Verified**: both faces are present in Next 16.2.12's bundled Google font manifest — VT323 at weight
400 only, Silkscreen at 400 and 700. That check is what R-001's single-weight consequence rests on.

**Do not add `<link rel="preconnect">` to a Google domain.** It appears in most Next font tutorials,
it does nothing when fonts are self-hosted, and it reintroduces exactly the third-party contact this
decision exists to avoid.

---

## Open items

One, and it has a stated fallback rather than being a blocker:

- **VT323's optical size at 18px.** R-001 sets content at 18px on the measurement that its advance and
  cell capacity then match the outgoing Barlow at 16px, while its x-height still trails by 11%.
  Whether that reads as "smaller" to the owner is a judgement no metric settles. **Resolved at stage
  2**, from 375px screenshots in both presentations, with 20px as the recorded fallback (x-height
  8.00px, matching Barlow exactly) at a cost in vertical space that the month grid's two-chip cap
  will feel first.
