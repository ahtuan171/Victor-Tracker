# Claude Design prompt — VictorHub Travel Map (003)

Paste the block below into claude.ai/design. Derived mechanically from `BRIEF.md`; if the two ever
disagree, `BRIEF.md` wins.

---

## 1. What you are designing

**VictorHub** is a personal travel memory map for a single owner. It already ships a Content
Calendar (a status pipeline for planning posts) in a "pixel-arcade" visual language — a dark,
cinematic, comic-book-console aesthetic with a bevelled machine frame, pixel display type, and a
single hot red accent. This session is **not** designing that language — it already exists and is
locked. You are designing **five new screens inside it**: a world map carrying pins for places
visited, planned, and wanted; a sheet that opens a pin to its photographs and notes; a way to
organise places into Trips; a fast way to mark a new place directly from the map; and a status
filter.

One person uses this, on a phone, one-handed. It is a working personal archive, not a marketing map
— every screen is judged by how fast a distracted person can find or add a place.

## 2. Visual direction — already decided, reuse it exactly

Do not invent a new palette, typeface, corner radius, or frame treatment. This product's presentation
layer was settled in a prior design iteration and every later module (this one included) consumes it
rather than competing with it. Draw from these exact values:

**Colour** (dark mode, the product's only mode at v0.2):
- Void / surfaces: `#09090b` (page background) rising through `#0c0c0f`, `#111114`, `#17171c`,
  `#1f1f26` (highest elevation) — a stacked-darkness system, not flat grey-on-grey.
- Hairline dividers: `#2a2a31`.
- Text: `#f5f5f5` (high emphasis), `#a7a3ad` (mid), `#6f6b76` (low).
- Brand accent — chrome, focus rings, primary actions **only**: `#a10826`, brighter hover/active
  state `#c41230`. This was deliberately deepened from a brighter neon red; keep it in this darker,
  "strong and mysterious" register, not the brighter tone.
- The machine frame itself uses a gradient from `#b00020` through `#2a0a10` into the void — do not
  redraw the frame, it already exists as a component (see section 5).
- A demoted steel-blue accent (`#2563eb`) exists but is decorative-only and rarely used — do not
  reach for it without a specific reason.
- A warning/amber tone (`#ffb020`, hover `#ffcb5c`) exists for flags and cautions — this is where a
  "dates fall outside this trip" flag belongs, not the brand red.
- **`DestinationStatus` (Visited/Planned/Wishlist) needs its own colour identity, distinct from the
  Content Calendar's existing idea/draft/posted palette** (`#5b6b8c`/`#d99a2b`/`#2f9e63`) — a
  different vocabulary borrowing the same three hex values would make a Wishlist pin misread as an
  `idea` calendar chip. Propose three new values that stay within this system's overall register
  (desaturated, dark-surface-compatible, each distinguishable from the brand red and from each
  other in greyscale by more than hue).

**Type**: A pixel/pixel-adjacent display face for headers and section labels (used sparingly — never
below 16px, never in a tightly-constrained control like a toolbar); a more legible monospace-style
face for all content text — pin labels, sheet body copy, form values, search results. The legible
face is the workhorse; the display face is seasoning.

**Shape**: Angular, not rounded. Small radii throughout (2–6px depending on element size) — clipped
or notched corners on cards and sheets are more in-character than a uniform pill radius.

**Chrome**: A thick bevelled frame surrounds the working viewport on every screen, with decorative
(non-interactive) corner details. A moving ticker strip runs along the bottom of calendar screens
today — decide whether the map screen carries one too (it could report something map-relevant, like
a place count, but is not required) or whether the map is chrome-framed with no ticker, since a
strip competes with the map for the same bottom-of-screen thumb-reach real estate Quick Add also
wants.

**Texture**: Low-opacity web-line geometry and halftone/print grain are established motifs for empty
states and large surfaces — thin, structural, never busy. A spider-web-shaped compass/radar motif in
a screen's corner is also part of this product's established chrome vocabulary and may be reused
here as **pure decoration** if it earns its place next to a real, functioning map.

**Do not use**: any Spider-Man or Marvel trademark, wordmark, emblem, or character likeness — the
web-line and comic-console aesthetic is original, not licensed, and this rule is permanent. No full-
bleed hero photography. No desktop-first layouts.

## 3. Non-negotiable constraints

Each traces to a ratified requirement. A design that breaks one is rework, not a variation.

1. **Designed at 375px first and fully usable there.** The page body never scrolls horizontally — the
   map pans and zooms inside its own bounded container, never the page itself.
2. **Every tappable control is at least 44px in its smallest dimension.**
3. **Primary actions — opening a pin, adding a place — sit in thumb reach.**
4. **A pin's status (Visited/Planned/Wishlist) must be readable without tapping it, and without
   relying on colour alone.** It must survive a greyscale screenshot.
5. **Focus states on every interactive element, and a confirmation step on every destructive action**
   (deleting a Trip, deleting a Destination). Structural, not deferrable.
6. **The map's own attribution text (rendered automatically by the map library — do not remove or
   hide it) must stay legible against whatever frame surrounds the map.** It is a licence
   requirement, not decoration.
7. **No time of day anywhere.** Dates are calendar days only — never render a clock, a time picker,
   or "9:00 AM" anywhere on a Trip or Destination.
8. **Marking a new place completes in at most three interactions**: select-or-search a location, then
   choose a status. No intermediate confirmation screen between choosing the status and the pin
   appearing.

## 4. The pin encoding is NOT locked — design it, then state your choice

Unlike this product's Content Calendar (whose idea/draft/posted encoding is fixed), a Destination's
three statuses — **Visited**, **Planned**, **Wishlist** — have no existing visual encoding. Design
one now, using shape and fill (never colour alone), plus a fourth **overlay** treatment for
"Currently Traveling" — a state that layers on top of a Planned pin when today's date falls inside
that Destination's own date range (it is never a fourth stored status, only a visual overlay on
Planned).

Consider, but do not feel bound by, echoing this product's existing outline → half-filled → solid
progression (used for its calendar's idea → draft → posted pipeline) for house consistency — or
propose a genuinely different shape language suited to a map pin rather than a calendar chip (for
example, a pin silhouette whose fill level or outline treatment carries the same three-step
distinction). State which you chose and why in your response.

## 5. Surfaces to design

### Already exists — reuse the component, do not redraw it

- **The machine frame** (bevelled housing with decorative corner rivets) around the whole viewport.
- **The moving ticker strip**, if the map screen uses one (your call — see section 2).

### New surfaces

| Surface | Shape it must have |
|---|---|
| **MapView** | Full-bleed map inside the existing frame, at 375px. Pannable, zoomable, attribution visible. An **empty state** for zero places (centred default view, an invitation to add the first place — not an error). A way to keep **two near-overlapping pins** individually reachable rather than merged into one. |
| **DestinationPin** | The three-status-plus-overlay encoding from section 4, at a size that stays tappable (44px) without obscuring the map underneath it. |
| **DestinationSheet** | Opens on pin tap — consider a camera-fly-to-pin-then-card-floats-above-it interaction, in this product's own visual language (not a literal recreation of any specific reference — describe your own version). For a **Visited** place: a photo gallery (grid or carousel of images), an editable note, a photo-attach control, and a delete control. For **Planned/Wishlist**: name, dates, status control, delete — no gallery, no note field, since neither exists to show yet. |
| **TripPanel** | Create a Trip (name, start date, end date, a status label — six possible values, treat this status as a simple text badge, it drives no pin and needs no elaborate encoding); list existing Trips; open one to see its Destinations. |
| **LocationSearch** | A search field returning a list of candidate places, each showing a distinguishing address/description so the owner can tell two similarly-named results apart. A clear **no-matches** state ("nothing found for that search") distinguishable from a **search-failed** state ("couldn't reach the search service, try again") — these must read as different situations, not the same generic error. |
| **QuickAdd** | Combines LocationSearch with a status choice into the ≤3-interaction flow: search-or-tap a location, choose a status, done. Offers "attach to an existing Trip" as one choice, with "leave unattached" equally available, not buried. |
| **StatusFilter** | A single-status selector (Visited / Planned / Wishlist / All) plus a clear-back-to-all control, in thumb reach. |
| **Delete confirmation** | Reuse this product's existing three-tap destructive-confirmation pattern (a focused, low-effort "keep" action first; the destructive action lower-weight, requiring a deliberate second tap). Two variants: deleting a Trip (name that its Destinations and their photographs go with it), deleting a Destination (name that its photographs go with it). |

## 6. Interactions already decided

- **No drag-and-drop anywhere in this iteration.** A Destination's dates are typed or left blank —
  never set by dragging anything.
- **Quick Add's three-interaction ceiling is exact**, not approximate. Do not design a flow that
  needs a fourth step.
- **A location's coordinates are never typed by hand.** The owner always resolves a place through
  search; there is no "enter latitude/longitude" field anywhere.

## 7. DO NOT INVENT

Every control on a Destination surface must map to one of: `name`, a resolved location (never typed
coordinates), `start_date`, `end_date`, `status` (Visited/Planned/Wishlist), `note`, an optional Trip
attachment, and photographs (shown as images, never as filenames or links).

Every control on a Trip surface must map to one of: `name`, `start_date`, `end_date`, `status` (the
six descriptive values named in section 5).

Anything that does not map to one of these is a product decision in a visual costume, and it will be
rejected in review. Each of these has already been considered and refused for this iteration:

- A route line between a Trip's Destinations, or any "reorder stops" control
- A cost field, a currency symbol, a budget total, anything implying money
- A category picker, tags, or a priority flag on a Destination
- A day-by-day itinerary or "add an activity" control inside a Trip
- A live-tracking dot, a radar that follows the device's real position, or any automatic location
  capture
- A caption or manual-reorder handle on a photograph
- A share button, a public link, or any "view my map" URL reachable by anyone but the owner
- Two locations or a route on a single Destination — one Destination is exactly one point
- A "last edited by", version history, or conflict indicator
- An owner avatar, collaborator list, or sharing invite

If a surface feels like it needs one of these, leave it incomplete and say so in your response
instead of inventing the field.

## 8. Deliverables, in this order

1. **The pin encoding** (section 4) — decide this before anything else, since every other surface
   either shows a pin or opens one.
2. **MapView** at 375px, with the frame, a handful of pins in different statuses, one overlapping
   pair, and the empty state.
3. **DestinationSheet**, both variants (Visited with gallery+note; Planned/Wishlist without).
4. Everything else in section 5.

For each surface, produce a **375px** view. Desktop is not needed for this iteration.

**Two screenshots are the acceptance test:**
- MapView at 375px with pins in all three statuses plus one "Currently Traveling" overlay, visible
  at once.
- **That exact screenshot in greyscale.** If the three statuses are not distinguishable in it, the
  pin encoding is wrong and the design fails.
