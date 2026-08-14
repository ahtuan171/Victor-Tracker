# Phase 0 research — Travel Map

Four decisions. The one that shapes everything else is **R-001** (the geocoding provider), because
nothing on the map exists until a typed name resolves to coordinates (FR-011), and it is the one
piece of this feature `tech-defaults.md` is silent on — its "The map" section covers tile serving
only.

---

## R-001 — Geocoding: Nominatim (OpenStreetMap), no API key

**Decision**: Forward geocoding (place name → coordinates, FR-011) uses the **Nominatim** search API
(`nominatim.openstreetmap.org/search`), called from the **backend**, not the browser.

**Rationale**:

- **No API key**, matching the bar this project already set for the map itself — MapLibre + CARTO's
  dark-matter basemap was chosen at the 2.0.0 amendment specifically because it needs none
  (`.claude/rules/tech-defaults.md`, "The map"). Nominatim is the same shape of decision applied to
  search: it is the OpenStreetMap Foundation's own public geocoder, keyless, and its result data
  shares the same OSM lineage as the CARTO tiles already rendering on screen — a search result and
  the tile underneath it come from one source, not two.
- **Called from the backend, not the browser.** Nominatim's usage policy requires a descriptive
  `User-Agent` identifying the calling application and caps unauthenticated use at roughly one request
  per second — both are naturally satisfied by a single-owner backend issuing the request server-side
  under one identified `User-Agent`, and neither is straightforward to guarantee from a browser making
  direct third-party calls. This also keeps `FR-013`'s "no third-party request carries a place name"
  guarantee scoped correctly: it governs the **map tile** and **client-visible** requests. A
  geocoding search is discussed separately below because it is not the same shape of request at all.

**The privacy shape is genuinely different from a tile request, and that difference is stated here
rather than left implicit** — the same treatment constitution principle II already gives tile
requests ("Tile requests necessarily disclose viewport coordinates to the tile provider; that
disclosure MUST be stated in `plan.md` rather than left implicit"). A map tile request discloses only
a viewport; nothing the owner typed or named ever reaches the tile provider. A geocoding search is
structurally different: **the searched text is the input the provider needs to do its one job**, so
"Kyoto" (or whatever the owner types) necessarily reaches Nominatim's servers. This is inherent to
forward geocoding itself, not a design choice that could be tightened away — there is no geocoder,
free or paid, self-hosted or not, that resolves a name to coordinates without being told the name.
What stays true, and what keeps this within principle II's actual intent rather than merely its
letter: **nothing else does** — no note text, no photograph, no saved Destination's name once it is
already a pin, no record identifier, ever leaves the origin for this purpose. Only the text the owner
is actively searching, at the moment they search it, and only to the one provider whose entire
function is resolving exactly that text. `plan.md`'s Constitution Check records this as the
geocoding-search analogue of the tile-viewport disclosure, not as a silent exception.

**Alternatives considered**:

- **Photon** (`photon.komoot.io`), also keyless and OSM-sourced, built for autocomplete-style
  incremental search. A reasonable alternative and not rejected on any functional ground — Nominatim
  is chosen for being the more canonical, more widely documented reference implementation or a
  project this size, with no meaningfully different privacy shape between the two. Worth revisiting
  if Nominatim's rate limit is ever felt in practice, which a single owner is unlikely to do.
- **MapTiler Geocoding / Mapbox Geocoding** — both need a signup and an API key, breaking the bar
  `tech-defaults.md` already set for the map itself. Rejected on that ground alone; nothing about
  their result quality was compared.
- **Google Geocoding / Places** — the draft's own §14 names Google Maps integration as V3/advanced and
  flags it for its own principle II review (`drafts/travel-tracker.spec.draft.md`'s closing section).
  Out of scope for this iteration regardless of the geocoding decision here.
- **Geocoding from the browser directly** — rejected because Nominatim's usage policy is easiest to
  honour (one identified caller, one enforced rate) from a single backend, and because it keeps every
  third-party network call this product makes auditable from one place (the backend already proxies
  every other external effect this product has).

## R-002 — MapLibre under headless Playwright: already answered, not re-derived here

**Decision**: No special-casing needed. MapLibre renders correctly under headless Chromium at the
product's 375×667 floor; the existing `mobile-375` Playwright project and `pnpm start` in CI
(`.gitlab-ci.yml`'s existing `test:e2e` job) are sufficient with no new browser flags, extensions, or
software-renderer configuration.

**Rationale**: Answered by a pre-planning spike (2026-08-14, before this spec existed) rather than by
this plan — `frontend/AGENTS.md`'s Traps section carries the full writeup, immediately after the
2026-08-05 raw-WebGL-context entry. `scripts/spike-maplibre-headless.mjs` loaded a real map against
CARTO's dark-matter basemap in both headless and headed Chromium; both fired `load` then `idle`, made
the same 16 style/tile/sprite/glyph requests, and `page.screenshot()` in headless mode showed a
genuinely rendered map — streets, water, labels, correct attribution — identical to the headed
screenshot.

**One finding from that spike constrains how this feature's own tests must be written**:
`canvas.getImageData()` reads back all zeros despite real rendering (a cross-origin-texture-tainted
canvas, even with `preserveDrawingBuffer: true`), so **any test asserting the map actually drew
something must use `page.screenshot()` or a DOM assertion (pin elements, popup content, control
state) — never a canvas pixel read.** This is not a new rule invented here; it sharpens
`frontend/AGENTS.md`'s pre-existing "assert the map through the DOM and through pure functions in
`lib/`, never through its canvas."

**Alternatives considered**: none — this is a report of an already-completed spike, not a fresh
evaluation. The alternative that would have mattered (a software-rendering flag, a headed-only CI
runner, or dropping map-rendering assertions from CI entirely) never became necessary because the
spike's answer was unconditionally positive.

## R-003 — Data model shape: Trip, Destination (nullable `trip_id`), Photograph; Note is a field

**Decision**: Three tables. **`trip`** (name, start_date, end_date, status). **`destination`** (name,
latitude, longitude, start_date, end_date, status, note, **`trip_id` nullable**). **`photograph`**
(destination_id, object_key, created_at). Note is a **column on `destination`**, not its own table.

**Rationale**: Directly derived from `spec.md`'s Key Entities and the resolved Clarifications, not a
fresh data-modelling exercise:

- **`trip_id` is nullable** because the spec's first clarification (2026-08-14) resolved a Destination
  MAY exist independent of any Trip — the Wishlist entries a quick-added place produces are exactly
  this case (FR-020).
- **Note is a field, not a table**, because the draft's own form (§3) renders it as a single textarea
  per Destination — "Notes: [ ... ]" — and `spec.md`'s Key Entities describes it the same way ("Free
  text kept against a Visited Destination", singular). Nothing in the spec asks for a journal of
  multiple dated notes; that would be a real product decision belonging to a future spec, not an
  assumption smuggled into the schema here.
- **`status` is stored as three values** (Visited, Planned, Wishlist — FR-026), unconstrained in the
  direction it may change (FR-028, no state-machine validation). "Currently Traveling" is not a
  column — see R-004.
- **Destination's own `start_date`/`end_date` are independent of its Trip's**, with FR-017's
  containment check (a Destination's range falling outside its Trip's) enforced at the API layer, not
  by a database constraint — the check needs both rows loaded to evaluate, which a `CHECK` constraint
  spanning two tables cannot express in PostgreSQL without a trigger, and a trigger duplicates logic
  the API already has to have for the user-facing flag (FR-017 asks the owner to be told, not for the
  write to be silently rejected).

**Alternatives considered**:

- **A separate `place` entity, shared across Trips**, so revisiting Tokyo on two different Trips
  points at one record. Rejected: nothing in the spec or the draft asks for merged photo/note
  galleries across visits, User Story 1's overlap scenario is about **map disambiguation**, not
  record sharing, and a shared-place model reopens exactly the trip-membership question the
  Clarifications section already closed in the simpler direction. Two independent Destination rows
  for two visits to Tokyo is consistent with "a Destination MAY exist with no Trip" — each visit is
  its own record regardless.
- **A `status_history` table**, to keep a record of every status change (given FR-028's free-form
  transitions). Rejected: nothing in the spec asks for a history view, and constitution VII's
  single-owner scope makes an audit trail unmotivated. The current `status` column is enough for
  every requirement this spec states.

## R-004 — "Currently Traveling" is computed client-side, never stored

**Decision**: No `currently_traveling` column and no backend computation of it. The frontend computes
it the same way it already computes Content Calendar's overdue treatment: from `today()` (a
module-scope function read via `useSyncExternalStore`, per `frontend/AGENTS.md`'s existing rule)
compared against a Planned Destination's own `start_date`/`end_date`.

**Rationale**: This is not a new pattern invented for this feature — it is Content Calendar's
existing `isOverdue` treatment (`.claude/memory.md`; "Overdue is a dashed left border... orthogonal to
status rather than a fourth value of it") applied to a second derived fact in the same codebase.
Computing client-side rather than server-side has the same justification R-006 gave the calendar's
own date handling: it keeps "what day is it" answered by the browser's own clock rather than by a
server that does not know the owner's timezone, and it means a map re-render needs no round trip to
learn that a Destination has become "currently traveling" — the fact changes only at midnight in the
owner's own timezone, which the client already observes for the calendar today.

**Alternatives considered**:

- **A server-computed field returned on every read**, matching how some APIs derive booleans
  server-side. Rejected because the server does not reliably know the owner's timezone (the backend
  is timezone-naive by design, per R-006 in `001-content-calendar/research.md`), and because it adds
  a compute cost to every list read for a fact the client can derive for free from data it already
  has.
- **A stored boolean flipped by a scheduled job.** Rejected outright — this project has no background
  job infrastructure, and introducing one for a single derived boolean is exactly the kind of
  complexity constitution principle VII exists to keep out for a single-owner product.
