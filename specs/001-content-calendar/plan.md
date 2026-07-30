# Implementation Plan: Content Calendar

**Branch**: `001-content-calendar` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-content-calendar/spec.md`

## Summary

Deliver a single-creator content calendar: capture an idea with only a title, place it on a month or
week grid, and move it through `idea → draft → posted` without leaving the calendar or backlog. The
whole surface sits behind a login.

The technical approach is a FastAPI service over PostgreSQL exposing one authenticated CRUD resource
plus a login endpoint, and a Next.js App Router frontend whose calendar grid is hand-built rather
than adopted from a calendar library. Two decisions carry most of the risk and are worked out in
[research.md](./research.md): how the JWT is transported given a split Vercel/Render deployment, and
how to satisfy the spec's requirement that every date and status change work by tap as well as by
drag (FR-014a, FR-015a, FR-015b).

The stack is not chosen here — it is fixed for v0.1 by `.claude/rules/tech-defaults.md` and the
constitution's Scope Constraints. This plan records how that stack is applied and where its edges
meet the spec.

## Technical Context

**Language/Version**: Python 3.13 (backend), TypeScript 5.x on Node 22 (frontend)

**Primary Dependencies**: FastAPI, SQLModel, Alembic, plus `pyjwt` and `passlib[bcrypt]` for token
handling and password hashing, all managed with `uv` — never pip or poetry. Next.js App Router,
Tailwind, shadcn/ui, `@dnd-kit/core` for the drag path and `date-fns` for calendar arithmetic, managed
with `pnpm`.

**Storage**: PostgreSQL — docker-compose locally, Render managed in production. One table for content
items plus one holding the single creator account.

**Testing**: pytest against a dedicated test database (models and endpoints); Playwright for one E2E
flow. No Jest/RTL at v0.1 — the UI moves faster than component tests would survive.

**Target Platform**: modern mobile browsers as the baseline, desktop as an enhancement. 375px is the
design width and a hard floor, per constitution principle I.

**Project Type**: web application — separate `backend/` and `frontend/` deployables.

**Performance Goals**: taken from the spec's success criteria rather than invented. Platform filter
applies in under 1 second with no full page reload (SC-005); idea capture completes in under 15
seconds and at most 3 interactions (SC-001); a month view of a busy period renders without visible
jank on a mid-range phone.

**Constraints**: page body never scrolls horizontally at 375px, wide grids scroll in their own
container (FR-021). The full `idea → posted` journey is completable without a single drag gesture
(FR-015b, SC-011). No `user_id` or ownership column on the content item (FR-003, constitution VII).
No version marker for concurrent-edit detection (FR-023a).

**Rendering and data flow**: server components for the root redirect and the session guard only;
the calendar surface and backlog drawer are client components holding the visible period's items in
local state, with optimistic `PATCH` updates and client-side platform filtering. See
[research.md](./research.md) R-007 — this is the decision an earlier draft of this plan omitted
entirely.

**Scale/Scope**: one creator, hundreds of content items. **Three routes** — `/` (redirect),
`/login`, and `/calendar` — plus three overlay surfaces on the calendar route: the capture sheet, the
item sheet, and the backlog drawer. Month and week are two states of the same route, not separate
pages. This is not a scale problem; it is a friction problem.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0

| Principle | Gate | Status |
|---|---|---|
| I. Mobile-First, Thumb-First | Every screen designed at 375px first; primary actions in thumb reach; no horizontal body scroll | **PASS** — FR-021 and FR-022 are spec requirements and SC-003 makes them testable. Capture is a bottom-anchored sheet, not a top-right toolbar button. |
| II. Creator Data Is Private By Default | No endpoint returns data without authentication; no telemetry or third-party script sees entity data | **PASS** — every content route requires a valid token. Only `POST /auth/login` and `GET /health` are public. No analytics dependency enters the frontend. |
| III. One Core Capability Per Module | CRUD plus exactly one capability — the status pipeline view | **PASS** — the pipeline view is the one capability. No endpoint or screen serves Growth Tracker, Media Kit, or Deal Tracker. Bulk import was explicitly refused during clarify to protect this gate. |
| IV. The Spec Is The Source Of Truth | `spec.md` carries no technology; `plan.md` traces to numbered requirements | **PASS** — spec.md contains zero technology names. Every design decision below cites the requirement it serves. |
| V. Working And Deployed Beats Polished And Local | Polish deferred; tests, responsive behaviour, focus states, and destructive-action confirmation are not | **PASS** — FR-015b forces a non-drag path, which is what makes focus states possible at all; FR-020 requires delete confirmation. Neither is deferred. |
| VI. Merges Are Gated, Not Trusted | `main` protected, MR required, lint + type-check + tests block merge | **PASS** as a process commitment. **Open item**: no git remote is configured yet, so the GitLab project, protected `main`, and CI pipeline do not exist. This is a stage-3 prerequisite, not a design flaw — recorded in [quickstart.md](./quickstart.md). |
| VII. Build For One User Until There Is A Second | No multi-tenancy, roles, organizations, or speculative owner columns | **PASS** — `content_item` has no owner column. The creator table exists solely to hold one password hash. |

**Result**: no violations. Complexity Tracking is therefore empty.

### Post-Phase 1 re-check

Re-evaluated after [data-model.md](./data-model.md) and [contracts/openapi.yaml](./contracts/openapi.yaml) were written.

| Principle | Finding |
|---|---|
| II | The proxy decision (research.md R-001) means the browser never holds a bearer token in JavaScript-readable storage: an XSS bug cannot exfiltrate a 30-day credential. R-008 adds a path allowlist so the proxy cannot become a general credential-attaching relay for future endpoints. |
| III | Operation count held at eight across five paths — health, login, logout, list, create, fetch-one, update, delete. Design added nothing beyond CRUD and auth. Verified against the contract. |
| VII | `content_item` confirmed free of `user_id`, `owner_id`, `tenant_id`, and any version or `etag` column. |
| I | `PATCH /content-items/{id}` accepts partial updates, so the tap path and the drag path issue the same request with one field changed. There is no mobile-only or desktop-only endpoint. |
| IV | Every field in data-model.md traces to a numbered requirement; the traceability table in that file is the check. |

### Post-review re-check (after the `reviewer` pass)

A review of these artifacts found three requirements with no buildable design behind them. Two gates
needed re-examining as a result.

| Principle | Finding |
|---|---|
| III | **Re-affirmed under pressure.** The missing drop target for a status drag had an obvious fix — status lanes, i.e. a kanban board. That is a second core capability and principle III forbids it here. The spec was narrowed instead (FR-015a now requires tap only), which is the resolution principle IV mandates: fix the artifact, do not invent surface. |
| IV | **One violation found and corrected.** R-002 originally asserted that no amendment to `tech-defaults.md` was needed, which was the plan grading its own reinterpretation of a locked row. The mechanism survives; the self-clearance did not. A tech-defaults amendment is now queued for the Reflect stage, where that file may legitimately change. |
| I | The backlog moving from a separate route to a drawer on the calendar surface (R-003a) is what makes drag-to-schedule possible at all, and SC-008 reachable. Two routes could not have satisfied US3 scenario 1. |

**Result**: no violations remain. One was found, named, and corrected rather than absorbed.

## Project Structure

### Documentation (this feature)

```text
specs/001-content-calendar/
├── plan.md              # This file
├── spec.md              # Stage 1 output — the source of truth
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── main.py               # FastAPI app, CORS, router registration
│   ├── config.py             # settings from environment
│   ├── db.py                 # engine and session dependency
│   ├── models.py             # SQLModel: ContentItem, Creator; Platform and Status enums
│   ├── schemas.py            # request/response models where they diverge from the table
│   ├── auth.py               # password verify, token issue/decode, current-creator dependency
│   ├── api/
│   │   ├── auth.py           # POST /auth/login, POST /auth/logout
│   │   └── content_items.py  # list, create, update, delete
│   └── scripts/
│       └── seed_user.py      # creates the single v0.1 account
├── alembic/
│   └── versions/
├── tests/
│   ├── conftest.py           # test database, client, authenticated-client fixtures
│   ├── test_auth.py          # FR-001, FR-002, FR-002a
│   ├── test_content_items.py # CRUD, FR-004 to FR-006
│   └── test_transitions.py   # FR-008a, FR-009, FR-009a, FR-019a invariants
├── pyproject.toml
└── alembic.ini

frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                # root — server-side redirect to /calendar or /login
│   ├── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx          # server component: session guard + shell + bottom action bar
│   │   └── calendar/page.tsx   # the single content route — grid, backlog drawer, capture
│   └── api/[...path]/route.ts   # allowlisted proxy to FastAPI — research.md R-001, R-008
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── calendar/               # CalendarSurface (client), MonthGrid, WeekList, DayCell, PeriodNav
│   ├── backlog/                # BacklogDrawer — peek and expanded states (research.md R-003a)
│   ├── item/                   # ItemChip, StatusCue, PlatformCue, ItemSheet, DeleteConfirm, PlatformFilter
│   └── capture/                # CaptureSheet — the bottom-anchored, title-only form
├── lib/
│   ├── api.ts                  # typed client over the proxied routes
│   ├── proxy-allowlist.ts      # path and method allowlist, asserted against the contract (R-008)
│   ├── items.ts                # client-side item state and optimistic updates (research.md R-007)
│   ├── dates.ts                # date-fns wrappers, date-only handling
│   └── status.ts               # status and platform → visual cue mapping (FR-017, FR-018)
├── tests/
│   └── e2e/pipeline.spec.ts     # the one E2E flow
├── package.json
└── playwright.config.ts

design/
└── content-calendar/           # Claude Design exports — stage 2 input

docker-compose.yml              # Postgres + backend + frontend
```

**Structure Decision**: the web-application split from `.claude/rules/tech-defaults.md` — `backend/`
and `frontend/` as independent deployables, matching the Render and Vercel targets.

The frontend keeps calendar concerns in `components/calendar/` and item-rendering concerns in
`components/item/`, because the status and platform cues required by FR-017 and FR-018 are needed
identically by the calendar grid and the backlog list. `lib/status.ts` is the single place that
mapping lives. This is the one shared abstraction introduced up front, and it is justified because it
has two callers on day one — `workflow.md` forbids abstraction *before* a second caller exists, not
abstraction as such.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations. This section is intentionally empty.
