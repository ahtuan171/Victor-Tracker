# Stage 2 design brief — Travel Map (003)

Written **before any surface is designed**, per `.claude/rules/workflow.md`'s stage 2 and
`.claude/rules/design.md`. This iteration is not a token-layer iteration — `002-pixel-arcade-skin`
already established the product's one visual language, and this module **consumes it, never
replaces it** (`.claude/rules/design.md`, "The token layer may change; a feature module may not").
Everything in this brief is scoped to five genuinely new surfaces that have never been designed
before: the map itself, a pin, the destination sheet, trip organisation, and quick-add.

The export lands in this directory alongside screenshots, same as `design/content-calendar/`. It is
a **starting point, not a drop-in** (`.claude/rules/design.md`).

**Session note (2026-08-14): this session has no working automated path into claude.ai/design's
canvas** — the only design tool available is `DesignSync`, which syncs an existing design-system
component library and cannot generate new screens. `DESIGN-PROMPT.md` in this directory is the
prompt to paste into claude.ai/design by hand; once an export exists, bring it back (or its
screenshots) and the data-shape audit below runs against it before anything is adapted into
`frontend/`.

---

## Hard constraints

Not preferences. Each traces to a ratified requirement, and a design that breaks one is rework.

| Constraint | Source |
|---|---|
| Designed at **375px** first and fully usable there. The page body **never** scrolls horizontally — the map itself pans/zooms inside its own container, never the page. | constitution I, FR-004, SC-004 |
| Every tappable control **at least 44px** in its smallest dimension. | `002` FR-006, carried forward as an unwritten floor this product now holds everywhere |
| Primary actions (marking a place, opening a pin) sit within **one-handed thumb reach**. | constitution I |
| Status is readable **without colour**, by shape and fill, surviving a greyscale screenshot — same bar `002`'s status pipeline already clears. | FR-002, SC-001 |
| Focus states on every interactive element, and confirmation on every destructive action (deleting a Trip or a Destination). Structural, not deferrable polish. | constitution V, FR-016, FR-018 |
| The map's tile attribution (`MapLibre \| © CARTO, © OpenStreetMap contributors`, drawn automatically by `AttributionControl`) MUST stay visible and legible against the frame — it is a licence term, not decoration. | `tech-defaults.md`, "The map" |
| No time of day anywhere — `start_date`/`end_date` are calendar days only, same as `001`'s inherited rule. | data-model.md (`DATE` columns, no `TIMESTAMP`) |
| Marking a new place from the map (Quick Add) completes in **at most three interactions** — select or search a location, then choose a status. | FR-020–FR-022, SC-003 |

### The token layer is fixed — reuse it exactly, invent nothing

`002-pixel-arcade-skin`'s tokens are the whole of this product's visual language now. The export
must draw from `frontend/app/globals.css`'s actual values, not re-imagine them:

| Token | Dark value | Role |
|---|---|---|
| `--ch-void` | `#09090b` | Page background, the darkest surface |
| `--ch-surface-0/1/2/3` | `#0c0c0f` → `#1f1f26` | Elevation stack, darkest to highest |
| `--ch-hairline` | `#2a2a31` | Dividers, borders |
| `--ch-ink-hi/mid/lo` | `#f5f5f5` / `#a7a3ad` / `#6f6b76` | Text, high to low emphasis |
| `--ch-brand` / `--ch-brand-hi` | `#a10826` / `#c41230` | The one accent — chrome, focus, primary action only. **Deepened 2026-08-14 (MR !67)** — not the brighter red either module used before. |
| `--ch-brand-deep` / `--ch-brand-sunk` | `#b00020` / `#2a0a10` | The `.arcade-frame` gradient itself |
| `--ch-steel` | `#2563eb` | Demoted, decorative-only accent — not the frame's colour any more; do not reach for it without a stated reason |
| `--ch-danger` / `--ch-danger-hi` | `#ffb020` / `#ffcb5c` | Warnings — this is where FR-017's containment flag belongs, **not** `--ch-brand` |
| `--ch-status-idea/draft/posted` | `#5b6b8c` / `#d99a2b` / `#2f9e63` | Content Calendar's status palette — **do not reuse these three for `DestinationStatus`**, a different vocabulary needs its own values within the same system, not a borrowed set that would make a Wishlist pin look like an `idea` chip |
| `--ch-overdue` | `#b7975a` | Overdue border — same idea as "Currently Traveling" needs, not the same requirement |
| `--font-display` | Silkscreen | Headers, section labels, **never below 16px, never in a band under ~340px available width** — VT323 is the narrower face despite reading larger (`002`'s R-003) |
| `--font-sans` | VT323 | All content text — pin labels, sheet body copy, form values |
| `--radius-sm/md/lg/xl` | 2px/2px/4px/6px | Angular, not rounded — the whole product's corner language |

**The frame, tick-mark motif, and moving-text strip already exist** — `.arcade-frame` (bevelled
housing, `Frame.tsx`), `arcade/Ticker.tsx` (bottom strip). The map surface may be the **first**
screen since the reference video itself to use them as originally intended — see "The reference
video is directly applicable" below. Do not design a second frame or a second strip; reuse the
components.

**Do not invent a new status colour set, a new font, a new radius, or a new frame treatment.** If a
map-specific need seems to require one, that is a signal to flag in the audit findings below, not a
licence to add it.

---

## The reference video is directly applicable — reuse its map-specific ideas now

`002-pixel-arcade-skin`'s own brief (`design/002-pixel-arcade-skin/BRIEF.md`) was built from
`spidey-tracker.mp4` (repo root, gitignored, 39.3s) — a recording of a **travel-map** reference
product. Two of its ideas were **deliberately excluded** from the calendar re-skin specifically
because they are map ideas, and specifically reserved for this iteration:

> "A functioning radar/compass tracking something — This product has no map yet (**003 does**).
> Decorative only, or cut — owner call at T004."
>
> "A 'VIEW SIGHTING'-style card that flies to a day cell — The calendar has no pins. Not built here."

**Both are now in scope, reframed for real data instead of the calendar:**

- **Tapping a pin**: the camera flies to it, then a card floats above the pin. This maps directly
  onto `DestinationSheet` (T029/T032) opening — for a Visited place, the card can hold the first
  photograph as a thumbnail and a line in the same spirit as "VIEW SIGHTING" (renamed to fit this
  product's own language — not the reference's wording verbatim, and never anything that reads as a
  Spider-Man reference — something like "OPEN LOG" or "VIEW VISIT", the designer's call). For a
  Planned or Wishlist place, the card has no photograph to show (FR-009) — design what it shows
  instead (name, dates, status only).
- **The spider-web compass/radar**, if it returns, must do so as **pure chrome** exactly as `002`'s
  own brief already ruled — no functional binding to real map data, no live tracking of anything,
  decorative only. It is not required; a plainer zoom/pan control is equally acceptable if the radar
  motif does not earn its place next to real pins.

**What does not travel from the reference, restated for this iteration specifically**: no Spider-Man
wordmark, spider emblem, character likeness, or studio trademark — the exclusion `002`'s prompt
already stated is permanent, not scoped to that one iteration. Web-line geometry as low-opacity
texture is fine (it was already accepted as an original motif); a literal spider silhouette is not.

---

## Surfaces to design

Five new surfaces plus two confirmation dialogs reusing an existing pattern. Exactly this list —
Route, Budget, and Activity/Calendar are out of scope for this iteration (spec.md, "Why this
iteration…") and must not appear anywhere in the export.

| Surface | Shape it must have | Task(s) |
|---|---|---|
| **MapView** | Full-bleed MapLibre canvas against CARTO's dark-matter basemap (already dark — no theming needed on the tiles themselves), framed by `.arcade-frame` the same way `/calendar` is. Pannable/zoomable, attribution visible. Needs an **empty state** (no places yet) and a way to keep **near-overlapping pins** individually reachable. | T014, T019, T020 |
| **DestinationPin** | Three states — Visited, Planned, Wishlist — distinguishable by shape and fill (not colour alone), plus a fourth **overlay** treatment for "Currently Traveling" layered on top of Planned. **This encoding is not locked yet — design it.** Consider whether the outline → half → solid progression `001`'s status pipeline already established is worth echoing for house consistency, or whether pins want a genuinely different shape language (a map pin silhouette vs. a calendar's circle) — either is acceptable, but the export must state which and why. | T015, T016 |
| **DestinationSheet** | Bottom-anchored overlay opening on pin tap (see "the reference video" above). For a **Visited** place: photo gallery + note, both editable, plus a delete control (three-tap pattern, see below). For **Planned/Wishlist**: no gallery, no note — just name, dates, status, delete. Every state needs a photo-attach affordance and an upload-in-progress state (the `PUT` goes straight to R2, so this can legitimately take a few seconds on a slow connection). | T023–T032 |
| **TripPanel** | Create/list/open a Trip — name, start date, end date, a status label from `TripStatus`'s six descriptive values (wishlist/planned/booked/upcoming/traveling/completed — **this status drives no pin, keep its treatment simple**, a text badge is enough; do not build a second elaborate encoding for a status that means nothing to the map). | T036, T037, T040 |
| **LocationSearch + QuickAdd** | A search input returning `LocationCandidate` results (each with a distinguishing address) the owner picks from; combined with a status choice into the **≤3-interaction** quick-add flow (FR-020–FR-022, SC-003). Needs a **no-matches state** distinguishable from a search that failed to reach the provider at all (FR-012) — these are different messages, not the same "nothing found" copy. Also needs the "attach to an existing Trip, or leave unattached" choice (FR-021). | T038, T039, T041, T042 |
| **StatusFilter** | A single-status selector plus a clear-back-to-all control, in thumb reach — same shape as `001`'s platform filter, reused rather than reinvented. | T050 |
| **Delete confirmations (×2)** | Deleting a Trip names what cascades (its Destinations and their photographs, FR-018); deleting a Destination names its own cascade (its photographs). Both reuse `001`'s `DeleteConfirm` three-tap pattern (`AlertDialog`, `KEEP` focused first, destructive action lower-weight) — **do not redesign the pattern itself**, only the copy each dialog carries. | T032, T043 |

### Two interactions already decided — do not redesign them

- **No drag anywhere in this iteration.** Unlike `001`'s calendar, nothing here is scheduled by
  dragging a chip between drop targets — a Destination's dates are typed or left blank, never set by
  a gesture.
- **Quick Add's three-interaction ceiling is a hard number** (SC-003), not a target to approach.
  Search-or-tap → choose a status is the whole flow; do not add an intermediate confirmation screen
  between choosing a status and the pin appearing (FR-022).

---

## Data-shape audit — run this before adapting anything into `frontend/`

Constitution IV: *design work that implies a new data field REQUIRES a spec amendment before
implementation.* Run this audit against whatever the export actually shows, the same way
`content-calendar/BRIEF.md`'s audit ran clean against its export.

**Every control on a Destination surface must map to one of these fields** (data-model.md):

`name` · `latitude`/`longitude` (never typed by hand — resolved via search, FR-011) · `start_date` ·
`end_date` · `status` (Visited/Planned/Wishlist) · `note` · `trip_id` (optional) · photographs
(`object_key`, shown as an image, never as text)

**Every control on a Trip surface must map to one of these:**

`name` · `start_date` · `end_date` · `status` (the six-value descriptive vocabulary)

(`id`, `created_at`, `updated_at` are system-managed and never edited, on either entity.)

Anything that does not map is a product decision wearing a visual costume. It goes to
`.claude/memory.md` under Deferred, or becomes a `spec.md` amendment. It does **not** go into code.

These are the ones most likely to appear, each already rejected with a stated reason
(`data-model.md`, "Columns deliberately absent", and `spec.md`'s "Why this iteration…"):

| If the design shows… | It implies | Verdict |
|---|---|---|
| A line drawn between a Trip's Destinations, or a "reorder stops" control | Route display, a `sequence`/`order` column | Rejected — out of scope for this iteration despite being constitutionally permitted since the 2.1.0 amendment (spec.md Assumptions) |
| A cost field, a currency symbol, a running total, a "budget" label anywhere | Budget/cost fields | Rejected for the same reason — permitted, not built |
| A category picker, tags, or a priority flag on a Destination | `category`/`priority` columns | Not in spec. Out of scope for this iteration |
| A day-by-day itinerary, a "add an activity" control, anything resembling a calendar inside a Trip | Activity/Calendar surface | Explicitly deferred (spec.md Clarifications) — a later iteration's own `spec.md` |
| A live-tracking radar, a "you are here" dot following the device | Automatic location capture | Forbidden by constitution principle II and the Scope Constraints section, unconditionally |
| A caption or reorder handle on a photograph | `caption`/`order` columns on `photograph` | Not asked for anywhere in the spec — a photograph is attached, viewable, belongs to one Destination, nothing else |
| A share button, a public link, a "view my map" URL | Public/shared view of the map | Forbidden by the Scope Constraints section |
| Two locations on one Destination, or a route between named points on one pin | Multiple coordinate pairs per row | `latitude`/`longitude` are singular, `NOT NULL` — one Destination is one point |
| A "last edited" stamp, a conflict banner, a version indicator | `version`/`etag` column | Not in spec — single owner, last-write-wins, same as `001` |
| An owner avatar, a collaborator list, a sharing invite | multi-tenant columns | Constitution VII |

**Write the result down even when it is clean.** An audit that found nothing and an audit that never
ran are indistinguishable unless the outcome is recorded. Append findings below once the export
exists.

---

## Audit findings

**2026-08-14 — export received, audit run, result: one finding, resolved without a spec amendment.**

Export: `Victor-Tracker-Map.dc.html` (one Claude Design canvas, twelve panels `1a`–`1l`). Pulled with
`DesignSync get_file` from project `21767df3-d53c-4a10-832c-714db1d2b2b0` ("Pin encoding for travel
map"), a regular project — same pattern as `content-calendar`'s export, not the design-system type.
`support.js` and `image-slot.js` are the canvas runtime, kept alongside so the file renders offline.
Two screenshots (`screenshot-1a.png`, `screenshot-1b.png`) were rendered from the export with
Playwright, matching `content-calendar`'s own acceptance-test process; a third
(`screenshot-1d.png`) records the pin-encoding legend as designed.

### Coverage — all seven surfaces present, at 375px

`MapView` (live, `1a`; greyscale acceptance, `1b`; zero-places empty state, `1c`) ·
`DestinationPin` encoding legend (`1d`) · `DestinationSheet` (Visited, `1e`; Planned/Wishlist, `1f`)
· `QuickAdd` (`1g`) · `LocationSearch` empty-vs-failed states (`1h`) · `TripPanel` (list+create,
`1i`; one Trip open, `1j`) · `StatusFilter` (`1k`) · delete confirmations, both variants (`1l`).
Every surface `BRIEF.md` asked for is present; nothing from the DO-NOT-INVENT list appears anywhere
in the export (no route line, no cost/budget field, no category/priority control, no Activity/
Calendar surface, no live-tracking dot, no photo caption/reorder handle, no share/public-link
control, no second coordinate pair on one Destination, no version/conflict indicator, no
collaborator/avatar control) — checked by reading every panel, not by pattern-matching text.

### The pin encoding — designed, and stated with its reasoning (per `BRIEF.md` §4's open question)

A **shield silhouette**, not the calendar's circle, carrying the same outline → half-filled → solid
progression `001`'s status pipeline already established, deliberately **not** copied verbatim onto a
circle — panel `1d`'s own reasoning: "carried on a map-pin shield silhouette so a pin never reads as
a calendar chip. Hue is redundant — fill level alone survives greyscale," confirmed by `1b`'s
greyscale render, where all three states stay separable on shape and fill alone.

| Status | Shield fill | Glyph | Colour (decorative only) |
|---|---|---|---|
| Visited | solid | check | `#7fb0a0` (lightest in greyscale) |
| Planned | half-filled from the tip up | caret `▸` | `#8a7ba8` (mid) |
| Wishlist | outline only, void interior | star `☆` | `#6c6f8f` (darkest) |

**Currently Traveling** (FR-002, R-004) is a pulsing amber ring (`#ffb020`) plus a caret chevron
layered on top of a Planned pin — an overlay, not a fifth shield state, matching data-model.md's
"not a stored value" rule exactly. **Stacked/near-overlapping pins** (User Story 1 scenario 3) show
as two shields offset with a count badge; tapping fans them apart on hairline stems — both remain
individually reachable, never merged into one.

**New tokens needed, none competing with existing ones**: `#7fb0a0`/`#8a7ba8`/`#6c6f8f` are a
**second, independent status palette** for `DestinationStatus` — deliberately not reusing
`--ch-status-idea/draft/posted` (`#5b6b8c`/`#d99a2b`/`#2f9e63`), which would make a Wishlist pin
misread as a calendar `idea` chip. `#ffb020`/`#ffcb5c` for the Currently-Traveling overlay **are**
already `--ch-danger`/`--ch-danger-hi` — reused, not duplicated. Add three new custom properties
(e.g. `--ch-status-visited`/`--ch-status-planned`/`--ch-status-wishlist`) alongside the existing
status tokens in `globals.css` at implementation time; this is additive, not competing, per
`.claude/rules/design.md`.

### One finding: TripStatus's display words don't match data-model.md's ratified enum, and invent a seventh

The export's `TripPanel` (`1i`) shows `TripStatus` as **IDEA · PLANNING · BOOKED · IN PROGRESS ·
COMPLETED · ABANDONED**. `data-model.md`'s ratified enum is **wishlist · planned · booked · upcoming
· traveling · completed** — five of the six are the same *concept* under different words (idea≈
wishlist, planning≈planned, in progress≈traveling), but **"Abandoned" has no ratified equivalent at
all**: none of the six stored values means "this trip is not happening any more." Per constitution
IV, this is exactly what a data-shape audit exists to catch — a design implying a value the spec
does not have.

**Resolution: implementation uses `data-model.md`'s six ratified words verbatim, as both the stored
value and the displayed text** (matching `001`'s own pattern of showing `IDEA`/`DRAFT`/`POSTED`
directly rather than translating them) — **not** the export's wording, and **"Abandoned" is not
built.** Reasoning: `TripStatus` is explicitly "descriptive only; it does not drive any map pin" and
"no requirement in this spec depends on its exact values beyond 'a status exists'" (research.md
R-003) — the exact word is genuinely low-stakes, so there is no reason to prefer the export's
invented vocabulary over the already-ratified one, and reusing "Idea" for a Trip would also collide
with Content Calendar's own `idea` status on a completely different entity, which is worth avoiding
on its own. If the owner later wants a real "this trip fell through" state, that is a `spec.md`
amendment (a genuine seventh value), not a quiet addition made while adapting a design.

### A technology note, not a finding

The export renders its map with **Leaflet**, not MapLibre — a canvas-sandbox convenience, not a
signal to reopen `plan.md`'s locked choice. Real implementation stays MapLibre GL JS against the same
CARTO `dark_all`/dark-matter tile source the export also uses; the tile attribution string the export
renders (`Leaflet | © OpenStreetMap contributors © CARTO`) is exactly the licence-term text
`tech-defaults.md` requires, just via the design tool's own library. `AttributionControl` in the real
MapLibre build discharges the same requirement automatically, as the `003` MapLibre spike already
confirmed (`frontend/AGENTS.md`).

### Consequences for `frontend/`

The surfaces themselves are **not built by this audit** — each belongs to its own task from `T014`
onward (`tasks.md`) and is built there, reading this export and `screenshot-1a.png`/`1b.png`/`1d.png`
as the reference the way `content-calendar`'s own tasks read its export. `TripPanel`'s status control
(T036, T039–T040) is the one place to double-check against this finding rather than the export's own
copy when it is built.
