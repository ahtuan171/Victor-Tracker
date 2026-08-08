# Feature Specification: Pixel-Arcade Presentation Layer

**Feature Branch**: `002-pixel-arcade-skin`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Pixel-arcade presentation layer. The product should present itself as a piece of retro arcade equipment — a machine you operate — rather than as a document you read. This replaces the current dark editorial presentation across every existing surface at once, so the product never looks like two products joined together. No new data, no new records, no new information is captured or shown; this iteration changes only how what already exists is presented and reached."

## Why this is an iteration of its own

This is the only iteration permitted to change the product's shared presentation language. Every other
iteration consumes that language and does not compete with it. Separating it is what keeps that rule
true: a presentation change made inside a feature's iteration would leave two visual languages in the
product for as long as that feature took to finish, and would invite the next feature to start a third.

It runs **before** the travel map so the map is drawn once, in the final language, rather than built
and then redrawn.

## Clarifications

### Session 2026-08-06

- **Q: Does the strip of moving text at the bottom carry real information, or is it decoration?**
  **A: It carries real information.** The owner chose this over "purely decorative" and over dropping
  the strip entirely (which would have returned ~40px — 6% of the 667px height — to the working area).
  The consequence, written into FR-027 through FR-031: the strip becomes a surface a person reads for
  status, so it inherits obligations decoration would not have — it must agree with every other
  surface reporting the same fact, must not go stale, must say something when there is nothing to
  report, and must be fully readable while stationary. It gains no new data of its own.

- **Q: Where are the presentation and sound choices remembered — on the device, or against the
  account so they follow the owner to every device?**
  **A: Against the account.** Chosen over per-device after the cost was stated, and the cost is
  recorded here rather than softened: **this supersedes the "no new records" clause in the Input
  description above.** Two preferences now persist beyond a single device, which is a stored fact
  belonging to the owner rather than to any content record. It also makes FR-013 harder rather than
  impossible — a choice that lives elsewhere is not known at the first moment a screen is drawn, so
  the device must still be able to answer "what did this owner last see here" without waiting. That
  obligation is now FR-013a, and FR-013b covers the screen shown before anyone has signed in, where
  no account is known at all.

- **Q: With sound on, which actions produce it?**
  **A: Actions that change stored information, plus refusals** — capture, save, delete, move to a
  date, and a distinguishable sound when the product refuses something. Navigation, view changes,
  filtering and panel toggles stay silent. Chosen over the more arcade-like "navigation too" on the
  stated ground that navigation is the most repeated interaction, so it is the cheapest place to turn
  the whole feature into noise. Recorded as FR-023a and SC-015.

- **Q: Should the specification set a floor on text size, and where?**
  **A: 16px for content text, 12px absolute, and nothing below 16px in the display lettering.** This
  is the one requirement aimed directly at the known cost of the chosen direction — pixel lettering is
  hard to read at content size — and a number is what makes it checkable rather than a matter of
  opinion discovered after eleven screens exist. Recorded as FR-032 through FR-034 and SC-014.

- **Q: What does the strip of moving text report?**
  **A: The overdue count and the next thing due** — e.g. `3 OVERDUE · NEXT 12 AUG`. Both are derived
  from state the screen already holds, so the strip adds no reading of its own. It was chosen over the
  overdue count alone, which would have made the strip a second copy of the header count and bought
  nothing for its ~40px, and over a rotating set of items, which cannot satisfy FR-031.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The product presents as one machine (Priority: P1)

The owner opens the product and every screen — sign-in, the calendar, every panel and overlay — shares
one frame around the working area, one style of lettering, and one style of control. Nothing looks
left over from the previous presentation.

**Why this priority**: this is the entire point of the iteration. Delivered alone it is already the
whole visible outcome; every story below is either support for it or a preference attached to it.

**Independent Test**: open every screen the product has and confirm each carries the same frame,
lettering and control treatment. A single screen still in the previous presentation fails it.

**Acceptance Scenarios**:

1. **Given** the product has been re-presented, **When** the owner visits every screen in turn,
   **Then** each one carries the same frame, lettering and controls.
2. **Given** the owner is on the narrowest supported width, **When** any screen is shown,
   **Then** every control is fully within the screen and no text is cut off or illegible.
3. **Given** a screen that existed before this change, **When** the owner performs any task that
   worked before, **Then** it still works and takes no more interactions than it did.

---

### User Story 2 - One place that holds navigation and settings (Priority: P2)

The owner reaches a single place, from any screen, that lists every screen the product has and also
holds the way to change presentation and the way to leave the account. The working area stops
competing with navigation for space.

**Why this priority**: it is what makes the rest affordable. The working area at the narrowest width
has been measured with almost no room left, and the presentation frame will take more. Moving
navigation and account controls out of the working area is what pays for the frame.

**Independent Test**: from each screen, open this place, confirm it lists every screen, and confirm
leaving the account works from it.

**Acceptance Scenarios**:

1. **Given** the owner is on any screen, **When** they open this place, **Then** every screen the
   product has is listed and reachable from it.
2. **Given** this place is open, **When** the owner dismisses it, **Then** they are returned to
   exactly where they were with nothing lost.
3. **Given** this place is open over a screen that already has a panel of its own, **When** the owner
   interacts with either, **Then** the two do not obstruct or cancel each other.

---

### User Story 3 - A remembered choice of dark or light (Priority: P3)

The owner chooses between a dark and a light presentation. The choice survives closing and reopening
the product, and follows them to whatever device they open it on next. Before they have ever chosen,
they get dark.

**Why this priority**: valuable but not load-bearing — the product is fully usable with only the
default. It comes after the navigation story because that is where the control lives.

**Independent Test**: switch presentation, close the product entirely, reopen it, and confirm the
chosen presentation is what appears — including at the very first moment content becomes visible.
Then open it on a second device and confirm the same choice is in effect there.

**Acceptance Scenarios**:

1. **Given** the owner has never chosen, **When** they open the product, **Then** it is dark.
2. **Given** the owner has chosen light, **When** they close and reopen the product, **Then** it is
   light from the first moment anything is visible — the other presentation never appears first.
3. **Given** the owner chose light on one device, **When** they open the product on a different
   device, **Then** it is light there too.
4. **Given** the owner has chosen light and the connection is slow, **When** they reopen the product,
   **Then** it is light from the first moment anything is visible — waiting to be told is not an
   excuse for showing dark first.
5. **Given** either presentation, **When** the owner looks at any screen, **Then** everything the
   product distinguishes by appearance is still distinguishable.

---

### User Story 4 - Sound feedback, silent until asked for (Priority: P4)

The owner can turn on short sounds that respond to their actions. Until they do, the product makes no
sound at all. Nothing about sound stands between them and getting in.

**Why this priority**: it is the one part of the reference direction that is pure enhancement. Cut it
and nothing else in this iteration is weakened.

**Independent Test**: use the product from a fresh start and confirm silence throughout; turn sound
on, confirm actions produce it; confirm the choice survives reopening.

**Acceptance Scenarios**:

1. **Given** the owner has never turned sound on, **When** they use the product from opening it to
   signing out, **Then** it produces no sound at any point.
2. **Given** the owner opens the product for the first time, **When** it loads, **Then** nothing asks
   about sound before they can use it.
3. **Given** sound is on, **When** the owner turns it off, **Then** the product is silent immediately
   and stays silent after reopening.
4. **Given** sound is on, **When** the owner only navigates — moves between periods, changes view,
   filters, opens and closes a panel — **Then** the product stays silent throughout.
5. **Given** sound is on, **When** the product refuses something the owner asked for, **Then** the
   sound is distinguishable from the one a successful change makes.

---

### Edge Cases

- **The frame competes with the working area at the narrowest width.** The working area has already
  been measured at almost its limit. What happens when a decorative frame is added around it? The
  frame must yield: it is the only element here that exists for appearance rather than for function.
- **A person has asked their device to reduce motion.** Anything that moves on its own — a scrolling
  strip, a transition — must stop, and no information may be lost when it does.
- **Colour is removed entirely.** The product distinguishes pipeline states and other conditions by
  appearance. Every such distinction must survive greyscale, in both presentations.
- **The very first moment of a visit, before any remembered choice has been read.** A person who chose
  light must not see dark first, however briefly. Sharper since the choice became an account-level
  one: the answer now lives somewhere the first paint cannot wait for, so the device has to be able
  to answer it alone and be corrected later without a visible flip.
- **The account's remembered choice and the device's last-shown one disagree** — because the owner
  switched on another device since. The correction must happen without the owner watching the screen
  change under them mid-task.
- **The screen shown before sign-in**, where no account is known and therefore no account preference
  can be read at all.
- **The light presentation has never been seen anywhere but the sign-in screen.** It is effectively
  unbuilt rather than merely unchecked, and every screen in it is new work.
- **Sound is on, but the device or the surroundings refuse to play it.** The product must behave
  identically whether or not sound reaches the person's ears.
- **The navigation place opens over a screen that already has a panel open.** Two overlapping surfaces
  at the narrowest width is the case most likely to trap a person with no way out.
- **The moving strip has nothing to report.** An empty account of the product's state is still an
  account, and a strip that goes blank reads as broken rather than as calm.
- **The moving strip is stationary** — because motion was reduced, or because a still image is being
  looked at. Everything it says has to be legible in that moment, at the narrowest width, which puts
  a hard ceiling on how much it may say.

## Requirements *(mandatory)*

### Functional Requirements

**One presentation, everywhere**

- **FR-001**: Every screen and overlay the product has MUST present with the same frame, lettering and
  control treatment. No screen may be left in the previous presentation.
- **FR-002**: The presentation language MUST NOT encode anything specific to the calendar, because the
  screens added in later iterations consume the same language.
- **FR-003**: Every task that could be completed before this change MUST still be completable
  afterwards, in no more interactions than it took before.

**Usable at the narrowest supported width**

- **FR-004**: At the narrowest supported width (375px), no visible control may extend beyond the edge
  of the screen, on any screen or overlay.
- **FR-005**: At the narrowest supported width, the page body MUST NOT scroll horizontally. Content
  wider than the screen scrolls inside its own area.
- **FR-006**: Every control a person taps MUST remain at least 44px in its smallest dimension.
- **FR-007**: Text-entry fields MUST remain large enough that focusing one does not cause the page to
  change scale.
- **FR-008**: Decorative framing MUST consume less width at narrow widths than at wide ones, and MUST
  never be the reason FR-004 or FR-005 fails.
- **FR-009**: Controls used frequently MUST remain within reach of one thumb.

**Choice of presentation**

- **FR-010**: A person MUST be able to switch between a dark and a light presentation.
- **FR-011**: The chosen presentation MUST be remembered against the **account**, and MUST apply on
  the owner's next visit **from any device**, not only the one the choice was made on.
- **FR-012**: Before any choice has been made, the presentation MUST be dark.
- **FR-013**: The remembered presentation MUST be in effect at the first moment any content is
  visible. The other presentation MUST NOT appear first, even briefly.
- **FR-013a**: FR-013 MUST hold even though the choice is remembered against the account rather than
  the device — including when the connection is slow or unavailable at that moment. A device that has
  shown this owner a presentation before MUST be able to show it again immediately, without waiting to
  be told.
- **FR-013b**: On the screen shown before anyone has signed in, no account is known. That screen MUST
  use the last presentation this device showed, and dark if it has shown none. It MUST NOT flash a
  different presentation once an account becomes known.
- **FR-014**: Both presentations MUST satisfy every other requirement in this specification.

**One place for navigation and settings**

- **FR-015**: A single place MUST list every screen the product has, and MUST be reachable from every
  screen.
- **FR-016**: That place MUST hold the presentation choice, the sound choice, and the way to leave the
  account.
- **FR-017**: Leaving the account MUST NOT be reachable by a single accidental tap, and MUST sit
  further from the resting position of a thumb than the actions used frequently.
- **FR-018**: Dismissing that place MUST return the person to exactly where they were, losing nothing
  they had entered or opened.
- **FR-019**: When that place is open over a screen that has a panel of its own, neither MUST trap the
  person nor cancel the other.

**Sound**

- **FR-020**: The product MUST produce no sound until a person has explicitly turned sound on.
- **FR-021**: Nothing about sound may stand between opening the product and using it.
- **FR-022**: The sound choice MUST be remembered against the **account**, and MUST apply on the
  owner's next visit from any device. Unlike the presentation choice it has no first-paint obligation:
  nothing is heard until an action causes it, so there is time to find out.
- **FR-023**: The product MUST behave identically whether or not sound is audible in practice.
- **FR-023a**: Sound MUST accompany **only** actions that change stored information — capturing an
  item, saving a change, deleting, moving an item onto a date or back — and **refusals**, which get a
  distinguishable sound of their own. Navigation, changing view, filtering, and opening or closing a
  panel MUST be silent. The reason is the assumption below: a sound on every tap becomes noise, and
  noise is what gets the whole feature turned off. Navigation is the most repeated interaction there
  is, which makes it the most expensive place to put a sound.

**Appearance must not be the only carrier of meaning**

- **FR-024**: Every distinction the product makes by appearance MUST remain distinguishable when
  colour is removed entirely, in both presentations.
- **FR-025**: Motion MUST NOT be the only carrier of any information. When a person has asked for
  reduced motion, everything self-animating MUST stop and nothing MUST be lost.
- **FR-026**: Every control MUST show a visible indication when it has keyboard focus, in both
  presentations, and that indication MUST NOT be clipped away by the shape of the control.

**The strip of moving text**

Resolved 2026-08-06 (see Clarifications): it **carries real information**. That makes it a place the
owner will read for status rather than decoration, so the five requirements below are what stop it
becoming a second, disagreeing account of the same facts.

- **FR-027**: The strip MUST report exactly two facts: **how many items are overdue**, and **the next
  thing due**. Both MUST be derived from the state the surrounding screen already holds. The strip
  MUST NOT introduce any record, count or fact that no other surface already derives, and MUST NOT
  cause a reading of its own.
- **FR-028**: Whatever the strip reports MUST agree at all times with every other surface reporting
  the same fact. Where the strip and an existing count say the same thing, they MUST be two
  presentations of one value, never two independent readings that can disagree.
- **FR-029**: The strip MUST reflect the same loaded state as the screen around it, and MUST change
  when that state changes. It MUST NOT show a value the rest of the screen has stopped agreeing with.
- **FR-030**: When there is nothing to report, the strip MUST say so plainly. It MUST NOT go blank,
  and it MUST NOT keep showing the last thing it had to say.
- **FR-031**: Every piece of information the strip carries MUST be readable while it is stationary, at
  the narrowest supported width. Nothing may be available only to a person who waits for it to move
  past — which is also what makes FR-025 satisfiable here rather than a contradiction.

**Text must stay readable**

The one recorded cost of the chosen direction is that pixel lettering is hard to read at the size
content is set in. These three requirements are what stop that cost being discovered after eleven
screens have been drawn in it.

- **FR-032**: Content text — an item's title, its hook, and any value shown inside a cell or row —
  MUST be at least **16px**. 16px is also the size below which a phone enlarges the page when a text
  field is focused, so this and FR-007 are satisfied by the same floor.
- **FR-033**: Text anywhere in the product **MUST NOT** be below **12px** — including labels, counts,
  the moving strip, and anything inside the decorative frame.
- **FR-034**: Any text set below 16px MUST use the more legible of the two lettering styles, never the
  display style reserved for headings and labels.

### Key Entities

**No content record is created, read, or changed by this iteration** — nothing about what the calendar
holds is touched. Two preferences are remembered, and after the 2026-08-06 clarification they are
**stored against the account** rather than against the device, which is the one place this iteration
does add persistent data. That is a deliberate, recorded departure from the "no new records" framing
in the Input description above, not an oversight.

- **Presentation choice**: dark or light. Belongs to the owner, not to any content record. Absent
  until chosen; absent means dark. Follows the owner to every device (FR-011), and must still be
  answerable by the device at first paint (FR-013a).
- **Sound choice**: on or off. Belongs to the owner. Absent until chosen, and absent means off.
  Follows the owner to every device (FR-022).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero screens or overlays remain in the previous presentation.
- **SC-002**: At 375px, across every screen and every overlay, zero visible controls have any part
  beyond the edge of the screen.
- **SC-003**: At 375px, zero screens cause the page body to scroll horizontally.
- **SC-004**: A person can distinguish all three pipeline states, and an overdue item from a
  non-overdue one, from a greyscale image of any screen — in both presentations.
- **SC-005**: Switching presentation takes visible effect in under 1 second, and the person stays
  exactly where they were.
- **SC-006**: On a return visit, the remembered presentation is the first one seen, in 100% of visits —
  including on a device the choice was not made on, and including when the connection is slow.
- **SC-007**: Every screen is reachable in at most 2 interactions from any other screen.
- **SC-008**: With reduced motion requested, no information available with motion is unavailable
  without it.
- **SC-009**: From a fresh start with no choices made, the product produces zero sound across a
  complete pass through every screen.
- **SC-010**: Every task in the previous iteration's validation walk still completes, in no more
  interactions than it took before.
- **SC-011**: Every control shows a focus indication visibly different from its unfocused state, in
  both presentations.
- **SC-012**: Every fact the moving strip reports is also readable from a single still image of the
  screen at the narrowest supported width — zero facts require waiting.
- **SC-013**: Across every screen and every state, the strip and any other surface reporting the same
  fact never disagree.
- **SC-014**: Across every screen and every overlay, zero pieces of text render below 12px, and zero
  pieces of content text render below 16px.
- **SC-015**: With sound on, a complete pass through every screen produces sound only on actions that
  changed stored information and on refusals — zero sounds from navigating, filtering, changing view,
  or opening a panel.

## Assumptions

- **The visual direction is settled and is not re-opened here.** The owner chose it on 2026-08-05 from
  a screen recording of a reference site. Judgements *inside* that direction — proportion, weight,
  spacing — are design decisions made during this iteration.
- **The calendar's behaviour does not change.** Only its presentation does. Anything that would change
  what the calendar *does* belongs to a different iteration.
- **The light presentation is new work, not a re-check.** It exists today only on the sign-in screen,
  so every other screen is being seen in it for the first time.
- **Sounds are short cues responding to actions, not music or ambience**, and they attach to
  significant actions rather than to every tap. A sound on every tap becomes noise, and noise is what
  gets the whole feature turned off.
- **This iteration adds no screens.** The single navigation place is a surface over existing screens,
  not a new destination with content of its own.
- **The narrowest supported width remains 375px**, and remains a floor rather than one entry in a
  range of sizes to check.

## Out of Scope for This Iteration

Named explicitly, because each is one small step away from the work being done.

- Any change to what the calendar stores, shows, or lets a person do.
- The travel map and anything belonging to it. This iteration prepares the language the map will be
  drawn in; it draws none of it.
- New screens of any kind.
- Ambient or background audio, and any sound not caused by a person's action.
- Motion beyond what the presentation itself requires. No decorative movement for its own sake, given
  FR-025.
