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

**Expected**: no content data in any response body, including server-rendered markup — the redirect
happens before markup is generated (research.md R-001). An expired session during navigation returns
to sign-in rather than leaving stale content on screen. Sign-out succeeds rather than deadlocking.

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
2. Using taps only, open it, **assign a platform**, set a date, advance to `draft`, then `posted`, and
   paste a published link.
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

### V6 — No horizontal page scroll

**Proves**: FR-021, SC-003

1. At 375px, open month view and week view with a busy month loaded, then the backlog drawer in both
   its peek and expanded states, then the capture sheet and the item sheet.
2. Attempt to scroll the page body horizontally in each.
3. Swipe vertically starting on an item chip in the month grid.

**Expected**: the body does not move. The month grid scrolls inside its own container if it needs to.
Week view is a vertical list of day sections, not seven columns (research.md R-004). Step 3 scrolls the
grid — it does **not** pick up the chip and silently reschedule it, which is what an unconstrained
`PointerSensor` would do (research.md R-003).

### V7 — Delete cannot happen by accident

**Proves**: FR-020, SC-007

1. Try to delete an item from the calendar, the backlog, and the item sheet.

**Expected**: every path requires an explicit confirmation, and no single tap deletes anything. Check
that the confirm action is not adjacent to a common navigation gesture.

### V8 — Changes survive a reload

**Proves**: FR-023, SC-009

1. Change a date, a status, a platform, and a link. Reload. Sign out and back in.

**Expected**: everything persists.

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

Two things are still outstanding, and neither blocks implementation:

1. **The single creator account has never been seeded.** `SEED_CREATOR_EMAIL` in `.env` uses the
   reserved `.local` TLD, `email-validator` rejects it, and the `creator` table is empty — so
   `uv run python -m app.scripts.seed_user` has never once succeeded. **V1 below cannot be walked by
   hand until this is fixed**, and T033 is the first task that builds a surface assuming a real
   session. Seed once with the address you intend to keep: re-running updates the password, but a
   *different* email is refused outright, and `content_item` has no owner column.
2. **`tasks.md` has not been imported as GitLab issues.** T001–T028 should be created and closed
   immediately so later `closes #N` references do not skew. `/speckit-taskstoissues` is GitHub-only
   and aborts on a GitLab remote — use `glab issue create` or the web UI. Do not try to make that
   command work; `.claude/rules/workflow.md` says so explicitly.
