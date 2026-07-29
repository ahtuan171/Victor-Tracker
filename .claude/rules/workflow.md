# Workflow rules

Every module iteration runs eight stages: plan → design → load → impl → test → review → ship →
reflect. A new module (Growth Tracker, Media Kit, Deal Tracker) restarts at stage 1 with a fresh
`spec.md` against the same `constitution.md`.

## 1. Plan — SpecKit

`/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` →
`/speckit.tasks` → `/speckit.analyze`

- `spec.md` describes **what and why**, with zero technology in it. Technology lives in `plan.md`.
- Do not skip `/speckit.clarify` because the spec "feels clear" — the ambiguities it surfaces are the
  ones that would otherwise be discovered mid-implementation.
- Tasks are sized at half a day to a day. A task you cannot describe in one sentence is two tasks.
- All four files are committed before any application code is written.

## 2. Design — Claude Design

- Export React components into `design/<feature>/` alongside screenshots.
- The v0.1 design system is reused by every later module, so Content Calendar's visual decisions are
  effectively project-wide. Treat them as such.
- If a design implies a data field the spec lacks, amend `spec.md` first. Never let design and spec
  drift silently — that drift surfaces as rework in stage 4.

## 3. Load — GitLab

- Private project, `main` protected: merge requests only, no direct push.
- Import `tasks.md` into GitLab Issues and an Issue Board (To Do / Doing / Review / Done).

## 4. Impl

- One branch per issue: `feature/content-calendar-<task>`.
- Build order: model/migration → CRUD endpoints → auth → frontend API client → calendar UI →
  drag-and-drop status.
- Commits are atomic and reference their issue: `feat: add content item CRUD (closes #12)`.
- No abstraction is introduced before a second caller exists.

## 5. Test

- Backend: pytest against a dedicated test database, covering models and endpoints.
- Frontend: one Playwright E2E flow — create content item → drag to posted → verify on calendar.
- Wired into the CI `test` stage. Failing tests block merge, including on your own MRs.
- `/speckit.checklist` generates a requirement-coverage checklist to compare against.

## 6. Review

- Re-run `/speckit.analyze` before merging to catch spec drift.
- CI runs `ruff` + `mypy` + `eslint` + `tsc` as the automated review layer.
- Working solo does not mean self-merging without the gate. The gate exists to catch the author.

## 7. Ship

- Merge to `main` triggers `deploy` — manual approval at v0.1.
- Tag the release and update `CHANGELOG.md`.

## 8. Reflect

- Write `docs/retro-NN.md`: bad estimates, scope creep, friction between SpecKit / GitLab / Design.
- Compare shipped behaviour against the acceptance criteria in `spec.md`, item by item.
- Amend `constitution.md` only here — never mid-implementation to justify a shortcut.

## Language

English throughout — docs, specs, commit messages, comments, identifiers.

## When code and spec disagree

Stop. One of them is wrong. Decide which, fix that one, and say so explicitly in the MR. Do not code
around the gap and do not silently update the spec to match whatever was built.
