# Feature Spec (draft): Content Calendar

**Iteration:** v0.1 — the first module of VictorHub.
**Contains no technology decisions.** Those belong in `plan.md`.

## Problem

A creator publishing to TikTok, Instagram, and YouTube tracks upcoming content across notes apps,
chat messages to themselves, and memory. Ideas get lost, posting cadence is uneven, and there is no
single place to see what is in flight versus what has shipped. The cost is not just disorganization:
gaps in posting cadence directly reduce reach.

## Who this serves

A single creator managing their own content. Not a team, not an agency. There is no reviewer,
approver, or collaborator role in this iteration.

## User scenarios

**Capture an idea before it evaporates.** Mid-conversation, the creator thinks of a video concept.
They open the app on their phone, record the idea with a title and a one-line hook, and get back to
what they were doing. No date, platform, or detail is required at capture time.

**Plan the week.** On Sunday the creator opens the week view, sees three empty days, and drags two
ideas from the backlog onto them. They can tell at a glance which platform each slot targets.

**Track what is in flight.** The creator sees which items are still ideas, which are drafted and
awaiting publication, and which have gone live — without opening each one.

**Close the loop after posting.** After publishing, the creator moves the item to posted and records
where it went live, so the calendar reflects reality rather than intent.

**Focus on one platform.** Before a batch of TikTok filming, the creator filters the calendar to
TikTok only and sees just those items.

## Functional requirements

1. The creator can create, view, edit, and delete a content item.
2. A content item has: title (required), hook or description (optional), target platform (optional
   at creation, required before it can move past idea), scheduled date (optional), and status.
3. Status is one of: **idea**, **draft**, **posted**. Items progress forward and may be moved back.
4. Items without a scheduled date appear in a backlog list, not on the calendar grid.
5. The calendar is viewable by month and by week, and can be navigated to adjacent periods.
6. The creator can change an item's scheduled date and status directly from the calendar view,
   without opening a detail form.
7. The calendar can be filtered to a single platform, or show all platforms.
8. An item moved to posted can carry a link to the published post.
9. Every item's status is visually distinguishable at a glance in the calendar and backlog.
10. Access requires authentication. An unauthenticated visitor sees no content data.

## Key entities

- **Content item** — a single planned or published piece. Owns its title, hook, platform, scheduled
  date, status, and published link.
- **Platform** — TikTok, Instagram, or YouTube. A fixed set in this iteration, not creator-editable.

## Acceptance criteria

- A new idea can be captured with only a title, in under 15 seconds on a phone, from the app's
  landing screen.
- An item can be moved from idea to posted, including setting a date and platform, entirely from
  calendar and backlog views without navigating to a separate page.
- Month and week views render correctly at phone width, with no horizontal scrolling of the page.
- Filtering by platform updates the visible items without a full page reload.
- Signing out and returning to any calendar URL directly shows no content data.
- Deleting an item asks for confirmation and cannot be triggered by a single accidental tap.

## Explicitly out of scope for this iteration

- Any integration with TikTok, Instagram, or YouTube APIs. Follower counts, real post metrics, and
  auto-publishing are all deferred. The published link in requirement 8 is typed or pasted by hand.
- Media file upload or storage. Items reference content, they do not contain it.
- Recurring or templated content series.
- Notifications and reminders.
- Multiple users, sharing, or collaboration.
- The other three VictorHub modules.

## Open questions for `/speckit.clarify`

1. **Multi-platform items.** Can one item target several platforms at once (one video cut for TikTok
   and Reels), or is it one item per platform? This decides whether platform is a single value or a
   set, and changes how filtering and the calendar grid behave.
2. **Time of day.** Is a scheduled date sufficient, or does the creator plan specific posting times?
   Adding time-of-day pulls in timezone handling.
3. **Backlog ordering.** Is the undated backlog ordered by creation date, or manually reorderable by
   priority?
4. **Past-dated items.** What should the calendar show for a scheduled date that has passed while the
   item is still an idea or draft — surface it as overdue, or leave it silent?
5. **Draft semantics.** Does draft mean "content is made and waiting to publish", or "actively being
   worked on"? This affects whether the creator needs a fourth status.

---

## Ready-to-paste input for `/speckit.specify`

> Build a content calendar for a single content creator who publishes to TikTok, Instagram, and
> YouTube. They need to capture content ideas instantly on their phone with just a title, then later
> assign each idea a platform and a scheduled date, and move it through a pipeline of idea → draft →
> posted. Ideas without a date sit in a backlog; dated items appear on a calendar they can view by
> month or by week and navigate between periods. They can change an item's date and status directly
> from the calendar without opening a form, filter the calendar to one platform before a filming
> batch, and record a link to the live post once something publishes. Everything is behind a login —
> content plans are private. No social platform integrations, no media uploads, no reminders, and no
> collaboration in this iteration; the published link is pasted by hand. Success means capturing an
> idea takes under 15 seconds on a phone, and an item can go from idea to posted without ever leaving
> the calendar and backlog views.
