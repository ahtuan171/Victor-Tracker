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
| Docker + compose | yes, for PostgreSQL | check with `docker compose version` |
| `glab` | stage 3 only | ❌ not installed |
| Git remote | stage 3 and the merge gate | ❌ none configured |

The last two block **stage 3 (Load)** and the merge gate required by constitution principle VI. They
do not block implementation. See [Outstanding setup](#outstanding-setup).

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

1. With no session, open `/calendar`, `/backlog`, and an item address directly.
2. Each redirects to `/login`. View source on each response.

**Expected**: no content data in any response body, including server-rendered markup. The redirect
happens before markup is generated — that is the point of reading the cookie server-side
(research.md R-001).

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

**Proves**: FR-014a, FR-015a, FR-015b, SC-011, US3 scenario 7

1. Using taps only, take a backlog item to a calendar day, then to `draft`, then to `posted`, and
   paste a published link.
2. Repeat the same journey on a second item using drags only.

**Expected**: identical end state both ways. This is the flow the Playwright test automates — via the
tap path, because drag automation is the flakiest thing in a browser suite and a flaky merge gate gets
switched off (research.md R-003).

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

1. At 375px, open month view, week view, and backlog with a busy month loaded.
2. Attempt to scroll the page body horizontally.

**Expected**: the body does not move. The month grid scrolls inside its own container if it needs to.
Week view is a vertical list of day sections, not seven columns — see research.md R-004.

### V7 — Delete cannot happen by accident

**Proves**: FR-020, SC-007

1. Try to delete an item from the calendar, the backlog, and the item sheet.

**Expected**: every path requires an explicit confirmation, and no single tap deletes anything. Check
that the confirm action is not adjacent to a common navigation gesture.

### V8 — Changes survive a reload

**Proves**: FR-023, SC-009

1. Change a date, a status, a platform, and a link. Reload. Sign out and back in.

**Expected**: everything persists.

---

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

Two things must exist before stage 3 (Load) and before the merge gate is real:

1. **A GitLab project and remote.** `main` protected, merge requests required, direct push refused.
   Until then `git push` has nowhere to go and no gate exists to enforce.
2. **`glab` installed.** Needed to create issues from `tasks.md`. Note that
   `/speckit-taskstoissues` is GitHub-only and aborts on a GitLab remote — use `glab issue create`
   or the web UI. Do not try to make that command work; `.claude/rules/workflow.md` says so
   explicitly.

Neither blocks implementation. Both block shipping.
