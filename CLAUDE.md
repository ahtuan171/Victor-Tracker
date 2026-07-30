# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status as of 2026-07-30: stage 1 complete, no application code yet

Branch `001-content-calendar`, 5 commits, clean tree. Planning is done and reviewed; implementation
has not started. `backend/` and `frontend/` do not exist yet — the first thing that creates them is
task T001.

Slash commands use hyphens: `/speckit-specify`, not `/speckit.specify`. The constitution lives at
`.specify/memory/constitution.md` — there is no root `constitution.md`.

### Where each part stands

| Part | State |
|---|---|
| `.specify/` | Installed, v0.14.4.dev0. Constitution ratified at **v1.0.0** — 7 principles. `feature.json` points at `specs/001-content-calendar`. |
| `specs/001-content-calendar/` | **Complete**: `spec.md` (34 FR, 12 SC, 5 stories), `plan.md`, `research.md` (R-001…R-008), `data-model.md` (2 tables, INV-1…INV-4), `contracts/openapi.yaml` (8 operations), `quickstart.md` (V1…V9), `tasks.md` (**76 tasks, 8 phases**), `checklists/requirements.md` (16/16). |
| `drafts/` | `content-calendar.spec.draft.md` — superseded by `spec.md`. Kept for provenance; do not edit. |
| `backend/`, `frontend/`, `design/`, `docs/` | Do not exist. Correct — T001 onward create them. |
| GitLab / CI / `glab` | **None of it exists.** No remote, no protected `main`, no pipeline, `glab` not installed. |
| Local tooling | `uv` 0.11.32, `pnpm` 11.17.0, Python 3.13.5 all present. |

### What this session did

1. Ran the full stage-1 chain: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
   `/speckit-tasks` → `/speckit-analyze`, from the hand-written draft.
2. Answered 8 clarification questions across two rounds (3 on entity/pipeline shape during specify,
   5 on security, interaction, and state transitions during clarify).
3. Ran the **`reviewer` agent** on the finished artifacts. It found **six blocking design gaps**;
   all six are now closed. Commit `62e67b8` has the full list.
4. Answered 3 design questions the review exposed — backlog placement, status-drag, data fetching —
   and applied the consequences across all seven artifacts.

**The lesson worth keeping**: `/speckit-analyze` reported **95% requirement coverage** on the version
of `tasks.md` that still contained all six blockers, including one that left every content item
permanently stuck in `idea`. Coverage checks whether a requirement is *cited* by a task, not whether
the tasks *compose into something that works*. Run both `/speckit-analyze` and the `reviewer` agent —
they catch different classes of defect. This is recorded as a trap in `.claude/memory.md`.

### Decisions that shape the code, and why

Full reasoning lives in `spec.md`'s Clarifications section and `research.md`. The short version, so a
future session does not re-litigate:

| Decision | Why |
|---|---|
| One platform per item, max | Two destinations = two items, each with its own date and published link. Widening later is additive; narrowing would need a migration. |
| Three statuses; `draft` = made, awaiting publication | Three is how many stay legible in a 375px cell with a non-colour cue each (FR-017). |
| Calendar day only, no time of day | Keeps timezones and DST out entirely. Advisory-only until something auto-publishes. |
| ~30-day session, sliding reissue via `X-Access-Token` header | No refresh token (locked by tech-defaults). FastAPI attaches the header; the proxy rewrites the cookie. **Both halves are required** — without either, sessions die on day 30. |
| Drag for **dates only**; status is tap-only | A status drag needs lanes; lanes do not fit at 375px and are a second core capability (constitution III). FR-015a was narrowed rather than inventing surface. |
| Backlog is a **drawer on `/calendar`**, not a route | A DOM node cannot be dragged between routes, so two routes made US3 scenario 1 impossible and SC-008 unreachable. |
| Client components + local state + optimistic updates | SC-005 (<1s filter) and "cue updates immediately" both want local state. A server round trip per toggle risks Render's free-tier spin-down blowing SC-001. |
| Hand-built calendar grid, no library | Every library's value is time-of-day layout, which FR-012a removed. |
| Status cue = shape + fill, not colour | SC-004 must hold in greyscale. Overdue is a border, not a fourth state. |
| `DATE` end to end; `today` read client-side only | Makes the midnight-UTC off-by-one unrepresentable in data, and the hydration flip impossible in render. |
| Last write wins, no version column | One creator; the only person who can be overwritten is themselves (constitution VII). |

### Next session starts here

1. **Decide how `main` gets the specs.** `workflow.md` says planning artifacts belong on `main` before
   implementation. But constitution VI says `main` is MR-only, and with no remote a local merge is
   exactly the self-merge that gate exists to prevent. Either create the GitLab project first and open
   a real MR, or fast-forward locally and record it in the retro. **This is unresolved and blocks
   nothing else — but decide it deliberately.**
2. **Stage 3 (Load) prerequisites**, if going the GitLab route: create the private project, protect
   `main`, install `glab`, then import `tasks.md` as issues with `glab issue create`.
   `/speckit-taskstoissues` is GitHub-only and will abort — do not try to make it work.
3. **Stage 2 (Design)** or **straight to implementation**. `research.md` R-005 fixes the status-cue
   *semantics* independently of colour, so the cue components can be built against placeholder tokens;
   the stage-2 Claude Design export does not block Phase 4.
4. **Implementation begins at T001** in `specs/001-content-calendar/tasks.md`. Phase 1 (7 tasks) then
   Phase 2 (21 tasks) then US1 — US1 alone is a deployable MVP. Read the
   **Post-review revisions** table at the bottom of `tasks.md` first: three tasks exist for
   non-obvious reasons and look droppable if you have not read it.
5. **Do not skip** `T075` at the end — amending the Auth row of `tech-defaults.md` to permit sliding
   reissue. `research.md` R-002 defers it to Reflect on purpose, so the rule is inherited by later
   modules rather than re-derived from an argument buried in a research file.

## What this is

CreatorHub — a personal brand operating system for a content creator. Four planned modules:
Content Calendar, Growth Tracker, Media Kit Generator, Deal/Collab Tracker.

**v0.1 ships Content Calendar only.** The other three are later iterations, each re-running the full
8-stage workflow with a new `spec.md` against the same constitution. Do not add fields, endpoints, or
screens for the other modules while working on v0.1 — that is the main failure mode this project is
structured to avoid.

## Detailed rules

@.claude/rules/workflow.md
@.claude/rules/tech-defaults.md
@.claude/rules/design.md

## Working memory

@.claude/memory.md

## Non-negotiables

Three rules that override convenience in any given moment:

1. **`specs/` outranks code.** When they disagree, one is wrong — decide which, fix it, and say so
   in the MR. Never code around the gap.
2. **`spec.md` contains no technology.** What and why only. Technology lives in `plan.md`.
3. **Nothing outside the current spec gets built.** Useful ideas become input for the next
   iteration; write them into `.claude/memory.md` under Deferred, do not implement them.
