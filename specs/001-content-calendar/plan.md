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

**Language/Version**: Python 3.13 (backend), TypeScript 5.x on Node 24 (frontend) — `node:24-bookworm-slim` in CI, 24.12.0 locally

**Primary Dependencies**: FastAPI, SQLModel, Alembic, plus `pyjwt` and **`pwdlib[bcrypt]`** for token
handling and password hashing, all managed with `uv` — never pip or poetry. (This read
`passlib[bcrypt]` until T074. T002 verified that passlib 1.7.4 is **dead on Python 3.13** — its own
backend probe raises on bcrypt 5.0 — and substituted `pwdlib`; the reasoning is in
`backend/pyproject.toml` and `backend/AGENTS.md`, and the Open item below is discharged.) Next.js App Router,
Tailwind, shadcn/ui, `@dnd-kit/core` for the drag path and `date-fns` for calendar arithmetic, managed
with `pnpm`.

**Storage**: PostgreSQL — docker-compose locally, **Neon** managed in production. One table for content
items plus one holding the single creator account.

> **Substitution, stated as the constitution requires (T071, 2026-08-04).** The Scope Constraints
> section names "deployment to Render and Vercel" and says substituting any stack component "REQUIRES
> an explicit stated reason in `plan.md`, never a silent change". This is that reason.
>
> **What changed and what did not.** The *database host* moved from Render's managed Postgres to Neon.
> The backend still deploys to Render and the frontend still to Vercel, so the deployment targets are
> unchanged; so is the technology, which was and remains PostgreSQL. `.claude/rules/tech-defaults.md`
> is amended in the same merge request, because an amendment applied to one artifact is not applied.
>
> **Why.** Render's Postgres could not be created on this workspace at all, and its free tier is
> **deleted after 30 days** rather than suspended — so the provider that was available for one month
> would have re-presented this same problem in a month, with a live database in it by then. Neon's
> free tier does not expire. Two alternatives were considered and rejected: adding a payment method to
> Render (buys a month, does not solve it) and a second Render account (an external connection either
> way, so it pays the latency cost below *and* keeps the 30-day expiry).
>
> **The cost, stated rather than discovered later.** Render's *internal* URL is same-network; Neon is
> reached over the public internet, so every query now costs tens of milliseconds instead of ~1ms, and
> Neon's free tier auto-suspends after a few minutes idle. Stacked on Render's own free-tier
> spin-down, the first request of the day now crosses **two** cold starts. `pool_pre_ping=True` in
> `app/db.py` already covers the dropped-connection half. **This makes SC-001 harder to meet, and
> measuring it is exactly what T072 does** — the result is reported as measured, including if it
> fails.
>
> **Measured at T072 (2026-08-05): it fails cold.** Capture is 3 interactions and **1.89s warm**
> against a 15s budget; the first interaction of the day is **47.27s**, of which the `/calendar`
> document alone is **44.18s**. Warm, the same walk is **3.92s**. The prediction in this paragraph
> was correct and the cost is real — **SC-001 holds warm and misses cold by about three times the
> budget**, with the interaction count unaffected. Reported as measured, unsoftened, as this note
> promised. Remedy (paid tier or keep-warm ping) is deferred out of v0.1.

**Testing**: pytest against a dedicated test database (models and endpoints); Playwright for the E2E
flow. No Jest/RTL at v0.1 — the UI moves faster than component tests would survive.

> **As shipped (T074, 2026-08-04):** "one E2E flow" was the plan's estimate and the suite outgrew it —
> **271 backend tests and 432 Playwright tests across four projects** (`contract`, `proxy`, `client`,
> `mobile-375`), none skipped. The *design* intent behind the phrase still holds and is load-bearing
> in research.md R-003: the automated flow drives **taps**, and the drag half of SC-011 is validated by
> hand at quickstart V4/V9, because a flaky drag test would get switched off and a switched-off gate
> violates constitution VI.

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
the calendar surface and backlog drawer are client components holding **the whole item list, read
once on mount and unparameterised**, in local state — with optimistic `PATCH` updates and
client-side platform filtering. Period navigation issues no request at all; it re-narrows what is
already in memory. See [research.md](./research.md) R-007 — this is the decision an earlier draft of
this plan omitted entirely.

> **Corrected at T074 (2026-08-04).** This paragraph said "the visible period's items" until the
> T074 drift pass. That is the unit the **Phase 4 checkpoint overturned**, and R-007 carries the
> amendment — a ranged read bounds `scheduled_date` and so returns no undated rows, which would empty
> the backlog drawer the moment the grid loaded. R-007's own amendment note claims the fix reached
> three artifacts; it reached three of **five**. This file and `tasks.md` T033 were the other two, and
> this one cited R-007 in the same sentence it contradicted. Resolved against the executable artifact
> per `.claude/memory.md` — `frontend/components/calendar/CalendarShell.tsx` documents in its own
> comment that navigating a period issues no request.

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
| VI. Merges Are Gated, Not Trusted | `main` protected, MR required, lint + type-check + tests block merge | **PASS**, and no longer only as a commitment — **the gate has been real since T025** (2026-07-31). `origin` is `gitlab.com/ahtuan1701/creator-hub`, `main`'s allowed-to-push is **no one**, and `only_allow_merge_if_pipeline_succeeds` is `true`; both read back from the GitLab API rather than assumed. Everything from T025 on merged through an MR behind a green pipeline. **The gate's absence before T025 is a knowing exception that `T076` records** — see the note below. |
| VII. Build For One User Until There Is A Second | No multi-tenancy, roles, organizations, or speculative owner columns | **PASS** — `content_item` has no owner column. The creator table exists solely to hold one password hash. |

**Result**: no violations. Complexity Tracking is therefore empty.

> **The constitution VI exception, stated here because this is the artifact that grades VI (T074).**
> The gate did not exist for the first 25 merges into `main`: one local fast-forward carrying the
> stage-1 specs, plus every `--no-ff` merge from T001 through T024. None of them passed a check that
> could have stopped them. It is a *knowing* exception — creating the GitLab project first would have
> blocked all implementation on an account setup that blocked nothing else — and the point of the
> gate is that its absence gets written down rather than quietly omitted.
>
> **The count is pinned at `caca814~4` and must not be recalculated**: `git log --merges` now includes
> the real MR merges, so the number only means anything against that commit. **There is no second
> exception.** When the free-tier CI quota ran out on 2026-08-02 mid-pipeline, the answer was a
> project-owned runner — which does not draw on the shared quota — not a relaxed gate. `T076` records
> this range.

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
│   ├── calendar/               # CalendarShell (client), MonthGrid, WeekList, DayCell, PeriodNav
│   ├── backlog/                # BacklogDrawer — peek and expanded states (research.md R-003a)
│   ├── item/                   # ItemChip, StatusCue, PlatformCue, ItemSheet, DeleteConfirm, PlatformFilter
│   └── capture/                # CaptureSheet — the bottom-anchored, title-only form
├── lib/
│   ├── api.ts                  # typed client over the proxied routes
│   ├── proxy-allowlist.ts      # path and method allowlist, asserted against the contract (R-008)
│   ├── session.ts              # server-only: session cookie read + Max-Age from the token (R-001)
│   ├── items.ts                # client-side item state and optimistic updates (research.md R-007)
│   ├── dates.ts                # date-fns wrappers, date-only handling
│   ├── period.ts               # period span, step, and title — month and week (R-004)
│   ├── status.ts               # status and platform → visual cue mapping (FR-017, FR-018)
│   └── utils.ts                # shadcn's `cn` class merger
├── tests/
│   └── e2e/                     # pipeline.spec.ts is the core flow; the suite grew past one file
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
