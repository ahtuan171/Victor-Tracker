# Feature Specification: Content Calendar

**Feature Branch**: `001-content-calendar`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "Build a content calendar for a single content creator who publishes to TikTok, Instagram, and YouTube. They need to capture content ideas instantly on their phone with just a title, then later assign each idea a platform and a scheduled date, and move it through a pipeline of idea → draft → posted. Ideas without a date sit in a backlog; dated items appear on a calendar they can view by month or by week and navigate between periods. They can change an item's date and status directly from the calendar without opening a form, filter the calendar to one platform before a filming batch, and record a link to the live post once something publishes. Everything is behind a login — content plans are private. No social platform integrations, no media uploads, no reminders, and no collaboration in this iteration; the published link is pasted by hand. Success means capturing an idea takes under 15 seconds on a phone, and an item can go from idea to posted without ever leaving the calendar and backlog views."

## Problem

A creator publishing to TikTok, Instagram, and YouTube tracks upcoming content across notes apps, messages to themselves, and memory. Ideas get lost, posting cadence is uneven, and there is no single place to see what is in flight versus what has shipped. The cost is not only disorganization: gaps in posting cadence reduce reach.

## Who This Serves

A single creator managing their own content. Not a team and not an agency. There is no reviewer, approver, or collaborator role in this iteration.

## Clarifications

### Session 2026-07-30

Entity and pipeline shape, resolved during `/speckit-specify` because each one determines the form of
the content item or the number of pipeline states — the decisions most expensive to reverse once
implementation starts.

- **Q: Can one item target several platforms at once?** → **A: No — at most one platform per item.** Content going to two destinations becomes two items, so each can carry its own scheduled date and its own published link; those rarely coincide in practice. Encoded as FR-010a. Widening this later is an additive change; narrowing it would have required a data migration.
- **Q: Does `draft` mean "made and awaiting publication" or "actively being worked on"?** → **A: Made and awaiting publication.** Work in progress stays an `idea`. The pipeline keeps exactly three states, which is the number that stays legible in a phone-width calendar cell given FR-017's non-colour-alone requirement. Encoded as FR-007.
- **Q: Does a scheduled date need a time of day?** → **A: No — calendar day only.** No timezone or DST handling enters this iteration, the week view stays a list rather than a time grid, and drag-to-schedule stays a single gesture. Since publication is manual in v0.1, a stored time would have been advisory only. Encoded as FR-012a.
Security posture, interaction mechanics, and state-transition rules, resolved during
`/speckit-clarify`. Five questions asked, five answered.

- **Q: How long should a signed-in session last before the creator must log in again?** → **A: About 30 days, renewed silently while in use.** The tool is used in short bursts on a personal phone, and there is no password reset flow in scope, so a daily login would be worse friction than the privacy gain justifies. Encoded as FR-002a and SC-010.
- **Q: Must a tap-based path exist for changing date and status, or is dragging enough?** → **A: Both must exist.** Drag is the fast path where a pointer is comfortable; a tap-driven control is the one-handed path, the keyboard-reachable path, and the one automated tests can drive deterministically. Both trigger the same update, so this is one operation with two entry points. Encoded as FR-014a, FR-015a, FR-015b, and SC-011. — **Partly superseded by the post-review session below**: the answer holds for scheduling, but status was narrowed to tap only once it became clear a status drag has nowhere to drop at 375px.
- **Q: What happens on backward transitions and when clearing a platform?** → **A: Data is kept and the invariant is enforced.** Backward moves preserve the published link and the platform. Clearing the platform is refused while the item is past `idea`. This keeps "past `idea` implies a platform is set" true at all times — one check instead of scattered repair logic — and never discards something the creator typed, which matters most for a published link that cannot be reconstructed. Encoded as FR-008a, FR-009a, and FR-019a.
- **Q: Does v0.1 include a bulk way to bring in existing ideas?** → **A: No — manual entry only.** Capture is already a title-only action of a few seconds, so migrating stranded ideas is a one-time cost of minutes, while an import path means a format, a parser, and a screen for something run exactly once. Constitution principle III has already spent this module's one capability on the pipeline view. Added to Out of Scope and to Deferred in `.claude/memory.md`.
- **Q: How should simultaneous edits from two devices be resolved?** → **A: Last write wins, silently.** With one creator, a conflict is one person's two windows and the later action is the intended one. Detection would put a version marker on the entity and a rejection branch at every update path, to guard the creator against themselves. Views reflect stored data when loaded or refreshed; there is no live sync. Encoded as FR-023a and an assumption.

### Session 2026-07-30 (post-review)

A `reviewer` pass over the stage-1 artifacts found that three requirements had no buildable design
behind them. Two were closed in `plan.md` and `tasks.md` without touching this file; the third
required narrowing a requirement, which is recorded here rather than worked around.

- **Q: Can a creator actually set a platform anywhere?** → **A: No design existed for it; now required explicitly.** FR-009 makes a platform a precondition for leaving `idea`, but no planned surface assigned one, so every item would have been permanently stuck. The spec already implied this in US1 scenario 4; it is now stated as **FR-006a** so it is citable and testable. This was a gap in the plan, not a change of intent.
- **Q: Should status be changeable by dragging?** → **A: No — narrowed to tap only.** FR-015a previously required both. There is no layout at 375px holding a seven-column month grid alongside three status lanes without the horizontal scroll FR-021 forbids, and a lane-based board is a second core capability, which constitution principle III does not permit this module. Status has three values, so a tap control is one interaction against a drag's several. **FR-015a** and **SC-011** are amended; FR-014a keeps drag for scheduling, where dragging genuinely beats tapping.
- **Q: Where does the backlog live?** → **A: A drawer on the calendar surface, not a separate destination.** FR-011 continues to require a backlog list distinct from the grid, which is unchanged. The reason for recording it: as two separate destinations, US3 scenario 1 — dragging an undated item onto a calendar day — had no surface on which to occur, and SC-008 was unreachable rather than merely untested. This is a plan-level decision with no requirement change.

Added by this session: **FR-006a**, **SC-012**. Amended: **FR-015a**, **SC-011**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture an idea before it evaporates (Priority: P1)

Mid-conversation the creator thinks of a video concept. They open the app on their phone, type a title, and are done. No date, platform, or further detail is required. The idea lands in a backlog they can return to later.

**Why this priority**: This is the moment the product either earns its place or loses to a notes app. Any required field beyond a title is enough friction to send the creator elsewhere. Shipped alone, this is already a usable capture inbox — a viable MVP slice.

**Independent Test**: Sign in on a phone-width screen, capture three ideas with titles only, and confirm all three appear in the backlog after reload. Delivers value without any calendar view existing.

**Acceptance Scenarios**:

1. **Given** a signed-in creator on the app's landing screen, **When** they enter only a title and confirm, **Then** the item is saved with status `idea`, no platform, and no scheduled date, and appears in the backlog.
2. **Given** a creator capturing an idea, **When** they leave the title empty and try to save, **Then** the item is not created and they are told a title is required.
3. **Given** an item with no scheduled date, **When** the creator views the calendar grid, **Then** that item does not occupy any calendar cell and remains in the backlog.
4. **Given** a captured idea, **When** the creator opens it later, **Then** they can add or change its hook, platform, scheduled date, and status.

---

### User Story 2 - See the plan at a glance (Priority: P2)

The creator opens the app before filming and wants to know what is coming and what state each piece is in — without opening anything. They switch between a month overview and a week view and move to adjacent periods.

**Why this priority**: The status pipeline view is this module's single core capability. Capture without visibility is just a list; visibility is what replaces the scattered notes.

**Independent Test**: With a mix of items across statuses, platforms, and dates, open month and week views at phone width and confirm each item's status and platform are identifiable without opening it and without horizontal page scrolling.

**Acceptance Scenarios**:

1. **Given** items scheduled across two months, **When** the creator navigates to the next or previous period, **Then** the view shows that period's items and indicates which period is displayed.
2. **Given** a calendar containing items in `idea`, `draft`, and `posted`, **When** the creator looks at the grid without opening any item, **Then** each item's status is distinguishable by a cue that is not colour alone.
3. **Given** a phone-width screen of 375px, **When** the creator views the month view, **Then** the page body does not scroll horizontally; any wide grid scrolls within its own container.
4. **Given** items both with and without scheduled dates, **When** the creator views the app, **Then** dated items appear on the calendar grid and undated items appear in a backlog list, and no item appears in both.

---

### User Story 3 - Advance an item without leaving the calendar (Priority: P3)

The creator plans their week by moving ideas from the backlog onto empty days, and marks things as drafted or posted as work progresses — all from the calendar and backlog views, never through a separate page.

**Why this priority**: Planning happens in bursts of a few seconds between other tasks. Opening a form per change makes weekly planning a chore that gets skipped, which is exactly how cadence decays.

**Independent Test**: Take an undated `idea`, give it a date and a platform, advance it to `draft` and then `posted`, and reverse one step — counting zero navigations to a separate detail page.

**Acceptance Scenarios**:

1. **Given** an undated item in the backlog, **When** the creator places it on a calendar day, **Then** its scheduled date is set to that day and it leaves the backlog.
2. **Given** a dated item, **When** the creator moves it to a different day, **Then** its scheduled date updates and the change survives a reload.
3. **Given** an item in `idea` with a platform set, **When** the creator advances its status from the calendar, **Then** it becomes `draft` and its visual cue updates immediately.
4. **Given** an item in `posted`, **When** the creator moves it back to `draft`, **Then** the change is accepted — the pipeline is reversible.
5. **Given** an item in `idea` with no platform, **When** the creator tries to advance it past `idea`, **Then** the change is refused and they are told a platform is required first.
6. **Given** any item, **When** the creator deletes it, **Then** an explicit confirmation is required and deletion is not reachable by a single tap or by a common navigation gesture.
7. **Given** a creator using taps only and never dragging, **When** they set an item's date and then advance its status, **Then** both changes succeed and land in the same state a drag would have produced.

---

### User Story 4 - Focus on one platform (Priority: P4)

Before a batch of TikTok filming, the creator narrows the calendar to TikTok and sees only those items.

**Why this priority**: Useful but not load-bearing — the creator can read platform cues from the unfiltered view. It becomes valuable as volume grows.

**Independent Test**: With items across all three platforms, filter to each in turn and confirm only matching items are visible, then clear the filter and confirm all return.

**Acceptance Scenarios**:

1. **Given** items on all three platforms, **When** the creator filters to one platform, **Then** only items targeting that platform are visible in the calendar and backlog.
2. **Given** an active platform filter, **When** the creator clears it, **Then** all items become visible again.
3. **Given** an active filter, **When** it is applied or cleared, **Then** the visible items update without the page reloading from scratch.
4. **Given** items with no platform assigned, **When** a platform filter is active, **Then** those items are hidden, and the creator can still reach them by clearing the filter.

---

### User Story 5 - Close the loop after posting (Priority: P5)

After publishing, the creator marks the item `posted` and pastes the link to the live post, so the calendar reflects what actually happened rather than what was intended.

**Why this priority**: This is what turns the calendar into a record instead of a wish list, but it delivers value only once items are regularly reaching `posted`.

**Independent Test**: Move an item to `posted`, paste a link, reload, and confirm the link persists and is reachable from the calendar view.

**Acceptance Scenarios**:

1. **Given** an item being moved to `posted`, **When** the creator supplies a link to the published post, **Then** the link is stored with the item and visible from the calendar.
2. **Given** an item in `posted` without a link, **When** the creator views it, **Then** the item is valid — the link is optional.
3. **Given** a stored published link, **When** the creator opens it, **Then** it opens the live post outside the app.

---

### Edge Cases

- **Empty title on save** — rejected with a message; nothing is created (US1 scenario 2).
- **Advancing past `idea` with no platform** — refused, with the missing requirement named (US3 scenario 5).
- **Clearing the platform of a `draft` or `posted` item** — refused, with the creator told to move it back to `idea` first (FR-009a).
- **Reversing an item out of `posted`** — the published link survives; the creator has to delete it deliberately if they want it gone (FR-019a).
- **Scheduled date in the past while status is still `idea` or `draft`** — the item is surfaced as overdue rather than left silent, since an uneven cadence is the problem the product exists to solve.
- **Many items on one calendar day at phone width** — the day cell shows a bounded number of items plus a count of the remainder, and the remainder is reachable; the page body still does not scroll horizontally.
- **Malformed published link** — the creator is told the link does not look valid; the item's status change is not lost as a result.
- **Session expires mid-edit** — after the ~30-day validity window ends, the creator is returned to sign-in and no content data remains visible. Reaching this state in a test means forcing expiry, not waiting for it.
- **Deleting the item currently being dragged or edited** — confirmation is still required, and the view recovers without leaving a phantom item on the grid.
- **All items filtered out** — the view shows an explicit empty state naming the active filter, not a blank screen.
- **First run with no items at all** — the calendar and backlog show an empty state that points at the capture action, rather than an empty grid with no explanation.
- **Acting on an item already changed or deleted on another device** — the later action wins per FR-023a; if the item no longer exists the view recovers on refresh without presenting a phantom item as editable.

## Requirements *(mandatory)*

### Foundational Requirements

These gate every user story above; no story is complete without them.

- **FR-001**: The system MUST require authentication before any content data is returned or displayed.
- **FR-002**: An unauthenticated visitor navigating directly to any calendar, backlog, or item address MUST see no content data.
- **FR-002a**: A signed-in session MUST remain valid for approximately 30 days of intermittent use, renewing silently while the creator is active, and MUST end only on expiry or an explicit sign-out.
- **FR-003**: The system MUST serve exactly one creator account in this iteration, with no roles, sharing, invitations, or ownership concepts.

### Functional Requirements

- **FR-004**: The creator MUST be able to create, view, edit, and delete a content item.
- **FR-005**: A content item MUST have a title, and the title MUST be the only field required to create it.
- **FR-006**: A content item MUST be able to carry a hook or short description, a target platform, a scheduled date, a status, and a link to the published post; all of these except status MUST be optional at creation.
- **FR-006a**: After creation, the creator MUST be able to set or change every one of an item's fields — title, hook, target platform, scheduled date, status, and published link. In particular a target platform MUST be assignable to an item that was captured without one, since FR-009 makes that assignment a precondition for the item ever leaving `idea`.
- **FR-007**: An item's status MUST be one of `idea`, `draft`, or `posted`, and MUST default to `idea` on creation. `draft` means the content has been made and is awaiting publication; work still in progress is represented by the item remaining an `idea`. The pipeline has exactly three states in this iteration.
- **FR-008**: Status MUST be able to move both forward and backward through the pipeline.
- **FR-008a**: A backward status change MUST preserve every field the item already carries, including its target platform and its published link. No field is cleared as a side effect of moving backward.
- **FR-009**: The system MUST refuse to move an item past `idea` unless a target platform is set.
- **FR-009a**: The system MUST refuse to clear an item's target platform while its status is past `idea`, and MUST tell the creator to move the item back to `idea` first. The rule "status past `idea` implies a platform is set" therefore holds for every stored item at all times.
- **FR-010**: A target platform MUST be one of TikTok, Instagram, or YouTube — a fixed set that the creator cannot edit in this iteration.
- **FR-010a**: An item MUST target at most one platform. Content intended for more than one destination is represented as one item per destination, each carrying its own scheduled date and its own published link.
- **FR-011**: Items without a scheduled date MUST appear in a backlog list and MUST NOT occupy a cell in the calendar grid.
- **FR-012**: Items with a scheduled date MUST appear on the calendar grid on that date.
- **FR-012a**: A scheduled date MUST be a calendar day with no time of day. The system MUST NOT ask for, store, or display a posting time in this iteration.
- **FR-013**: The calendar MUST be viewable by month and by week, and the creator MUST be able to navigate to adjacent periods in both.
- **FR-014**: The creator MUST be able to change an item's scheduled date from the calendar and backlog views without opening a separate detail page.
- **FR-014a**: Changing a scheduled date MUST be possible both by dragging the item and by a tap-driven control, and both MUST produce an identical result.
- **FR-015**: The creator MUST be able to change an item's status from the calendar and backlog views without opening a separate detail page.
- **FR-015a**: Changing a status MUST be possible through a tap-driven control. Status is not draggable — see the post-review clarification in the Clarifications section for why this was narrowed.
- **FR-015b**: Every date and status change MUST be reachable without a pointer-drag gesture, so that the core journey remains completable by keyboard alone.
- **FR-016**: The calendar and backlog MUST be filterable to a single platform, or show all platforms.
- **FR-017**: Every item's status MUST be distinguishable at a glance in both calendar and backlog views, without opening the item and without relying on colour as the only cue.
- **FR-018**: Every item's target platform MUST be identifiable in calendar and backlog views without opening the item.
- **FR-019**: An item in `posted` MUST be able to carry a link to the published post, entered by hand.
- **FR-019a**: A published link MUST be retained when the item leaves `posted`, and MUST be removable only by the creator editing it directly.
- **FR-020**: Deleting an item MUST require an explicit confirmation and MUST NOT be reachable by a single tap or by a gesture used for common navigation.
- **FR-021**: Every screen MUST be fully usable at 375px width, and the page body MUST NOT scroll horizontally at that width; wide content MUST scroll inside its own container.
- **FR-022**: Actions the creator performs frequently — capture, status change, date change — MUST be reachable within thumb reach on a phone rather than only from a top corner.
- **FR-023**: Changes made to an item MUST persist across sessions and reloads.
- **FR-023a**: When the same item is changed from two places, the later change MUST win and MUST NOT be refused. The system does not detect, report, or merge concurrent edits, and views are not required to update themselves without a load or refresh.

### Key Entities

- **Content item** — a single planned or published piece of content aimed at one destination. Carries its title, hook, at most one target platform, a scheduled calendar day, a status, and a published link. Has no owner concept in this iteration.
- **Platform** — one of TikTok, Instagram, or YouTube. A fixed, non-editable set; not a record the creator manages. An item holds at most one.
- **Status** — one of `idea`, `draft`, `posted`. An ordered but reversible three-state pipeline; the ordering is what the calendar visualises.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the app's landing screen on a phone, a creator can capture a new idea with only a title in under 15 seconds and in no more than 3 interactions.
- **SC-002**: A creator can take an item from `idea` to `posted` — including setting a date and a platform — with zero navigations to a separate detail page.
- **SC-003**: At 375px width, month view, week view, and backlog are all fully usable and the page body never scrolls horizontally.
- **SC-004**: A viewer who cannot distinguish red from green can still identify every item's status correctly from the calendar view alone.
- **SC-005**: Applying or clearing a platform filter updates the visible items in under 1 second without a full page reload.
- **SC-006**: A signed-out visitor requesting any calendar, backlog, or item address directly receives no content data — verified for every such address.
- **SC-007**: No item can be deleted without an explicit confirmation step; a single accidental tap deletes nothing.
- **SC-008**: A week's worth of planning — placing 5 undated ideas onto days — takes under 60 seconds on a phone.
- **SC-009**: After a reload, every date, status, platform, and link change made in the previous session is still present.
- **SC-010**: A creator who signs in once and then uses the app intermittently is not asked to sign in again within 30 days.
- **SC-011**: The full journey from `idea` to `posted` can be completed without a single drag gesture. Scheduling can independently be completed by dragging, with the same end state either way.
- **SC-012**: An item captured with only a title can be given a platform and reach `posted` without the creator encountering a refusal they cannot resolve from the surface they are already on.

## Assumptions

Reasonable defaults chosen where the feature description was silent. Each is a decision that can be revisited in a later iteration.

- **Backlog ordering** — the backlog is ordered by creation time, newest first. Manual drag-to-reorder by priority is not included; if the creator finds themselves wanting it, that is input for the next iteration.
- **Overdue items** — a scheduled date that has passed while the item is still `idea` or `draft` is surfaced as overdue with its own visual treatment. Hiding it silently was rejected: the problem statement names cadence gaps as the cost being addressed.
- **Single account provisioning** — the one creator account is created out-of-band rather than through a sign-up flow in the app. No registration, password reset, or email verification is in scope.
- **Published link handling** — the link is a plain address the creator pastes. The system does not fetch, validate against the platform, unfurl, or scrape it.
- **Platform is optional until it matters** — an item can sit in `idea` indefinitely with no platform, since forcing the choice at capture time is exactly the friction FR-005 exists to remove.
- **Connectivity** — the creator is online when using the app. Offline capture and later synchronisation are not in scope.
- **Concurrent edits** — the creator may have the app open on more than one device. Whichever change arrives last is kept, with no detection, warning, or merge. Accepted because the only party who can be overwritten is the creator themselves.
- **Staleness** — a view shows what was stored when it loaded. Nothing pushes updates to an open view, so a second device's change appears on the next load or refresh.
- **Volume** — a single creator's planning horizon, on the order of hundreds of items rather than tens of thousands. Behaviour at large scale is not a design driver for this iteration.
- **Timekeeping** — dates are interpreted in the creator's own local context; there is a single creator and no cross-timezone coordination to reconcile.

## Out of Scope for This Iteration

Named explicitly because each is an attractive thing to add mid-build.

- Any integration with TikTok, Instagram, or YouTube — follower counts, real post metrics, scheduled auto-publishing. The published link in FR-019 is pasted by hand.
- Media file upload or storage. Items reference content; they do not contain it.
- Recurring or templated content series.
- Bulk import or export of any kind — no file upload, no paste-many box, no migration from a notes app. Items are entered one at a time through the same capture flow described in FR-005.
- Notifications, reminders, and any form of push or email.
- Multiple users, sharing, collaboration, roles, or approval flows.
- The other three CreatorHub modules — Growth Tracker, Media Kit Generator, Deal/Collab Tracker. No field, address, or screen in this iteration may exist to serve them.
