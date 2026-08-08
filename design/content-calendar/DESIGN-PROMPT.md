# Claude Design prompt — VictorHub Content Calendar v0.1

Paste the block below into the `VictorHub Design System` project at claude.ai/design.
Derived mechanically from `BRIEF.md`; if the two ever disagree, `BRIEF.md` wins.

---

## 1. What you are designing

**VictorHub** is a personal brand operating system for a single content creator. Version 0.1 ships
exactly one module: a **Content Calendar**. One person uses it, on a phone, one-handed, between
shoots — to capture an idea in seconds, park it in a backlog, drag it onto a date, and advance it
`idea → draft → posted`.

It is a working tool, not a marketing site. Every screen is judged by how fast a distracted person
can act on it.

This design system establishes the colour, spacing, and type tokens for **all four** future
VictorHub modules. Later modules consume these tokens; they never introduce competing ones.

## 2. Visual direction

Dark, cinematic, web-slinger energy — think a late-night comic-book operations console.

**Take from that world:**
- Near-black layered surfaces with real elevation, not flat grey-on-grey.
- A single hot red as the brand accent, used for chrome, focus, and primary action only.
- Web-line geometry as **texture**: low-opacity radial web lines in empty states, behind the drawer
  handle, in section dividers. Structural, thin, never busy.
- Halftone / print grain at very low opacity on large surfaces.
- Condensed uppercase display type for headers and section labels, with tight letterforms and a
  slight forward lean. A high-legibility neutral sans for all content text.
- Angular panel treatments — clipped or notched corners on cards and sheets, not uniform pill radii.
- Snap-and-settle motion: fast in, small overshoot, quick settle. Nothing floats or fades slowly.

**Do not take:**
- Full-bleed hero photography, character art, or cinematic imagery anywhere in the app. There is no
  hero section. The calendar grid is the hero.
- Marvel or Sony trademarks — no Spider-Man wordmark, no spider emblem, no character likeness, no
  studio logos. Build original web/geometric motifs instead.
- Desktop-first horizontal layouts, wide multi-column bands, or decorative sections.

**Critical colour rule:** the brand red is **decorative chrome, never meaning**. Status is never
communicated by red. Keep the status palette (amber, green, neutral) clearly separable from the
brand red at a glance and at 16px.

## 3. Non-negotiable constraints

Each traces to a ratified requirement. A design that breaks one is rework, not a variation.

1. **Designed at 375px first and fully usable there.** The page body never scrolls horizontally.
   Wide content (the month grid) scrolls inside its own container, never the page.
2. **Primary actions sit in the bottom half of the screen**, within one-handed thumb reach. Never a
   top-right toolbar.
3. **Status is readable without colour** — encoded by shape *and* fill, and it must survive a
   greyscale screenshot.
4. **Focus states on every interactive element**, and confirmation on every destructive action.
   These are structural, not polish, and are explicitly not deferrable.
5. **No time of day anywhere** — not asked for, not stored, not displayed. Dates are calendar days
   only. Never render "9:00 AM", a clock icon, or a time picker.
6. Text must stay legible on dark surfaces at small sizes. Dark-on-dark low contrast is a failure,
   not a mood.

## 4. Locked encodings — re-skin the palette, never the encoding

| Status | Shape | Fill | Colour (decorative only) |
|---|---|---|---|
| `idea` | circle | outline only | neutral |
| `draft` | circle | half-filled | amber |
| `posted` | circle | solid, with check | green |

Outline → half → solid reads as pipeline progress in greyscale. That progression is the whole point.

- **Overdue** (an `idea` or `draft` whose date has passed) is a **left border on the item**. It is
  orthogonal to status, not a fourth state. Its treatment must be distinguishable from the brand red
  accent, and must read in greyscale through weight or dash pattern rather than hue alone.
- **Platform** is a monogram badge — **T / I / Y** (TikTok, Instagram, YouTube). Text nodes, not
  brand logos. Never render platform logos.

## 5. Surfaces to design

Exactly this list. Anything beyond it is out of scope for v0.1.

| Surface | Shape it must have |
|---|---|
| **Login** | Single form. The only screen reachable unauthenticated. |
| **Month grid + day cell** | Seven-column grid over the **six-week** span the month view displays, including adjacent-month days. Overflow inside a cell is a **remainder count that stays reachable** — never a clipped list. |
| **Week view** | Seven **vertical sections**, one per day. Explicitly **not** seven columns — columns cannot hold a readable chip at 375px. |
| **Item chip** | Title + status cue + platform cue. Needs **two variants**: a *micro* variant that survives a ~50px-wide month-grid day cell (cue-first, title truncated or dropped), and a *full* variant used in the week view and the backlog drawer. Show both. |
| **Capture sheet** | Bottom-anchored overlay with exactly **one** field: title. Must be reachable in ≤3 interactions from landing. |
| **Item sheet** | The single editing surface. Carries all six fields: title, hook, platform, date, status, published link. The platform control sits adjacent to the status control, so a rejected status change is resolvable without leaving the sheet. |
| **Backlog drawer** | A drawer **on the calendar surface** with a collapsed peek strip and an expanded state. Not a separate page. |
| **Period nav** | Month/week toggle plus previous/next period controls, in thumb reach. |
| **Platform filter** | Narrows the grid and the drawer alike. In thumb reach. Needs a filtered empty state that **names the active filter**. |
| **Delete confirm** | Placed so that no single tap and no common navigation gesture can reach deletion. |
| **First-run empty state** | An account with zero items. |

## 6. Interactions already decided

- **Drag is for dates only.** Valid drop targets are day cells and the backlog drawer. Do **not**
  design status lanes or swimlanes — status changes are **tap-only**.
- **The URL never changes** across the whole capture → advance → posted journey. Everything is an
  overlay on the calendar surface.
- Drag must have a visible drag state, a visible valid-drop-target state, and a settle animation.

## 7. DO NOT INVENT

Every control you draw must map to exactly one of these six editable fields:

`title` · `hook` · `platform` · `scheduled_date` · `status` · `published_url`

`id`, `created_at`, `updated_at` are system-managed and never edited. Anything that does not map to
one of the six is a product decision in a visual costume, and it will be rejected in review. Each of
these has already been considered and refused:

- Drag handles or manual reordering in the backlog — the backlog orders by creation date, newest first
- Tags, categories, labels, series, collections
- A time picker, a clock icon, or a time shown on any chip
- Two platform badges on one item — at most one platform per item, ever
- An archive view, a trash view, or an undo-delete affordance — deletion is permanent
- Priority, assignee, collaborator, avatars, or any ownership indicator — there is exactly one user
- "Last edited by", version history, or a conflict banner
- Attachments, thumbnails, media upload, or image previews
- Notifications, streaks, analytics, counts of views/likes, or any performance metric
- Search, if it implies indexing beyond the six fields

If a surface feels like it needs one of these, leave the surface incomplete and say so in your
response instead of inventing the field.

## 8. Deliverables, in this order

1. **Tokens first** — colour ramps for the dark surface stack, brand red, the status palette
   (neutral / amber / green), overdue treatment, spacing scale, type scale, radii and corner
   treatments, elevation, focus ring. Do not design a screen before these settle.
2. **The item chip**, both variants, in all three statuses, plus overdue, plus each platform monogram.
3. **Month grid + day cell**, at 375px, six-week span, with a cell in overflow.
4. Everything else in section 5.

For each surface, produce a **375px** view. Desktop is an enhancement — include it only after the
375px view works.

**Two screenshots are the acceptance test:**
- The month grid at 375px with the backlog drawer peeking, containing all three statuses and at
  least one overdue item.
- **That exact screenshot in greyscale.** If the three statuses are not distinguishable in it, the
  encoding is wrong and the design fails.
