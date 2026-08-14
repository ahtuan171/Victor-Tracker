# Implementation Plan: Travel Map

**Branch**: `003-travel-map` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-travel-map/spec.md`

## Summary

A world map of places the owner has visited, is planning to visit, or wants to visit — the
constitution's named core capability for this product, delivered through three data entities (Trip,
Destination, Photograph) rather than the draft's full six. A Destination carries a name, a location
resolved to real coordinates, an optional date range, and one of three statuses that drives how its
pin is drawn; it MAY belong to a Trip or exist with none. Tapping a Visited pin opens the photographs
and notes kept against it.

The technical shape follows from two things already settled before this plan started. First,
**MapLibre works under headless Playwright with no special-casing** — answered by a spike
(2026-08-14, `frontend/AGENTS.md`) rather than by this plan, so the frontend testing strategy is
"the same `mobile-375` project every other e2e test uses," not a research question. Second, the spec's
own scope discipline (its "Why this iteration, and what it deliberately does not build" section)
already excluded route display, budget/cost fields, category/priority, and Activity/Calendar — so this
plan has no technology decision to make for any of them, because none of them is being built.

What genuinely is new work here: **geocoding** (nothing in `tech-defaults.md` names a provider — R-001
below is this plan's one real research question), the **photograph upload path** (presigned R2, direct
from browser, a pattern this codebase has never built before), and the **map rendering itself**
(MapLibre is a new frontend dependency, though a spiked and confirmed-working one).

## Technical Context

**Language/Version**: Python 3.13 (backend, unchanged from `001`); TypeScript 5 / React 19.2.4 /
Next.js 16.2.12 App Router (frontend, unchanged from `002`).

**Primary Dependencies**: `maplibre-gl` 6.3.0 (new — the map itself, see research.md R-002). No new
backend dependency beyond what an HTTP client to call Nominatim needs (the project's existing HTTP
stack covers this; no new package). No SDK for Cloudflare R2 — its S3-compatible API is reached with
presigned-URL generation the existing `boto3`-equivalent or a minimal signing routine can produce;
the exact library is a task-level decision, not a plan-level one, since `tech-defaults.md` already
names R2 itself as the locked choice.

**Storage**: PostgreSQL — three new tables (`trip`, `destination`, `photograph`, data-model.md), one
new Alembic revision. Cloudflare R2 for photograph bytes, referenced by key only (FR-025).

**Testing**: pytest for the three new tables and their endpoints (backend, matching `001`'s pattern).
Playwright's existing `mobile-375` project for the map itself — no new project, per R-002. New test
files: a map-rendering suite asserting through the DOM and screenshots (never canvas reads, per
R-002's finding), a Trip/Destination CRUD flow, and a photograph-upload flow that asserts the upload
request never reaches this product's own backend origin (V6 in quickstart.md).

**Target Platform**: Mobile browsers first, 375×667 as a hard floor (constitution principle I,
unchanged). Deployed on Vercel (frontend) and Render (backend) against Neon, unchanged.

**Project Type**: Web application — existing `backend/` + `frontend/` trees, no new tree.

**Performance Goals**: No new cold-start concern beyond what `001`'s T072 already measured and
`.claude/memory.md`'s Deferred section already tracks (the stacked Render+Neon cold start). Marking a
new place completes in at most three interactions (SC-003) with no added round trip beyond what those
three interactions themselves require.

**Constraints**: 375px floor, no horizontal body scroll, 44px minimum tap target — unchanged,
inherited from `002`'s token layer, which this module consumes rather than replaces
(`.claude/rules/design.md`). Map tile and geocoding requests carry no entity data beyond what each
inherently requires (FR-013; research.md R-001 states the geocoding-specific nuance).

**Scale/Scope**: One user (constitution VII). A personal number of trips and destinations — no
pagination designed for volume, matching `001`'s `content-items` precedent.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — result at the bottom of
this section.*

| Principle | Verdict | Reasoning |
|---|---|---|
| **I. Mobile-First, Thumb-First** | **PASS** | FR-003, FR-004 restate it for the map specifically; SC-004 measures it. The map's own risk (a pannable/zoomable surface at 375px) is exactly what MapLibre's spike already confirmed works — the risk was rendering, not layout, and rendering is answered. |
| **II. Personal Data Is Private By Default** | **PASS, with one disclosure stated rather than hidden** | Tile requests carry viewport only (unchanged guarantee, now applied to CARTO instead of no tiles at all). **Geocoding is a different shape**: a search request necessarily carries the owner's typed text to Nominatim — inherent to what geocoding is, not a design choice that could be tightened away. Research.md R-001 states this explicitly, names why it does not violate the principle's intent (nothing else — no note, no photo, no saved name — ever leaves the origin for this purpose; only the active search text, only to the one provider whose job is resolving it), and draws the parallel to how principle II already treats the tile-viewport disclosure as inherent and statable rather than forbidden. Photograph storage satisfies every clause of principle II's object-storage bullet: presigned, expiring, never public, never bytes in Postgres (FR-023–FR-025). |
| **III. One Core Capability Per Module** | **PASS** | The map is the capability; Trip and Destination CRUD exist to put things on it, the same relationship `001`'s CRUD has to its status-pipeline view. The spec's own "Why this iteration" section is the record of what was deliberately kept out despite being constitutionally permitted (route, budget) or drafted (Activity/Calendar) — permission and a draft asking for something are both distinguished from an obligation to build it. |
| **IV. The Spec Is The Source Of Truth** | **PASS** | `spec.md` contains no technology; every provider/library decision (Nominatim, MapLibre, R2) lives here, in `plan.md` and `research.md`, exactly where the constitution's principle IV puts it. |
| **V. Working And Deployed Beats Polished And Local** | **PASS** | No design-stage token decisions are made here — this module consumes `002`'s token layer (`.claude/rules/design.md`) rather than introducing anything. Visual polish, where it exists, is not this plan's concern. |
| **VI. Merges Are Gated, Not Trusted** | **PASS** | Unchanged. Tasks land through merge requests behind the green pipeline, same as every prior iteration. |
| **VII. Build For One User Until There Is A Second** | **PASS** | No `user_id`/`owner_id` column on any of the three new tables (data-model.md INV-2), matching `001`'s INV-4 precedent exactly. |

**Post-Phase-1 re-check**: no verdict changed. Phase 1 sharpened principle II's row (the geocoding
disclosure is now stated with its exact reasoning in research.md R-001, not merely flagged) and
confirmed INV-1/INV-2 in data-model.md satisfy principles II and VII as designed, not just as
intended.

## Project Structure

### Documentation (this feature)

```text
specs/003-travel-map/
├── plan.md              # This file
├── research.md          # Phase 0 output — R-001…R-004
├── data-model.md         # Phase 1 output — trip, destination, photograph
├── quickstart.md        # Phase 1 output — V1…V9
├── contracts/
│   └── openapi.yaml     # Phase 1 output — a standalone contract, not a delta on 001/002
├── checklists/
│   └── requirements.md  # Written at stage 1, re-validated after clarification
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

No new tree. Everything lands in the two that exist.

```text
backend/
├── app/
│   ├── models.py                     # + Trip, Destination, Photograph, DestinationStatus, TripStatus
│   ├── schemas.py                    # + create/update/read schemas for all three
│   ├── services/
│   │   ├── geocoding.py              # NEW — Nominatim client (research.md R-001)
│   │   └── object_storage.py         # NEW — R2 presigned PUT/GET
│   ├── api/
│   │   ├── trips.py                  # NEW
│   │   ├── destinations.py           # NEW
│   │   ├── locations.py              # NEW — GET /locations/search
│   │   └── photographs.py            # NEW — upload-url, confirm, list, delete
│   └── main.py                       # + router registration
├── alembic/versions/                 # NEW revision — three tables, two enum types
└── tests/
    ├── test_trips.py                 # NEW
    ├── test_destinations.py          # NEW — includes FR-017's containment check, FR-028's free transitions
    ├── test_locations.py             # NEW — geocoding, stubbed Nominatim
    └── test_photographs.py           # NEW — presigned URL shape, never touches real R2 in tests

frontend/
├── app/
│   └── (app)/map/                    # NEW route — the map surface
├── components/
│   └── map/                          # NEW — MapView, DestinationPin, DestinationSheet, TripPanel, QuickAdd
├── lib/
│   ├── map.ts                        # NEW — pin status → visual treatment, currently-traveling overlay (R-004)
│   ├── trips.ts                      # NEW — pure functions + thin hook, matching lib/items.ts's split (frontend/AGENTS.md)
│   ├── destinations.ts               # NEW — same split
│   └── api.ts                        # + trips/destinations/locations/photographs client functions
└── tests/
    ├── e2e/map.spec.ts               # NEW — V1, V2, V7, V8 — DOM/screenshot assertions only (R-002)
    ├── e2e/trip-organise.spec.ts     # NEW — V4
    ├── e2e/quick-add.spec.ts         # NEW — V5, three-interaction budget
    ├── e2e/photo-upload.spec.ts      # NEW — V6, asserts the PUT bypasses this product's backend origin
    └── client/map.spec.ts            # NEW — currently-traveling computation, pure function tests
```

**Structure Decision**: the existing two-tree web application layout is kept unchanged, matching `001`
and `002`. `frontend/components/map/` is a new sibling to `components/calendar/` and
`components/arcade/` — not nested inside either, since it belongs to neither the content pipeline nor
the presentation chrome. `backend/app/services/` is new: `geocoding.py` and `object_storage.py` are
the first services this backend has that are not a direct CRUD route handler, because both talk to a
third party and neither belongs inside a route file the way `001`'s simple CRUD operations do.

## Complexity Tracking

*No entries.* Nothing here required a constitution exception, and no addition widens scope past what
`spec.md` already stated deliberately. The one thing worth naming as a **non**-violation, so a future
reader does not mistake it for an accidental one: `backend/app/services/` is a new directory this
codebase has not had before. It is not abstraction ahead of need — `001` never needed it because
none of its operations called a third party at all, and this feature has two (Nominatim, R2) on its
first task. A third caller is not required to justify a directory that exists because two genuinely
different third-party integrations both need somewhere that is not a route handler.
