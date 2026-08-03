# Phase 1 Quickstart: Content Calendar

**Feature**: `001-content-calendar` | **Date**: 2026-07-30 | **Plan**: [plan.md](./plan.md)

How to run this feature and prove it works. Written to be usable before any of it exists — the
commands are the conventions from `.claude/rules/tech-defaults.md` and become real as each part is
scaffolded.

This is a validation guide. Implementation belongs in `tasks.md`.

---

## Prerequisites

| Tool | Required | Status on this machine (2026-07-30) |
|---|---|---|
| Python 3.13 | yes | ✅ 3.13.5 |
| `uv` | yes — never pip or poetry | ✅ 0.11.32 |
| `pnpm` | yes | ✅ 11.17.0 |
| Playwright browsers | yes — `pnpm exec playwright install` | installed by T003 |
| Docker + compose | yes, for PostgreSQL | check with `docker compose version` |
| `glab` | stage 3 and every merge | ✅ 1.110.0, authenticated as `ahtuan1701` |
| Git remote | stage 3 and the merge gate | ✅ `gitlab.com/ahtuan1701/creator-hub`, `main` protected |
| A seeded creator account | V1, V2, V4, V8 — anything requiring a sign-in | ❌ **none exists** |

The merge gate required by constitution principle VI is real as of T025. The missing piece is now the
**creator account**: the seed script has never succeeded, so every scenario below that begins with a
sign-in is currently unrunnable by hand. See [Outstanding setup](#outstanding-setup).

---

## First run

```bash
# From the repository root — Postgres, FastAPI, and Next.js dev servers
docker compose up
```

```bash
# Backend, from backend/
uv sync
uv run alembic upgrade head
uv run python -m app.scripts.seed_user      # creates the single v0.1 account
uv run uvicorn app.main:app --reload
```

```bash
# Frontend, from frontend/
pnpm install
pnpm dev
```

The creator account is created by the seed script and nowhere else — there is no registration
endpoint. Credentials come from the environment; keep them in `CLAUDE.local.md` or `.env`, both
gitignored.

---

## Validation scenarios

Each scenario maps to numbered acceptance criteria in [spec.md](./spec.md). Run them at **375px
viewport width** — that is the design baseline and a hard floor, not a stress test.

### V1 — Nothing is visible without signing in

**Proves**: FR-001, FR-002, SC-006

1. With no session, open `/`, `/calendar`, and an item address directly.
2. Each redirects to `/login`. View source on each response.
3. Sign in, then force the session to expire and navigate between month and week.
4. Sign out while holding an already-expired token.

**Expected**: **no content data in any response body** — no item title, no backlog, no grid. An expired
session during navigation returns to sign-in rather than leaving stale content on screen. Sign-out
succeeds rather than deadlocking.

**What the response actually looks like, measured 2026-08-01 at the Phase 3 checkpoint.** This step
previously expected an empty body, on the reasoning that "the redirect happens before markup is
generated". That reasoning is right about *content* and wrong about the envelope: Next 16.2.12 answers
a server-component `redirect()` with a 307 carrying a ~6–7 KB `__next_error__` document — the route's
static metadata (`<title>Calendar · CreatorHub</title>`, the layout's description) and its script
preloads, and nothing else. **Both `next dev` and `next start` do this**; the production bundle is not
the empty-bodied case an earlier note in `frontend/AGENTS.md` claimed. The page component never runs,
so nothing derived from the creator's data is in it.

Assert on **content data**, which is what FR-002 and SC-006 require, not on the absence of markup —
the second is stricter than the requirement and is a property of the framework's redirect envelope
rather than of this application. Verified with three items in the database: none of their titles
appears in any of the three responses.

### V2 — Capture an idea in under 15 seconds

**Proves**: FR-005, SC-001, US1 scenarios 1 and 2

1. From the landing screen, open the capture sheet, type a title, confirm.
2. Count interactions and time it.
3. Repeat with an empty title.

**Expected**: at most 3 interactions, under 15 seconds, item appears in the backlog with status
`idea`, no platform, no date. Empty title is refused and creates nothing.

### V3 — Status is readable without colour

**Proves**: FR-017, FR-018, SC-004

1. Create three items with dates in the current month, one per status.
2. Screenshot the month view. Convert to greyscale.

**Expected**: all three statuses remain distinguishable — outline, half-filled, solid-with-check per
research.md R-005. If greyscale loses the distinction, the requirement is not met regardless of how
the colour version looks.

### V4 — The whole journey, without a single drag

**Proves**: FR-006a, FR-014a, FR-015a, FR-015b, SC-002, SC-011, SC-012, US3 scenario 7

1. Capture an idea with only a title.
2. Using taps only, open it, **assign a platform**, set a date, and advance to `draft`, then `posted`.
   (Pasting a published link is **V8's** step and belongs to US5 — the field arrives at T064. V4 is the
   **Phase 5** checkpoint gate, so a step from Phase 7 would make the gate unrunnable at the phase that
   runs it. FR-019 is deliberately absent from this scenario's *Proves* list for the same reason.)
3. Watch the address bar throughout.
4. Repeat the scheduling step on a second item by dragging it from the backlog drawer onto a day.

**Expected**: the journey completes and the URL never changes (SC-002). Step 2 is the one the first
draft of this plan made impossible — there was no platform control anywhere, so FR-009 would have
refused the move to `draft` with no way to resolve it. Dragging and tapping produce the same scheduled
date. Status has no drag path by design (FR-015a as amended).

The tap path is what Playwright automates; the drag half of SC-011 is validated here by hand, because
drag automation is the flakiest thing in a browser suite and a flaky merge gate gets switched off
(research.md R-003).

### V5 — Invariants hold under abuse

**Proves**: FR-008a, FR-009, FR-009a, FR-019a

```bash
# From backend/
uv run pytest tests/test_transitions.py -v
```

**Expected**: advancing past `idea` with no platform returns 409 `platform_required`; clearing the
platform of a `draft` item returns 409 `platform_locked`; walking `posted → draft → idea` preserves
platform and published link.

### V6 — Everything fits at 375px

**Proves**: FR-021, SC-003

**Amended at T069 (2026-08-03).** This scenario used to be called "No horizontal page scroll" and
asked only whether the body moved. FR-021 has **two** clauses — *"Every screen MUST be **fully
usable** at 375px width, **and** the page body MUST NOT scroll horizontally"* — and the first is the
one that breaks. A control pushed off the right edge satisfies the scroll clause completely, because
these layouts **clip rather than scroll**: measured three times now at x=417 (T077), x=411 (T068) and
a 561px-wide delete dialog (T069), every one of them with the page reporting no horizontal overflow.
Step 2 is therefore not sufficient on its own and step 3 is the real check.

1. At 375px, open month view and week view with a busy month loaded — long titles, a day over its
   chip cap, an overdue item — then the backlog drawer in both its peek and expanded states, then the
   capture sheet, the item sheet, **the delete confirmation**, and `/login` showing an error.
2. Attempt to scroll the page body horizontally in each.
3. **On each surface, check that every control is fully on screen** — no button, field or link with
   part of itself past either edge, and no label cut off mid-word. Give the item a title long enough
   to be worth the check.
4. Swipe vertically starting on an item chip in the month grid.

**Expected**: the body does not move, **and every control is wholly within the 375px width**. The
month grid scrolls inside its own container if it needs to. Week view is a vertical list of day
sections, not seven columns (research.md R-004). The backlog peek strip is the one place a control
may be clipped — it is a single line by design and the expanded drawer holds the same chips at full
size. Step 4 scrolls the grid — it does **not** pick up the chip and silently reschedule it, which is
what an unconstrained `PointerSensor` would do (research.md R-003).

`tests/e2e/viewport-audit.spec.ts` automates steps 2 and 3 across all three routes and all four
overlay surfaces, so this walk is confirming the surfaces the suite cannot reach rather than
repeating it.

### V7 — Delete cannot happen by accident

**Proves**: FR-020, SC-007

1. Try to delete an item from the calendar, the backlog, and the item sheet.

**Expected**: every path requires an explicit confirmation, and no single tap deletes anything. Check
that the confirm action is not adjacent to a common navigation gesture.

### V8 — Changes survive a reload, and the link is reachable

**Proves**: FR-023, SC-009, FR-019

1. Change a date, a status, a platform, and a link. Reload. Sign out and back in.
2. From the week list and from the expanded backlog drawer, find the item's open control beside its
   chip. Check `rel` reads `noopener noreferrer`, then open it.

**Expected**: everything persists, and the link opens the live post in a new tab.

> **Step 2 added at T065.** US5's Independent Test asks for two things — *"confirm the link persists
> **and is reachable from the calendar view**"* — and only the first had a step, so scenario 3 was
> validated by no gate at all. `rel` is checked by eye because it is the whole of what constitution II
> asks for here and a browser gives no visible sign of a `Referer` it did or did not send. The month
> grid is deliberately not in this step: its chips are `micro` in a ~53px cell, too small for a 44px
> control, and it reaches the link through the item sheet instead.

### V9 — A week's planning in under a minute

**Proves**: SC-008

1. With five undated ideas in the backlog, open the drawer.
2. Place all five onto days by dragging up onto the grid. Time it.

**Expected**: under 60 seconds. This is only achievable because the drawer and the grid share one
surface — as two separate routes it cost a route change, a sheet open, a date pick, and a route change
back, five times over (research.md R-003a).

## Test suites

```bash
# Backend, from backend/
uv run pytest
uv run pytest tests/test_transitions.py::test_cannot_clear_platform_past_idea   # single test
uv run ruff check . && uv run mypy .

# Frontend, from frontend/
pnpm exec playwright test
pnpm exec playwright test -g "idea to posted"                                    # single test
pnpm lint && pnpm exec tsc --noEmit
```

All four checks — `ruff`, `mypy`, `eslint`, `tsc` — plus both suites run in CI and block merge.
Constitution principle VI applies to your own merge requests.

---

## Outstanding setup

**The merge gate is real as of T025 (2026-07-31).** The project exists at
`gitlab.com/ahtuan1701/creator-hub`, `main` is protected with allowed-to-push set to **no one**,
`only_allow_merge_if_pipeline_succeeds` is `true`, and `glab` is installed and authenticated. Both
settings were verified against the GitLab API, not assumed. T025–T028 merged as MRs !1–!4, each
behind a green pipeline — the first changes in this project to pass a gate that could have stopped
them. Everything before that is a knowing constitution VI exception; `T076` records its range.

**The creator account is seeded, and V1 has been walked by hand (2026-08-01).** The blocker recorded
here was a `SEED_CREATOR_EMAIL` on the reserved `.local` TLD, which `email-validator` refuses; the
address in `.env` was changed to a real domain and `uv run python -m app.scripts.seed_user` succeeded.
V1 was then walked end to end in a browser — sign-in through the Next.js proxy to FastAPI to Postgres
— so the first real session in this project's history exists. It is the **only** hand-verified path so
far: every automated frontend test stubs the proxy, because CI has no FastAPI behind it. Do not
re-seed with a different address; a *different* email is refused outright, and `content_item` has no
owner column.

One thing is still outstanding, and it does not block implementation:

1. **`tasks.md` has not been imported as GitLab issues.** T001–T028 should be created and closed
   immediately so later `closes #N` references do not skew. `/speckit-taskstoissues` is GitHub-only
   and aborts on a GitLab remote — use `glab issue create` or the web UI. Do not try to make that
   command work; `.claude/rules/workflow.md` says so explicitly.
