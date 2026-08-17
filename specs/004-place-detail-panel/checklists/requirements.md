# Specification Quality Checklist: Opening a Place

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain — **2 remain, both deliberate; see Notes**
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Two `[NEEDS CLARIFICATION]` markers are open, and both are being left for `/speckit-clarify`
rather than guessed.** Neither has a defensible default:

1. **User Story 6, scenario 4 — does an unfilled field block a status change?** This is the one
   marker that matters, because it **collides with a ratified requirement**. `003`'s FR-028 guarantees
   any status is reachable from any other at any time with no validation, and it has its own
   clarification session behind it. If moving to Planned *refuses* without dates, that guarantee is
   narrowed — which is a specification amendment with a stated reason, never a side effect of a form
   deciding what it needs. FR-020 in this spec is the guard that keeps the question open rather than
   letting the implementation answer it.

2. **Edge Cases — one layout or two?** The owner's reference material is a wide screen showing map and
   detail side by side; this product's design rule makes the narrow layout the hard requirement and
   anything wider an enhancement. Shipping one presentation at every width is defensible and cheaper;
   shipping a distinct wide layout is what the reference shows. It changes the size of the iteration,
   so it is a scope question, not a styling one.

**No third marker was spent** on the "impressions" question — whether it means a new field or the note
a place already carries. It was resolved in Clarifications instead, because a reasonable default
exists and it is strong: a second free-text box beside the first, with no rule for which one anything
goes in, is worse than either alone.

**Content-quality note.** The spec names no technology anywhere — not the mapping library, not the
storage of photographs, not the shape of any request. "Bring the map to the place" and "confirmation
step" are user-facing behaviours; how either is achieved belongs in `plan.md`.
