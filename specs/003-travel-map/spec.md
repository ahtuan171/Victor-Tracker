# Feature Specification: Travel Map

**Feature Branch**: `003-travel-map`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "The Travel Map module — VictorHub's primary capability per the constitution's 2.0.0 pivot. A world map of places visited and places wanted, where tapping a visited pin opens the photographs and notes kept against it, organised through Trips and Destinations, with route display and trip budgeting now permitted by the 2.1.0 constitution amendment. Derived from the 'Victor Tracker' input draft at drafts/travel-tracker.spec.draft.md."

## Why this iteration, and what it deliberately does not build

The constitution names the map as this product's one core capability (principle III) and its Scope
Constraints section commits v0.2 to exactly this: "a world map recording places visited and places
wanted, each visited place opening the photographs and notes kept against it." The input draft is
richer than that sentence — a full Trip/Destination/Activity planning tool with a route line, a
budget, transportation and accommodation records, and its own calendar. Not all of it ships here.

The draft's own §12 ("MVP — REQUIRED INPUTS") is the strictest reading of what it considers a first
version, and it is narrower than the rest of the draft: Trip needs only a name and dates and a status;
Destination needs a name, a resolved location, dates and a status. Route (§8), Budget (§1's optional
field, repeated in §13's V2 list), Category (§4), Priority, and cost fields are all absent from that
list even though the 2.1.0 amendment now permits route and budget constitutionally. **Permission is
not an obligation.** This spec follows the draft's own MVP line rather than the ceiling the amendment
opened, because principle III's "CRUD plus exactly one capability, nothing else" is what a spec is for
protecting against — including protecting against a good spec eating its own margin because a
capability was merely *allowed*.

One place this spec goes further than §12's bare list: photographs and notes on a visited place.
§13 tiers "Notes/Photos" as a Destination V2 optional input, but the **ratified constitution's own
description of this module** — written before the draft existed — names them as the payload a
visited pin exists to open. Constitution outranks draft. Photos and notes on a visited Destination are
therefore in this spec's MVP, not deferred.

**Explicitly out of scope for this iteration** — all of it is the draft's own V2 (§13) or V3 (§14)
tier, or absent from §12, and none of it is needed for the map to be the thing worth using:

- Trip route display (§8) and any per-trip route ordering control.
- Budget and every cost field — trip budget, per-activity cost, transportation cost, accommodation
  cost (§1, §9, §10, §13).
- Destination category and priority (§4), and category-based map filtering.
- Transportation and Accommodation as their own records (§9, §10).
- Cover image, description, tags, and travel companions on a Trip (§1, §13).
- **Activity and a dedicated Calendar surface for trip itineraries** (§5, §6) — resolved in
  Clarifications below. Deferred rather than built here.
- Everything in §14 (V3): third-party map integration, route optimisation, weather, AI itinerary,
  expense tracking, statistics, travel history, photo timelines, packing lists, reservation
  management.
- Automatic location capture from the device, any public or shared view of the map, and integration
  with any social platform — constitution principle II and the Scope Constraints section forbid all
  three regardless of what any draft asks for.

These become input for a later iteration if the owner wants them; recorded in `.claude/memory.md`'s
Deferred section once this spec is committed, not built here.

## Clarifications

### Session 2026-08-14

- **Q: Does this iteration ship a dedicated Activity/Calendar surface for trip itineraries, or is
  Activity deferred to a later iteration?**
  **A: Deferred.** This iteration ships Map + Trip + Destination only. Chosen over building Activity
  now because the draft's own §12 MVP field list does not require it either, and because
  `.claude/memory.md`'s existing Deferred entry already treats "retarget the calendar to trips" as a
  separate later iteration with its own `spec.md` — building a trip-itinerary calendar here would have
  pre-empted that question rather than left it for the iteration built to answer it. A later iteration
  can add Activity without this one having guessed at its shape.

- **Q: Must every map pin (Visited, Planned, or Wishlist) belong to a Trip, or can a place be marked
  independent of any specific Trip?**
  **A: Independent.** A Destination MAY exist with no Trip. Chosen because §7's Wishlist list reads as
  free-standing ("Iceland", "Switzerland", "New Zealand" — no trip attached to any of them yet) and
  because the Quick Add flow (§11) already offers "No date yet" alongside "This trip" and "Future
  trip," which only makes sense if a marked place can exist before any Trip is organised around it.
  Requiring a Trip first would force the owner through a multi-field form (name, start date, end date)
  just to note that they want to see Iceland someday — exactly the friction this product's capture
  flows exist to avoid (`.claude/memory.md`, 2026-07-29).

- **Q: What is a Destination's status vocabulary, and is "Currently Traveling" computed automatically
  from today's date falling inside the destination's date range, or set by hand?**
  **A: Three stored values — Visited, Planned, Wishlist — plus "Currently Traveling" as a derived
  overlay, not a fourth stored value.** Computed from today's date falling within a Planned
  Destination's own date range, the same pattern this product already uses for Content Calendar's
  overdue treatment: "orthogonal to status rather than a fourth value of it"
  (`frontend/AGENTS.md`/`CLAUDE.md`, 001 precedent). Chosen over a fourth stored value because a
  computed fact cannot go stale the way a manually-set one can — the owner would otherwise have to
  remember to flip a Destination to "Currently Traveling" the day they leave and flip it again when
  they return, which is exactly the kind of bookkeeping a derived fact removes. When the date range
  passes, the Destination stays Planned until the owner marks it Visited by hand; no automatic
  transition is required of this spec (see Edge Cases).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where I've been and where I want to go (Priority: P1)

The owner opens the map and sees every place they have marked, at a glance, distinguished by whether
they have been there, are planning to go, or just want to go — without opening anything or reading a
list.

**Why this priority**: this is the constitution's named core capability. Nothing else in this
iteration is worth building if this does not work.

**Independent Test**: with at least one place in each status marked, open the map and confirm each is
visually distinguishable by its status, with no other surface needed to tell them apart.

**Acceptance Scenarios**:

1. **Given** the owner has marked places in more than one status, **When** they open the map, **Then**
   every marked place appears as a pin whose status is distinguishable without tapping it.
2. **Given** the owner has marked no places yet, **When** they open the map, **Then** the map still
   renders (centred on a reasonable default view) and invites them to add their first place.
3. **Given** two places are close enough on the map that their pins would overlap at the current zoom
   level, **When** the owner views that area, **Then** both remain individually reachable (by zooming
   in or by an equivalent disambiguation), not merged into one that hides the other.

---

### User Story 2 - Open a visited place to see its photos and notes (Priority: P1)

The owner taps a place marked as visited and sees the photographs and notes they kept against it.

**Why this priority**: named explicitly in the constitution's description of this module — a visited
pin's whole reason to exist is that it opens to something. Without this, "visited" is indistinguishable
from a plain marker.

**Independent Test**: mark a place visited, attach a note and a photograph to it, and confirm both are
reachable by tapping its pin, with the photograph not merely a filename but a viewable image.

**Acceptance Scenarios**:

1. **Given** a visited place with a note and photographs attached, **When** the owner taps its pin,
   **Then** the note text and the photographs are both shown.
2. **Given** a visited place with nothing attached yet, **When** the owner taps its pin, **Then** they
   can add a note and photographs from there, not from a separate surface.
3. **Given** a place that is Planned or Wishlist rather than Visited, **When** the owner taps its pin,
   **Then** no photo/note gallery is offered — that capability is specific to a visited place, since
   nothing has happened there yet to keep a record of.

---

### User Story 3 - Organise places into a Trip (Priority: P1)

The owner creates a Trip (a name and a date range) and adds Destinations to it, each with a name and a
location resolved to real coordinates, so the Trip's places appear together on the map.

**Why this priority**: the map's places need a way to get onto it, and the draft's core relationship —
a Destination's coordinates are what put it on the map — is the load-bearing link between organising a
trip and seeing it. Tied for P1 with User Story 1 because neither delivers value without the other:
a map with nothing on it and a trip organiser that draws nothing are both incomplete alone.

**Independent Test**: create a Trip, add a Destination to it by searching for a real place name, and
confirm the Destination appears on the map at the resolved coordinates.

**Acceptance Scenarios**:

1. **Given** the owner is creating a Trip, **When** they supply a name, a start date, an end date, and
   a status, **Then** the Trip is created and ready to hold Destinations.
2. **Given** an existing Trip, **When** the owner adds a Destination by searching for a place name and
   selecting a match, **Then** the Destination is saved with real coordinates (not just the typed
   text) and appears on the map.
3. **Given** a place-name search that matches nothing, **When** the owner searches, **Then** they are
   told plainly rather than shown a false or empty-coordinate pin.
4. **Given** a Destination's date range, **When** it falls outside its Trip's own date range, **Then**
   the system flags this rather than silently accepting a Destination that could not happen during its
   own trip.

---

### User Story 4 - Add a place to the map directly, without opening a Trip first (Priority: P2)

The owner taps an unmarked spot (or a search result) directly on the map and marks it Visited, Planned,
or Wishlist in one short flow, without first navigating to create or open a Trip.

**Why this priority**: the draft's own Quick Add flow (§11) exists because a form is friction against
the moment an idea to visit somewhere occurs, which is the same "capture costs almost nothing" lesson
this product already learned building Content Calendar (`.claude/memory.md`, 2026-07-29). P2 because
User Stories 1–3 already deliver a working map without it — this is what makes adding to it fast.

**Independent Test**: from the map, mark a new place Wishlist in the fewest taps the quick-add flow
allows, and confirm it appears on the map immediately without a separate save step.

**Acceptance Scenarios**:

1. **Given** the owner searches for or taps a place on the map, **When** they choose a status for it,
   **Then** it is saved and rendered at that status without leaving the map.
2. **Given** the owner is marking a new place, **When** they choose to attach it to an existing Trip,
   **Then** it is created as a Destination of that Trip; **When** they do not, **Then** it is still
   saved and rendered on the map as a Destination with no Trip.

---

### User Story 5 - Filter the map by status (Priority: P2)

The owner narrows the map to just Visited, just Wishlist, or any other single status, so a map with
many places stays readable.

**Why this priority**: directly named in the draft (§7) and cheap once User Story 1's status rendering
exists — a status is already computed per place, so filtering by it adds no new data, only a control.
P2 rather than P1 because a map with a small number of places is already readable without it; it is a
scaling concern, not a first-use one.

**Independent Test**: with places in every status, select one status filter and confirm only that
status's pins remain visible, with a control to return to "all."

**Acceptance Scenarios**:

1. **Given** places exist in more than one status, **When** the owner selects a single status filter,
   **Then** only places in that status remain visible on the map.
2. **Given** a status filter is active, **When** the owner clears it, **Then** every place is visible
   again.

---

### Edge Cases

- What happens when a location search service is unreachable or times out? The owner is told the
  search failed and can retry; no Destination is created with placeholder or missing coordinates.
- What happens when the owner deletes a Trip that has Destinations with photographs attached? The
  system asks for confirmation naming what will be lost (the Destinations and everything attached to
  them), matching the destructive-action confirmation this product already requires elsewhere
  (`.claude/rules/design.md`).
- What happens when a photograph upload is interrupted partway (connection drops mid-transfer)? The
  Destination is not left referencing a broken or partial image; the owner can retry the upload.
- What happens when two Destinations are given coordinates that place them at (nearly) the same point
  on the map? Both remain independently reachable (User Story 1, scenario 3) rather than one silently
  replacing the other.
- What happens when the owner is offline or the map's tile provider is unreachable? The rest of the
  product (Trip and Destination data, photos, notes) remains usable; only the map's visual tiles fail
  to load, and the failure is visible rather than a blank screen with no explanation.
- What happens when a Trip has a status that logically conflicts with its Destinations' statuses (for
  example the Trip is Completed but a Destination is still Planned)? Out of scope for this iteration
  to reconcile automatically — recorded here so a later iteration does not have to rediscover the
  question; no automatic correction is required of this spec.

## Requirements *(mandatory)*

### Functional Requirements

**Places and the map**

- **FR-001**: The system MUST render every place the owner has marked as a pin on a world map.
- **FR-002**: Each pin MUST be visually distinguishable by its status (Visited, Planned, or Wishlist)
  without the owner tapping it, and that distinction MUST NOT rely on colour alone — matching this
  product's existing rule that status is readable at a glance in any presentation
  (`.claude/rules/design.md`). A Planned Destination whose date range currently contains today MUST
  carry an additional, distinguishable "Currently Traveling" treatment layered on top of Planned —
  computed, not stored (FR-026) — the same way an overdue Content Calendar item carries a border on
  top of its stored status rather than a fourth status value.
- **FR-003**: The owner MUST be able to pan and zoom the map to find any place on it.
- **FR-004**: The map MUST remain fully usable — pannable, zoomable, and every pin tappable — at the
  product's 375px mobile floor (constitution principle I).
- **FR-005**: Tapping a Visited place's pin MUST open the photographs and notes kept against it.
- **FR-006**: The owner MUST be able to add and edit a note on a Visited place.
- **FR-007**: The owner MUST be able to attach one or more photographs to a Visited place.
- **FR-008**: A photograph, once attached, MUST be viewable as an image, not merely referenced by a
  filename or link.
- **FR-009**: Tapping a Planned or Wishlist place's pin MUST NOT offer the photo/note gallery — that
  capability applies only to a place marked Visited.
- **FR-010**: The owner MUST be able to filter the map to a single status at a time, and to clear that
  filter back to showing every place.

**Location resolution**

- **FR-011**: When the owner names a place, the system MUST resolve it to real geographic coordinates
  before it can be saved and placed on the map — a typed name alone MUST NOT be accepted as a
  substitute for coordinates.
- **FR-012**: When a location search matches nothing, the system MUST tell the owner plainly rather
  than saving a place with no or placeholder coordinates.
- **FR-013**: No third-party request made while resolving a location or loading map tiles MAY carry a
  place's name, notes, photographs, or any other record identifier — only geographic
  coordinates/viewport, per constitution principle II. This applies to both the map's tile requests
  and any location-search request.

**Trips and Destinations**

- **FR-014**: The owner MUST be able to create a Trip with a name, a start date, an end date, and a
  status.
- **FR-015**: The owner MUST be able to add a Destination to a Trip with a name, a resolved location,
  a start date, an end date, and a status. A Destination's membership in a Trip is optional (FR-020) —
  this requirement covers the path where the owner is already working inside a Trip.
- **FR-016**: The owner MUST be able to edit and delete a Trip and a Destination.
- **FR-017**: When a Destination's date range falls outside its parent Trip's date range, the system
  MUST flag this to the owner rather than accept it silently.
- **FR-018**: Deleting a Trip that has Destinations MUST ask for confirmation that names what will be
  lost, before removing the Trip and its Destinations.
- **FR-019**: Every Destination, whether or not it belongs to a Trip, MUST appear on the map at its
  resolved location (this generalises FR-001 for the Trip-attached path specifically).

**Adding a place quickly**

- **FR-020**: The owner MUST be able to mark a new place on the map (Visited, Planned, or Wishlist)
  without first creating or opening a Trip — a Destination MAY exist with no Trip.
- **FR-021**: When marking a new place, the owner MUST be able to attach it to an existing Trip as one
  of that flow's choices, or leave it unattached.
- **FR-022**: A place marked through the quick-add flow MUST appear on the map immediately, without a
  separate save step or page.

**Object storage for photographs**

- **FR-023**: Photograph upload MUST go directly from the browser to object storage via a short-lived,
  presigned upload URL — never through the backend service, per `tech-defaults.md`'s Object Storage
  section.
- **FR-024**: Reading a stored photograph MUST use a short-lived, expiring, presigned URL minted per
  request; the object store bucket holding photographs MUST NOT be publicly readable.
- **FR-025**: Photograph bytes MUST NOT be stored in the application database; the database stores
  only the object key.

**Destination status**

- **FR-026**: A Destination's stored status MUST be exactly one of Visited, Planned, or Wishlist.
  "Currently Traveling" MUST be computed from today's date falling within a Planned Destination's own
  date range, and MUST NOT be a status value the owner sets by hand.
- **FR-027**: This iteration does not build Activity or a Calendar surface for trip itineraries — see
  "Why this iteration, and what it deliberately does not build" and the Clarifications section above.
  Any future iteration adding it starts from its own `spec.md`, not from an assumption made here.

### Key Entities *(include if feature involves data)*

- **Trip**: A journey the owner is organising or has completed. Has a name, a start date, an end date,
  and a status of its own (Wishlist/Planned/Booked/Upcoming/Traveling/Completed, per the draft's §2 —
  descriptive only; it does not drive any map pin). Groups zero or more Destinations.
- **Destination**: A specific place, with a name, a location resolved to coordinates, an optional date
  range, and a status (Visited, Planned, or Wishlist — FR-026) that drives how its pin is drawn on the
  map. MAY belong to a Trip; MAY exist with none.
- **Photograph**: An image attached to a Visited Destination, held in object storage and referenced by
  its storage key, never by embedded bytes.
- **Note**: Free text kept against a Visited Destination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening the map, an owner with places in every status can tell which are Visited, Planned,
  and Wishlist without tapping any of them.
- **SC-002**: A visited place's photographs and notes are reachable in exactly one tap from its pin.
- **SC-003**: Marking a new Wishlist place — from the owner's decision to add it, to it appearing on
  the map — takes no more interactions than the quick-add flow requires, with no intermediate page the
  owner must navigate away from and back to the map for.
- **SC-004**: The map is fully usable — every pin reachable, the view pannable and zoomable — on a
  375px-wide screen, matching every other surface this product ships.
- **SC-005**: A location search that matches a real place resolves to coordinates and places a pin
  without the owner ever typing a latitude or longitude by hand.
- **SC-006**: No tile or location-search request observed leaving the browser carries a place name,
  note text, or photograph — only coordinates or a viewport.

## Assumptions

- **Route display, trip budgeting, and all cost fields are out of scope for this iteration**, despite
  being constitutionally permitted since the 2.1.0 amendment — see "Why this iteration, and what it
  deliberately does not build" above. Recorded as a deferred item once this spec is committed.
- **Destination category and priority are out of scope** for this iteration, for the same reason;
  the map's filter for this iteration is by status only (Visited/Planned/Wishlist), not category.
- **A destination's route order, if this were built, is not addressed here** since Route itself is out
  of scope; a later iteration building it starts from a clean question rather than an assumption
  inherited from this one.
- **The geocoding provider is a technology decision, not a specification one** and belongs in
  `plan.md`, not here — this spec states only that a typed location must resolve to real coordinates
  (FR-011), not how.
- **The map basemap and its tile provider are technology decisions** for `plan.md`; this spec assumes
  only that a map exists and behaves as FR-001 through FR-004 describe.
- **A single owner, no sharing, no collaborators** — consistent with constitution principle VII and
  every other module this product has shipped.
