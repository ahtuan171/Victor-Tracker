# Phase 1 Quickstart: Travel Map

**Feature**: `003-travel-map` | **Date**: 2026-08-14 | **Plan**: [plan.md](./plan.md)

How to run this feature and prove it works. Written before any of it exists, the same way `001`'s
quickstart was — the commands are `.claude/rules/tech-defaults.md`'s conventions and become real as
each part is scaffolded. This is a validation guide; implementation belongs in `tasks.md`.

---

## Prerequisites

| Tool | Required | Status on this machine (2026-08-14) |
|---|---|---|
| Everything `001`'s quickstart already lists | yes | ✅ unchanged |
| `maplibre-gl` (frontend) | yes | ✅ added during the pre-planning spike, 6.3.0 |
| A Cloudflare R2 bucket + credentials | V5, V6 | not yet provisioned — first implementation task |
| Network access to `nominatim.openstreetmap.org` | V3 | required at runtime, not just at build |
| Network access to `basemaps.cartocdn.com` | V1 | ✅ confirmed reachable during the MapLibre spike |

**MapLibre under headless Playwright is already answered** — `frontend/AGENTS.md`'s Traps section
(2026-08-14 entry) and `scripts/spike-maplibre-headless.mjs` are the record. No new setup is needed
for the map itself to render in tests; see research.md R-002 for what that finding constrains about
*how* map assertions must be written (DOM/screenshot, never canvas pixels).

---

## First run

```bash
# Backend, from backend/ — same commands as 001/002, no new ones
uv sync
uv run alembic upgrade head          # new revision: trip, destination, photograph tables
uv run uvicorn app.main:app --reload
```

```bash
# Frontend, from frontend/
pnpm install                          # picks up maplibre-gl
pnpm dev
```

No new environment variable is required to **read** the map — CARTO's basemap and Nominatim's search
both need no API key (research.md R-001, `tech-defaults.md`). Cloudflare R2 credentials are required
once photograph upload is implemented (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME` — named here so the first task that needs them does not have to invent the names).

---

## Validation scenarios

Each scenario maps to numbered acceptance criteria in [spec.md](./spec.md). Run at **375px viewport
width** — the design baseline, not a stress test.

### V1 — The map renders and pins are distinguishable by status

**Proves**: FR-001–FR-004, SC-001, SC-004

1. With at least one Destination in each status (Visited, Planned, Wishlist), open the map.
2. Confirm every pin is visible and its status is readable without tapping it — by shape, not colour
   alone.
3. Pan and zoom; confirm every control stays reachable and nothing requires horizontal body scroll at
   375px.
4. With zero Destinations, open the map: it still renders, centred on a reasonable default view.

### V2 — Opening a Visited pin shows its photos and notes

**Proves**: FR-005–FR-009, SC-002

1. Mark a Destination Visited; add a note and at least one photograph.
2. Tap its pin: confirm the note text and the photograph both appear, in one tap from the pin.
3. Tap a Planned or Wishlist pin: confirm no photo/note gallery is offered.

### V3 — Searching a real place resolves to coordinates

**Proves**: FR-011, FR-012, SC-005

1. From the quick-add flow, search a real place name (e.g. "Kyoto"). Confirm one or more candidates
   are returned, each with a distinguishing address, and selecting one places a pin at real
   coordinates — never a typed name saved with no location.
2. Search a nonsense string with no matches. Confirm the owner is told the search found nothing,
   distinct from a search that failed to run at all (contracts/openapi.yaml's `502` vs an empty `200`
   array).

### V4 — Organising a Trip and seeing its Destinations on the map

**Proves**: FR-014–FR-019

1. Create a Trip (name, start date, end date, status).
2. Add a Destination to it via search; confirm it appears on the map.
3. Give a Destination a date range outside its Trip's own range; confirm the owner is flagged rather
   than the write silently accepted.
4. Delete the Trip; confirm the confirmation names what will be lost, and that its Destinations are
   gone from the map afterward.

### V5 — Marking a place directly from the map, in three interactions

**Proves**: FR-020–FR-022, SC-003

1. From the map, search or tap a location, then choose a status — count the interactions: at most
   three, matching SC-003.
2. Confirm the new pin appears immediately, with no intermediate page.
3. Repeat, this time choosing to attach it to an existing Trip; confirm it becomes that Trip's
   Destination rather than an unattached one.

### V6 — Photograph upload never touches the backend with image bytes

**Proves**: FR-023–FR-025

1. Attach a photograph to a Visited Destination. Using the browser's network inspector, confirm the
   image `PUT` goes directly to the R2 host, never to this product's own backend origin.
2. Confirm the backend's own request/response bodies around the upload carry only an `object_key`
   string, never image data.
3. Read the Destination again; confirm the photograph's URL is freshly minted (differs between two
   separate reads) and that the R2 bucket itself is not publicly listable/readable outside a presigned
   URL.

### V7 — Status changes freely, in any direction

**Proves**: FR-026, FR-028

1. Take a Destination through Wishlist → Planned → Visited → back to Wishlist. Confirm every
   transition succeeds with no validation error and no forced order.
2. Give a Planned Destination a date range containing today. Confirm its pin carries the additional
   "Currently Traveling" treatment (FR-002) without any manual status change, and confirm the stored
   `status` value itself is still `planned` (contracts/openapi.yaml's `Destination.status`, not a
   fourth enum value).

### V8 — Filtering the map by status

**Proves**: FR-010

1. With Destinations in more than one status, filter to a single status; confirm only matching pins
   remain.
2. Clear the filter; confirm every Destination is visible again.

### V9 — No third-party request carries entity data beyond what each request inherently needs

**Proves**: FR-013, SC-006, constitution principle II

1. Pan the map; inspect outgoing tile requests. Confirm each carries only viewport/zoom, never a place
   name, note, or record id.
2. Search a location; inspect the outgoing request to Nominatim. Confirm it carries only the searched
   text — the same text the owner just typed — and nothing about any other stored record (research.md
   R-001).

---

## Outstanding setup

Nothing yet — this feature has no implementation to walk against as of this writing. Filled in as the
first tasks land, the same way `001`'s quickstart was written before its backend existed and then kept
current.
