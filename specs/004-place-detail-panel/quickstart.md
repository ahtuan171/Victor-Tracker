# Phase 1 Quickstart: Opening a Place

**Feature**: `004-place-detail-panel` | **Date**: 2026-08-17 | **Plan**: [plan.md](./plan.md)

How to run this feature and prove it works. Written before any of it exists, the same way `001`'s and
`003`'s quickstarts were. This is a validation guide; implementation belongs in `tasks.md`.

---

## Prerequisites

| Tool | Required | Status |
|---|---|---|
| Everything `003`'s quickstart already lists | yes | unchanged — this iteration adds no new dependency |
| A running backend with at least one place in each status | V2–V6 | seed or create by hand — no new fixture shape needed |

**No new environment variable, no new migration, no new package.** This is the first iteration's
quickstart in this product with an empty row in that sentence — see `plan.md`'s Summary for why.

```bash
# Backend, from backend/ — unchanged from 003, nothing new to run
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

```bash
# Frontend, from frontend/ — unchanged
pnpm install
pnpm dev
```

---

## Validation scenarios

Each scenario maps to numbered acceptance criteria in [spec.md](./spec.md). Run at **375px viewport
width** — this iteration's FR-021 makes that the only width this feature ships, not merely the
baseline to check first.

### V1 — Selecting a pin brings the map to it and marks it selected

**Proves**: FR-001–FR-005, SC-001 (User Story 1)

1. With several places marked, tap one pin. Confirm the map moves to centre that place and the pin is
   visibly marked selected — by shape/treatment, not colour alone.
2. Tap a different pin. Confirm the first stops being marked selected and the second becomes so; never
   two at once.
3. Dismiss the selection (via the confirmation step's dismissal, V2). Confirm the map stays where it
   is — it does not jump back to the previous view — and no pin remains marked selected.
4. With two places close enough to be hard to tap individually, tap that area. Confirm the map moves in
   far enough that each becomes separately tappable.

### V2 — The confirmation step guards against a mis-tap

**Proves**: FR-006–FR-008, SC-002 (User Story 2)

1. Tap a pin. Confirm a short step appears naming the place and its status, without the full detail
   opening.
2. Dismiss it. Confirm the owner is back at the map with nothing changed and no detail opened.
3. Tap a pin, then take the confirmation step's one action. Confirm the full detail for that same place
   opens.
4. From `DestinationStrip`, tap a card. Confirm the full detail opens **directly** — no confirmation
   step — while the map still moves to centre that place and marks it selected (R-001's documented
   asymmetry; V1's selection guarantee still holds here).

### V3 — A Visited place's detail is its photographs and impressions

**Proves**: FR-009, FR-010, FR-016, SC-003 (User Story 3)

1. Mark a place Visited with a note and at least one photograph. Open it. Confirm both are shown as
   the panel's content, not as editable form fields.
2. Mark a different place Visited with neither. Open it. Confirm the panel invites adding impressions
   and photographs from there.

### V4 — A Planned place's detail is the trip it belongs to

**Proves**: FR-009, FR-011–FR-014, SC-003, SC-004 (User Story 4)

1. Create a Trip with two places in it; set one to Planned with dates inside the Trip's range. Open it.
   Confirm the panel shows its own dates, the Trip's name and range, and the sibling place — with no
   extra navigation.
2. Give that place dates outside its Trip's range. Reopen it. Confirm the panel states the mismatch
   plainly.
3. Give it a date range containing today. Reopen it. Confirm the panel says so, matching the pin's own
   Currently-Traveling treatment.
4. Set a different place to Planned with no Trip. Open it. Confirm the panel offers to attach it to
   one, rather than showing an empty Trip section — and confirm choosing a Trip there actually attaches
   it (R-004's existing `PATCH`).

### V5 — A Wishlist place is an honest empty state

**Proves**: FR-009, FR-015, FR-016, SC-003 (User Story 5)

1. Mark a place Wishlist. Open it. Confirm the panel states that nothing is planned yet and offers to
   plan it — no blank date fields, no empty photo grid presented as content.

### V6 — The status control asks for what the new status needs, and never blocks a save

**Proves**: FR-017–FR-020 (User Story 6, and the resolved Clarification)

1. Take a Wishlist place to Planned. Confirm the form now asks for dates and a Trip.
2. Take a Planned place to Visited. Confirm the form now asks for impressions and photographs.
3. From any status, change to any other. Confirm every direction is accepted — never restricted.
4. Change status and leave a newly-asked field empty, then save. Confirm the status change is saved
   anyway and the field simply stays unset — the save is never refused (Clarifications, Session
   2026-08-17).

---

## What this quickstart does not cover

Cost, travel companions, a scheduled itinerary, and merging Trip into Place — all explicitly out of
this iteration's scope (spec.md's "Why this iteration" section, FR-022–FR-024). A distinct wide-screen
layout is also out (FR-021) — there is no V7 for it because there is nothing to validate that V1–V6
did not already cover at 375px.
