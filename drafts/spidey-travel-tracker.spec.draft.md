# "Spidey Travel Tracker" — input draft (not a spec)

Captured verbatim from the owner on 2026-08-19, as raw input for a possible future iteration. **This
is not a spec, and it is not currently actionable** — see the assessment below, written the same
session it was captured, before any code was touched against it. Do not build against this file
directly.

## Why this wasn't implemented on receipt

Three separate conflicts with this project's own constitution and already-shipped decisions, found
on a straight read-through — not a judgement call, each traces to an explicit written rule:

1. **The visual-identity direction is the standing Spider-Man/Spider-Verse IP exclusion, not a new
   question.** §2 and §8 ask for "Into the Spider-Verse" visual identity, halftone/web-inspired
   details, and "My personal Spider-Verse travel archive" as the product's own self-description. This
   is the exact exclusion recorded repeatedly and explicitly as **permanent, not scoped to one
   iteration** (`design/003-travel-map/BRIEF.md`; `.claude/memory.md`'s Decisions, 2026-08-14 entry
   — "no Spider-Man wordmark, no spider emblem, no character likeness, no studio logos", reaffirmed
   even when the owner offered an actual image asset). Marvel/Sony's rights to the character are not
   the owner's to waive by asking again in a differently-worded document — the earlier decision
   already covers this restated request in full.

2. **§2 retargets Content Calendar to trip itinerary — explicitly forbidden as a side effect.** The
   constitution's Scope Constraints say plainly: "Retargeting its `content_item` entity from content
   pipeline to trip itinerary is a separate iteration with its own `spec.md`; it MUST NOT be attempted
   as a side effect of building the map." `.claude/memory.md`'s own Deferred entry for this (2026-08-05)
   says the same, with its own trigger ("you actually use the calendar to plan a trip and the three
   dead fields get in the way") — unmet. This draft's whole §2 is that retarget, framed as new work
   rather than as the already-named separate iteration it is.

3. **§1/§3/§6/§7 collapse two entities this codebase deliberately keeps apart, and add fields nowhere
   authorised.** The draft's "Trip" (wishlist/planned/visited, budget, companions, photos-when-visited)
   is this codebase's **`Destination`** — the three-status entity that drives the pin. This codebase's
   actual `Trip` entity has a *different*, six-value status (wishlist/planned/booked/upcoming/
   traveling/completed) that **drives no pin at all** (`003-travel-map`'s own `TripPanel` row: "this
   status drives no pin, keep its treatment simple"). `004-place-detail-panel`'s own `spec.md` — closed
   this same session — explicitly decided **against** merging Trip into Place, for stated reasons (a
   place already carries most of what a merge would need; merging now would mean deleting the Trip
   entity and the map's own Planned-panel content). The draft's new fields (country, city, estimated
   budget, "why I want to go", travel companions, accommodation, transportation, actual cost, rating,
   review, favourite moment) mostly duplicate `.claude/memory.md`'s existing Deferred entries (Budget,
   Transportation, Accommodation, travel companions) — each already has its own stated trigger, none
   of which have fired — and the rest (rating, review, favourite moment) are new asks not discussed
   anywhere before this draft.

## One genuinely small, separable item: §1's map-zoom preference

Distinct from the three conflicts above and worth flagging on its own: §1 asks the pin-tap zoom to be
**less** aggressive ("moderate zoom... do NOT zoom to street-level detail"). This is the *opposite*
direction from `004-place-detail-panel`'s own T009 follow-up, shipped this same session, which raised
`MINIMUM_SELECTION_ZOOM` from 14 to **16** (street-level) at the owner's own explicit request against
two reference images. If this preference is genuine and current, it reverses that decision and is a
one-line change (`MapView.tsx`'s `MINIMUM_SELECTION_ZOOM` constant) — small enough not to need its own
iteration, but the owner should confirm it directly (a same-session reversal of an explicit same-session
decision is worth a second look) before it's changed again.

## What would need to happen before any of the rest is buildable

Per this project's own non-negotiable 3 ("nothing outside the current spec gets built... write into
`.claude/memory.md` under Deferred, do not implement") and the standing 8-stage workflow:

1. The owner decides explicitly whether the Spider-Man/Spider-Verse visual identity is dropped from
   this request entirely (it cannot be waived — see conflict 1 above) — the rest of the draft's
   *product* ideas (a travel journal calendar, status-driven forms, collection card views) do not
   depend on that visual language and could stand without it.
2. `002-pixel-arcade-skin`'s design system stays this product's one visual language regardless
   (`.claude/rules/design.md` — a feature module may not introduce a competing token layer); whatever
   visual direction survives has to be a re-skin iteration of its own if it changes at all, not
   smuggled in as part of a feature.
3. The Content-Calendar retarget (conflict 2) and the Trip/Place merge (conflict 3) are each their own
   iteration with their own `spec.md`, per the constitution — not this one.
4. Any new field (budget, companions, rating, review, etc.) waits for its own Deferred trigger, or a
   fresh owner decision that supersedes the existing trigger.

Recorded here as input, not scheduled. Nothing in this file authorises any code change.
