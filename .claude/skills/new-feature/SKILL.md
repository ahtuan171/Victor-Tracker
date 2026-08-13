---
name: new-feature
description: Start a new module iteration — drives the Plan and Design stages (1-3 of 8) for a module that has no spec yet, such as the Travel Map. Use when beginning work on a module with no spec, or when the user says they are starting the next version.
---

# Starting a new module iteration

Drives stages 1-3. Stop when GitLab issues exist; implementation is a separate session.

## Before anything

Confirm the previous iteration is actually closed:

- Is there a `docs/retro-NN.md` for it? If not, the Reflect stage was skipped — the lessons that
  should shape this spec are still in someone's head. Say so and offer to write it first.
- Does `.specify/memory/constitution.md` need an amendment from that retro? Reflect is the only stage
  where it changes; if it was going to change, it changes now via `/speckit-constitution`, before the
  new spec is written.

## Stage 1 — Plan

Run in order, do not skip. Note the hyphens — the commands are `/speckit-specify`, not
`/speckit.specify`.

1. `/speckit-specify` — what and why. Zero technology in the output. If the user's description
   contains technology, strip it and note where it went (it belongs in `plan.md`). This also creates
   and checks out a branch `<NNN>-<short-name>`.
2. `/speckit-clarify` — surfaces ambiguities. Never skip because the spec "feels clear". Push on
   anything that would change the data model: cardinality, optionality, ordering, time handling.
3. `/speckit-plan` — technology decisions. Constrained by `.claude/rules/tech-defaults.md`; anything
   that conflicts with the locked stack needs an explicit reason, not a silent substitution.
4. `/speckit-tasks` — half-day to one-day tasks. A task you cannot state in one sentence is two.
5. `/speckit-analyze` — cross-check spec, plan, and tasks before any code exists.

Commit the files under `specs/<NNN>-<short-name>/`, then merge that branch to `main` before
implementation starts — see the branch strategy in `.claude/rules/workflow.md`.

## Stage 2 — Design

The design system already exists. A **feature** module consumes its tokens — colour, spacing, type
scale — and does not introduce competing ones. Replacing that layer is permitted only in an iteration
whose entire subject *is* the token layer, which restyles every existing surface at once; see
`.claude/rules/design.md`. If a module seems to need a new token, that is a signal about the token
layer, not a licence to extend it locally.

Export from claude.ai/design into `design/<feature>/`. Then walk each screen against the acceptance
criteria in `spec.md`. Any field visible in a design but absent from the spec means one of the two is
wrong; resolve it now, in the spec, not later in code.

## Stage 3 — Load

Turn `tasks.md` into GitLab issues on the board. One issue per task, in build order:
data model → API → frontend client → UI → the module's one core capability.

`/speckit-taskstoissues` does not help here — it is GitHub-only and aborts on a GitLab remote. Use
`glab issue create` or the GitLab UI.

## Scope discipline

Constitution principle III: each module ships CRUD plus exactly one capability that makes it worth
using. Travel Map's is the world map itself. Content Calendar's is the status pipeline view. Anything
beyond that becomes input for the iteration after this one — write it down, do not build it.

Read the module list out of `.specify/memory/constitution.md` rather than from here. It was rewritten
once already, at the 2.0.0 pivot, and a copy in a skill file is exactly the kind of artifact that
drifts unnoticed — see the drift trap in `.claude/memory.md`.
