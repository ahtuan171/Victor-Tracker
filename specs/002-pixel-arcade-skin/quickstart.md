# Quickstart validation — Pixel-Arcade Presentation Layer

Eleven scenarios, V1–V11. Each maps to success criteria in [spec.md](./spec.md) and each says what
*should* happen, so a failure names a requirement rather than a feeling.

**Two things make this walk different from 001's**, and both roughly double it:

- **Everything runs in both presentations.** The light one exists today only on `/login`, so on ten
  surfaces it is being seen for the first time. A scenario that passes in dark and was not tried in
  light is not passed.
- **V11 is the regression walk.** This iteration must change nothing about what the product *does*
  (FR-003, SC-010), so 001's own quickstart is re-run in full as the last scenario. A presentation
  change that quietly cost an interaction is the failure this catches.

---

## Prerequisites

```bash
docker compose up -d db backend          # wait for /health to answer 200
cd backend && uv run alembic upgrade head   # this iteration adds a revision
```

Then, **from `frontend/`, a production build** — not `pnpm dev`:

```bash
pnpm build
API_BASE_URL=http://127.0.0.1:8000 SESSION_COOKIE_SECURE=false pnpm start
```

Both variables are load-bearing. Next's dev overlay sits over the `MONTH` toggle at 375px, and
without `SESSION_COOKIE_SECURE=false` a correct sign-in bounces straight back to `/login`.

**Set the viewport to 375 × 667 and leave it there.** `F12` → `Ctrl+Shift+M` → iPhone SE. A finding
from a maximised desktop window is a finding about a layout nobody designed.

The automated counterparts:

```bash
pnpm exec playwright test                       # all projects
pnpm exec playwright test viewport-audit        # V2's gate
pnpm exec playwright test text-size-audit       # V4's gate
pnpm exec playwright test theme                 # V6
pnpm exec playwright test sound                 # V8
cd backend && uv run pytest tests/test_preferences.py
```

---

## V1 — One machine, not two products *(SC-001, FR-001, FR-002)*

Visit every surface in turn: `/login`, `/calendar`, the capture sheet, the backlog drawer collapsed
and expanded, the item sheet, the delete confirmation, the platform filter, the filtered-empty state,
the first-run state, and the navigation drawer.

**Expect**: one frame, one pair of typefaces, one control treatment, one focus indicator throughout.

**Fails if** any single surface still carries the previous editorial presentation — that is what
SC-001's "zero screens" means. Also fails if the language encodes anything calendar-specific
(FR-002): the travel map consumes this same chrome in iteration 003, and a frame that says
`CALENDAR` in its border is a frame that has to be rebuilt.

---

## V2 — Nothing leaves the screen *(SC-002, SC-003, FR-004, FR-005, FR-008)*

**This is the scenario most likely to fail, and the one where trusting the wrong check has cost this
project time twice.**

On every surface from V1, in both presentations, confirm no control has any part beyond the right
edge and the page body does not scroll sideways.

**Do not conclude anything from a `scrollWidth` comparison.** The action band clips rather than
extending the document's scroll width — measured twice, at T068 and T077, where a control sat 36px
and 42px past the edge with the overflow check reading `false` the whole time. Run
`viewport-audit.spec.ts`, which asserts each control's box against the 375px width, and look at the
band with your own eyes.

**Expect** the action band to have been re-solved: research R-003 measures it at ~379px inside a 363px
frame with today's labels, i.e. **failing by ~16px before anything else goes wrong**. Whatever the
chosen fix, all four controls must still be there and still be tappable.

---

## V3 — Every tap target is still 44px *(FR-006, FR-009)*

Measure the smallest dimension of every control: the band, the status and platform options in the item
sheet, the filter row, the drawer entries, the theme and sound controls, both dialog buttons.

**Expect** 44px minimum everywhere. The existing suites already assert this in several places —
**do not relax one to make a pixel border fit**. A border is decoration; FR-008 says decoration
yields.

Then check thumb reach: the frequently used controls — capture, status change, date change — stay in
the bottom half. Sign-out does not, deliberately (FR-017).

---

## V4 — Text is readable *(SC-014, FR-032, FR-033, FR-034)*

**Expect**: content text at 18px (research R-001 sets it there, above FR-032's 16px floor, because
VT323's x-height is 21% under the Barlow it replaces); nothing anywhere below 12px; and nothing below
16px set in the display face.

Read an item title in a month-grid day cell — the ~53px cell is where legibility dies first. Read the
ticker. Read the smallest label you can find inside the frame.

**This is the scenario where the owner decides whether 18px is enough.** R-001 records 20px as the
fallback, at a cost in vertical space the month grid's two-chip cap feels first. Deciding it here, from
a real screen, is much cheaper than deciding it after eleven surfaces are drawn.

---

## V5 — Meaning survives greyscale *(SC-004, FR-024)*

Screenshot the calendar with items in all three statuses, at least one of them overdue, **in each
presentation**, and convert to greyscale.

**Expect** to tell `idea`, `draft` and `posted` apart, and overdue from not-overdue, without reading
any text. Status is shape and fill; overdue is a dashed border — a dash pattern is a shape and
survives.

**Fails if** the new palette made two states rely on hue. The old tokens were designed against this
criterion and the new ones inherit the obligation, not the values.

---

## V6 — The remembered presentation *(FR-010–FR-014, SC-005, SC-006)*

Six checks, and the last three are the ones an implementation usually gets wrong:

1. **Switch.** Open the navigation drawer, switch to light. It applies in under a second and you stay
   exactly where you were — same screen, same scroll position, same open panel.
2. **Persist.** Close the tab, reopen. Light.
3. **Default.** With no choice ever made, dark.
4. **No flash.** Reload with light chosen. **Dark must never appear, not even for one frame.** Check
   this properly: view source on the served document and confirm `<html>` already carries the light
   class *before any JavaScript runs*. A correction that happens in 50ms still fails FR-013.
5. **Another device.** Sign in on a second browser profile. Light there too (FR-011).
6. **Slow connection.** Throttle to slow 3G and reload. Still light from the first frame (FR-013a) —
   the device answers from what it last showed rather than waiting.

Then the sign-in screen (FR-013b): sign out and confirm `/login` uses the last presentation this
device showed, and that nothing flips once you sign back in.

**Known and accepted**: switch theme on device A and device B keeps showing the old one until its next
load, where it paints stale-then-corrects once. That is stated in research R-002 and in the spec's
edge cases. It is not a bug report.

---

## V7 — One place for navigation and settings *(FR-015–FR-019, SC-007, FR-003)*

From every screen, open the drawer. **Expect** every screen listed and reachable, plus the theme
control, the sound control, and sign-out.

Then the three that are about not trapping anyone:

- **Dismiss loses nothing.** Type a title into the capture sheet, open the drawer over it, dismiss.
  The sheet is still open and the text is still there (FR-018). The capture sheet already keeps text
  through a refused save; the drawer must not be the one thing that discards it.
- **Two overlays coexist.** Expand the backlog drawer, then open the navigation drawer over it.
  Neither cancels the other and there is always a way out of both (FR-019).
- **Sign-out is not one accidental tap.** It sits further from the thumb's resting position than the
  frequent actions (FR-017).

**Expect at most 2 interactions** between any two screens (SC-007).

---

## V8 — Sound, silent until asked for *(FR-020–FR-023a, SC-009, SC-015)*

1. **Fresh account, volume up.** Walk the entire product, sign-in to sign-out. **Zero sound.** Nothing
   asked you about sound on the way in (FR-021).
2. **Turn it on.** Capture an item, save an edit, drag an item onto a day, delete one. Each produces
   one short cue.
3. **Provoke a refusal** — move an item past `idea` with no platform. A **distinguishable** cue.
4. **Navigate only.** Period arrows, month/week toggle, platform filter, open and close a panel.
   **Silence** (FR-023a, SC-015). This is the check that keeps the feature from becoming the noise
   that gets it turned off.
5. **Turn it off.** Immediately silent, and still silent after reopening (FR-022).
6. **Mute the device** and repeat step 2. Every action still does exactly what it did (FR-023) — no
   code path may branch on whether a sound was heard.

---

## V9 — Reduced motion *(FR-025, SC-008)*

Turn on the OS "reduce motion" setting and reload.

**Expect** the ticker to stop moving and every transition to stop, **with nothing lost**: both facts
the strip carries are still on screen, stationary, in full. Compare against V10 — the set of readable
information must be identical with motion and without it.

---

## V10 — The moving strip *(FR-027–FR-031, SC-012, SC-013)*

**Expect** exactly two facts: the overdue count and the next thing due, e.g. `3 OVERDUE · NEXT 12 AUG`.

- **Freeze it.** Take one still screenshot at 375px. Both facts are readable in it, with no waiting
  (SC-012, FR-031).
- **Agreement.** The strip's overdue count and the header's overdue count are always the same number
  (FR-028, SC-013). Apply a platform filter: **both narrow together**, because they are one value
  rendered twice. If only one changes, they are two independent readings and FR-028 has failed.
- **Freshness.** Mark the overdue item as posted. The strip changes with the rest of the screen
  (FR-029) — it must never display a number the screen behind it has stopped agreeing with.
- **Empty.** With nothing overdue and nothing scheduled, it says so — `ALL CLEAR · NOTHING DUE` — and
  **does not go blank** (FR-030).

---

## V11 — Everything still works, in the same number of taps *(FR-003, SC-010)*

Re-run [001's quickstart](../001-content-calendar/quickstart.md) end to end: V1 through V9 and US4.

**Expect** every one of them to pass, and **capture to still be three interactions** — tap, type, tap.
SC-001 of 001 is a measured budget with no room for a confirmation step, and a restyle that adds a
step to it has broken a shipped criterion in order to look better.

**Fails if** anything about the calendar's *behaviour* changed. That is not a re-skin, and it is
explicitly out of scope for this iteration.

---

## Recording the results

The same rule 001 was held to: results go into `tasks.md` **unsoftened**, including failures. T072
recorded a 47.27s cold start against a 15-second criterion rather than rounding it away, and that
honesty is the only reason the deferred remedy has a trigger attached to it today.
