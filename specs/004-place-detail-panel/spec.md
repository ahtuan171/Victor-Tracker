# Feature Specification: Opening a Place

**Feature Branch**: `004-place-detail-panel`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Selecting a pin brings the map to it and marks it selected; a short
confirmation step naming the place precedes the full detail, so a mis-tap on a crowded map costs
nothing. What the detail shows is chosen by the place's status — a Visited place shows its
photographs and impressions, a Planned place shows its scheduled trip context, a Wishlist place shows
an honest empty state that invites planning. The control that changes status also changes what the
editing form asks for, so a place moving Wishlist → Planned → Visited is progressively asked for the
information each state makes meaningful."

## Why this iteration, and what it deliberately does not build

`003-travel-map` shipped the map and everything that puts places on it. What it did not do is make
**opening** a place feel like anything. Tapping a pin opens a sheet, the map does not move, and once
the sheet covers the screen the owner has lost track of which pin they opened. Worse, two of the three
statuses open to almost nothing: a Planned place shows its name and dates, and a Wishlist place shows
its name. The pin is the product's core object, and for two-thirds of its possible states, opening it
is a disappointment.

This iteration is about that one moment. It adds **no new information about a place** — every field
the detail panel draws already exists.

**The owner asked for more than this, and the rest was deliberately sliced off** (decision, 2026-08-17):

- **Total cost** is out. It is Budget, and Budget is not a field — it is currency, per-place versus
  per-Trip totals, and what a total means when a trip is half-planned. Constitutionally permitted
  since the 2.1.0 amendment; **permission is not an obligation**, the same reasoning `003`'s spec used.
- **Who the owner travelled with** is out. Genuinely cheap — a line of text, not an account — but it is
  a new recorded field, and this iteration's whole discipline is that it adds none.
- **A manually scheduled hour-by-hour itinerary** is out, twice over: it is the Activity surface
  `003`'s FR-027 already deferred to its own spec, and **the word "hour" reopens a decision this
  product closed on purpose.** Every date in this product is a calendar day with no time component,
  specifically so that time zones and daylight saving cannot enter the data at all. An itinerary with
  09:00 in it undoes that everywhere, not just on the itinerary. **The owner confirmed date-only is
  sufficient** (2026-08-17), so nothing here introduces a time of day.
- **Merging Trip into a place** is out. The owner's stated preference is that a pin should eventually
  *be* a trip; that merge belongs with the fields above, because a place already carries a name,
  coordinates, a date range, a status, impressions and photographs — so merging now would mostly mean
  **deleting** the Trip entity, and with it four requirements this product shipped and hand-walked
  three days ago. It would also make this iteration's Planned panel emptier, not richer: the Trip is
  what that panel has to show.

These become input for a later iteration; recorded in the project's deferred notes, not built here.

## Clarifications

### Session 2026-08-17

- **Q: Does "impressions" mean a new field, or the note a place already carries?**
  **A: The existing note.** A Visited place already holds free text kept against it, and that is what
  the owner means by impressions. Introducing a second free-text field alongside it would give the
  owner two boxes with no rule for which one anything goes in.

- **Q: Is the confirmation step between selecting a pin and seeing its detail an extra tap, and does
  that not make opening a place slower?**
  **A: Yes, an extra step, and that is the point.** It exists because pins overlap on a crowded map
  and the previous behaviour committed the owner to a full-screen surface on a single ambiguous tap.
  The step names the place, so a wrong pin is discovered before it costs a screen. It is not on the
  path this product measures for speed — that is *marking a new place*, fixed at three interactions,
  and this iteration does not touch it.

- **Q: Does a Trip's own status matter to any of this?**
  **A: No.** A Trip's status is descriptive and drives no pin, unchanged from `003`. Everything in
  this iteration keys off the **place's** status, which has exactly three values.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know which place I just opened (Priority: P1)

The owner taps a pin among several and the map comes to that place and marks it as the selected one,
so there is never a question of which place is on screen.

**Why this priority**: this is the defect the iteration exists to fix. Every other story here is about
*what* the detail shows; this one is about the detail belonging to a place the owner can still see.

**Independent Test**: with several places marked close together, tap one and confirm the map moves to
centre it, the pin is distinguishable as selected, and the place named on screen is the one tapped.

**Acceptance Scenarios**:

1. **Given** several places are visible, **When** the owner taps one, **Then** the map brings that
   place to the centre of the visible area and the pin is visibly marked as selected.
2. **Given** a place is selected, **When** the owner selects a different one, **Then** the first stops
   being marked as selected and the second becomes so — never two at once.
3. **Given** a place is selected, **When** the owner dismisses the selection, **Then** the map stays
   where it is rather than jumping back, and no pin is marked as selected.
4. **Given** two pins overlap at the current zoom, **When** the owner taps that cluster, **Then** the
   map moves in far enough that the two are separately tappable.

---

### User Story 2 - Confirm the place before it takes the screen (Priority: P1)

Selecting a pin shows a short step naming the place, with one action that opens its full detail — so a
mis-tap costs a glance rather than a full-screen surface the owner has to close.

**Why this priority**: tied to User Story 1 because the two are one gesture. A selection the owner
cannot verify is not much better than the sheet that opened on a wrong pin.

**Independent Test**: tap a pin, confirm the place's name is readable without the full detail opening,
and confirm that dismissing it returns to the map with nothing else having happened.

**Acceptance Scenarios**:

1. **Given** the owner has selected a pin, **When** the confirmation step appears, **Then** it names
   the place and shows its status, and offers one action to open the full detail.
2. **Given** the confirmation step is showing the wrong place, **When** the owner dismisses it,
   **Then** they return to the map with no detail having opened and nothing changed.
3. **Given** the confirmation step is showing, **When** the owner takes its action, **Then** the full
   detail for that same place opens.

---

### User Story 3 - A Visited place opens to what happened there (Priority: P1)

Opening a Visited place shows the photographs and the impressions the owner kept against it.

**Why this priority**: this is the constitution's own description of why a visited pin exists. It
largely works today; what this story adds is that it is now one presentation among three rather than
the only one that has content.

**Independent Test**: mark a place Visited with a note and photographs, open it, and confirm both are
shown as the substance of the panel rather than as fields on a form.

**Acceptance Scenarios**:

1. **Given** a Visited place with photographs and impressions, **When** the owner opens it, **Then**
   both are shown.
2. **Given** a Visited place with nothing kept against it yet, **When** the owner opens it, **Then**
   they are invited to add impressions and photographs from there.

---

### User Story 4 - A Planned place opens to the trip it belongs to (Priority: P1)

Opening a Planned place shows what is known about the trip: its own dates, the Trip it belongs to and
that Trip's range, whether its dates sit outside that range, and the other places in the same Trip.

**Why this priority**: this is the story that turns two-thirds of the map from a dead end into
something worth opening, and every field it needs already exists.

**Independent Test**: create a Trip with two places, open one, and confirm the panel names the Trip,
its range, this place's own dates, and the sibling place.

**Acceptance Scenarios**:

1. **Given** a Planned place belonging to a Trip, **When** the owner opens it, **Then** the panel
   shows its own dates, the Trip's name and range, and the other places in that Trip.
2. **Given** a Planned place whose dates fall outside its Trip's range, **When** the owner opens it,
   **Then** that is stated plainly in the panel, not left for the owner to work out by comparing dates.
3. **Given** a Planned place belonging to no Trip, **When** the owner opens it, **Then** the panel
   shows its dates and offers to attach it to a Trip, rather than showing an empty Trip section.
4. **Given** a Planned place whose date range contains today, **When** the owner opens it, **Then**
   the panel says so — matching the treatment its pin already carries.

---

### User Story 5 - A Wishlist place says honestly that there is nothing yet (Priority: P2)

Opening a Wishlist place shows an empty state that invites the owner to plan it, rather than a panel
of blank fields.

**Why this priority**: P2 because the map is usable without it and the failure it prevents is one of
tone rather than function — but a panel of empty boxes is how a product tells its owner that a
deliberate choice looks like missing data.

**Independent Test**: open a Wishlist place and confirm the panel explains why it is empty and offers
the next step, with no blank photo grid and no empty date fields presented as content.

**Acceptance Scenarios**:

1. **Given** a Wishlist place, **When** the owner opens it, **Then** the panel states that nothing is
   planned yet and offers to plan it.
2. **Given** a Wishlist place, **When** the owner opens it, **Then** no photo gallery and no
   impressions section is offered — matching the rule that those belong to a place the owner has been.

---

### User Story 6 - Changing status asks for what that status makes meaningful (Priority: P2)

The control that changes a place's status also changes what the editing form asks for, so moving
Wishlist → Planned → Visited is progressively asked for the information each state makes meaningful.

**Why this priority**: P2 because the statuses already change correctly today; this makes the change
useful rather than leaving the owner to find the right fields themselves.

**Independent Test**: take a Wishlist place to Planned and confirm the form asks for dates and a Trip;
take it on to Visited and confirm it asks for impressions and photographs.

**Acceptance Scenarios**:

1. **Given** a Wishlist place, **When** the owner changes its status to Planned, **Then** the form
   asks for the dates and the Trip that a plan implies.
2. **Given** a Planned place, **When** the owner changes its status to Visited, **Then** the form asks
   for impressions and photographs.
3. **Given** a place at any status, **When** the owner changes it to any other status, **Then** the
   change is accepted — the direction is never restricted (this restates an existing guarantee, which
   this story must not break).
4. **Given** the owner has been asked for a field they do not want to supply, **When** they leave it
   empty, **Then** [NEEDS CLARIFICATION: is the status change still saved, or refused until the field
   is supplied? The existing ratified guarantee is that any status is reachable from any other at any
   time with no validation; refusing would narrow it and needs to be an explicit amendment rather
   than a side effect of this form.]

---

### Edge Cases

- What happens when the owner opens a place, edits it elsewhere, and the place no longer exists? The
  panel closes rather than presenting a place that cannot be saved.
- What happens when a place has no coordinates the map can move to? Cannot occur — a place always has
  real coordinates, guaranteed since `003`.
- What happens when the selected place is filtered out by the active status filter? The selection is
  cleared, because a panel describing a pin the owner cannot see is a surface with no context.
- What happens when a Trip is deleted while one of its places is open? The panel stops claiming a Trip
  and shows the place as belonging to none.
- What happens when the owner opens a place while the map is still loading its imagery? The panel
  opens normally; the panel's content does not depend on the map having drawn.
- What happens on a screen wide enough to show the map and the detail at once?
  [NEEDS CLARIFICATION: does this iteration ship a distinct wide-screen layout with the detail beside
  the map, or one presentation at every width? The product's design rule makes the narrow layout the
  hard requirement and anything wider an enhancement, so shipping one layout is defensible; the
  owner's reference material is a wide screen showing both at once.]

## Requirements *(mandatory)*

### Functional Requirements

**Selecting a place**

- **FR-001**: Selecting a place MUST bring the map to that place rather than leaving the view
  unchanged.
- **FR-002**: A selected place MUST be visually distinguishable from unselected places, and that
  distinction MUST NOT rely on colour alone — matching the rule every other status cue in this product
  follows.
- **FR-003**: At most one place MAY be selected at a time.
- **FR-004**: Dismissing a selection MUST leave the map where it is and leave no place selected.
- **FR-005**: When places overlap at the current zoom, selecting them MUST bring the map close enough
  that each is separately selectable.

**Confirming before opening**

- **FR-006**: Selecting a place MUST show a confirmation step naming the place and its status, without
  opening the full detail.
- **FR-007**: The confirmation step MUST offer exactly one action that opens the full detail, and MUST
  be dismissible without opening it.
- **FR-008**: Dismissing the confirmation step MUST change nothing about the place.

**What the detail shows**

- **FR-009**: The content of a place's detail MUST be determined by its status.
- **FR-010**: A Visited place's detail MUST show its photographs and its impressions, and MUST offer to
  add both when it has neither.
- **FR-011**: A Planned place's detail MUST show its own dates, the Trip it belongs to, that Trip's
  range, and the other places in that Trip.
- **FR-012**: A Planned place whose dates fall outside its Trip's range MUST state that in the detail
  rather than leaving the owner to compare two ranges.
- **FR-013**: A Planned place whose date range contains today MUST say so in the detail, matching the
  treatment its pin already carries.
- **FR-014**: A Planned place belonging to no Trip MUST offer to attach it to one rather than showing
  an empty Trip section.
- **FR-015**: A Wishlist place's detail MUST show an empty state explaining that nothing is planned yet
  and offering to plan it, and MUST NOT present blank fields as though they were content.
- **FR-016**: A place that is not Visited MUST NOT be offered a photograph gallery or an impressions
  section — an existing rule, restated here because this iteration is where it becomes visible.

**Changing status**

- **FR-017**: The status control MUST change which fields the editing form asks for, so that each
  status asks for what it makes meaningful.
- **FR-018**: Moving a place to Planned MUST ask for its dates and its Trip.
- **FR-019**: Moving a place to Visited MUST ask for its impressions and its photographs.
- **FR-020**: A place's status MUST remain changeable to any other status in any direction — this
  iteration MUST NOT narrow that guarantee as a side effect of asking for fields (see the open
  question in User Story 6, scenario 4).

**What this iteration does not record**

- **FR-021**: This iteration MUST NOT introduce any new recorded information about a place. Cost, who
  the owner travelled with, and a scheduled itinerary are each a later iteration starting from its own
  specification.
- **FR-022**: This iteration MUST NOT introduce a time of day anywhere. Dates remain calendar days.
- **FR-023**: This iteration MUST NOT merge Trips and places into one entity.

### Key Entities

No new entities, and no new attributes on the existing ones. This iteration reads what is already
recorded:

- **Place** — already carries a name, a location, an optional date range, a status of Visited, Planned
  or Wishlist, impressions, and photographs; already may belong to a Trip or to none.
- **Trip** — already carries a name, a date range and a status of its own; already groups places. Its
  own status is not read by anything in this iteration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After opening a place, the owner can still see which pin it belongs to without closing
  the detail.
- **SC-002**: Opening the wrong place costs at most one dismissal and never a full-screen surface.
- **SC-003**: Each of the three statuses opens to content specific to it — no two statuses produce the
  same panel, and none produces a panel of blank fields.
- **SC-004**: A Planned place belonging to a Trip shows that Trip, its range and its other places
  without the owner navigating anywhere else.
- **SC-005**: Every surface this iteration adds is fully usable at the product's narrow-screen floor,
  matching every other surface this product ships.
- **SC-006**: Marking a new place still takes at most three interactions — this iteration does not make
  the capture path longer.
- **SC-007**: No place gains a recorded field it did not have before this iteration.

## Assumptions

- **"Impressions" is the free text a place already carries**, not a new field — resolved in
  Clarifications above.
- **Selecting a pin and opening its detail are two steps on purpose**, and the interaction budget this
  product measures applies to marking a new place, not to reading one.
- **A Trip's own status is not read anywhere in this iteration.** It remains descriptive.
- **The wide-screen question is a layout decision, not a data one** — whatever is decided, the content
  each status shows is the same.
- **Cost, travel companions, itinerary, and merging Trips into places are all deferred**, each to an
  iteration starting from its own specification. Recorded as deferred items once this spec is
  committed.
- **A single owner, no sharing, no collaborators** — unchanged from every iteration this product has
  shipped.
