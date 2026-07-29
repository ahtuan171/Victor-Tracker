---
name: new-feature
description: Start a new CreatorHub module iteration — drives the Plan and Design stages (1-3 of 8) for a feature like Growth Tracker, Media Kit Generator, or Deal Tracker. Use when beginning work on a module that has no spec yet, or when the user says they are starting the next version.
---

# Starting a new module iteration

Drives stages 1-3. Stop when GitLab issues exist; implementation is a separate session.

## Before anything

Confirm the previous iteration is actually closed:

- Is there a `docs/retro-NN.md` for it? If not, the Reflect stage was skipped — the lessons that
  should shape this spec are still in someone's head. Say so and offer to write it first.
- Does `constitution.md` need an amendment from that retro? Reflect is the only stage where it
  changes; if it was going to change, it changes now, before the new spec is written.

## Stage 1 — Plan

Run in order, do not skip:

1. `/speckit.specify` — what and why. Zero technology in the output. If the user's description
   contains technology, strip it and note where it went (it belongs in `plan.md`).
2. `/speckit.clarify` — surfaces ambiguities. Never skip because the spec "feels clear". Push on
   anything that would change the data model: cardinality, optionality, ordering, time handling.
3. `/speckit.plan` — technology decisions. Constrained by `.claude/rules/tech-defaults.md`; anything
   that conflicts with the locked stack needs an explicit reason, not a silent substitution.
4. `/speckit.tasks` — half-day to one-day tasks. A task you cannot state in one sentence is two.
5. `/speckit.analyze` — cross-check spec, plan, and tasks before any code exists.

Commit all four files under `specs/<feature>/` before proceeding.

## Stage 2 — Design

The design system already exists from Content Calendar. This module consumes its tokens — colour,
spacing, type scale — and does not introduce competing ones.

Export from claude.ai/design into `design/<feature>/`. Then walk each screen against the acceptance
criteria in `spec.md`. Any field visible in a design but absent from the spec means one of the two is
wrong; resolve it now, in the spec, not later in code.

## Stage 3 — Load

Turn `tasks.md` into GitLab issues on the board. One issue per task, in build order:
data model → API → frontend client → UI → the module's one core capability.

## Scope discipline

Constitution principle III: each module ships CRUD plus exactly one capability that makes it worth
using. Growth Tracker's is the trend chart. Media Kit's is the generated document. Deal Tracker's is
the payment-status pipeline. Anything beyond that becomes input for the iteration after this one —
write it down, do not build it.
