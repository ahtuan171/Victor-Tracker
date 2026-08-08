# Specification Quality Checklist: Pixel-Arcade Presentation Layer

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
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

**FR-027 is closed (2026-08-06): the strip carries real information.** It was the only element of the
reference direction whose *purpose* was undecided, and the two readings led to different
specifications rather than to different styling — which is why it was marked rather than guessed. No
default was safe: guessing "decorative" and being wrong ships a status surface nobody specified, and
guessing "informational" and being wrong adds a data dependency to a presentation iteration.

The owner's answer turns it into a status surface, so FR-027 became five requirements
(FR-027…FR-031) plus SC-012 and SC-013. The one worth watching in planning is **FR-028**: the strip
and the existing overdue count must be two presentations of **one** value. Two independent readings
of the same fact is how a product comes to contradict itself on its own screen, and the header count
already has non-obvious rules about when it narrows and when it does not.

**On implementation detail**: the specification names four measurements — 375px, 44px, and (from the
2026-08-06 clarification) the 16px and 12px text floors. All are kept deliberately. None is a
technology choice: they are product constraints, and the constitution states 375px as the number
rather than as a device name precisely so it cannot drift under a tooling change. The text floors
earn the same treatment for the same reason — they exist to be checked, and "legible" cannot be.

**On entities — this changed on 2026-08-06 and the change is the point.** The spec was written
asserting that the iteration creates no records at all. The owner then chose to remember the
presentation and sound choices **against the account** rather than the device, so two preferences now
persist beyond a single browser. That is new stored data in an iteration whose Input description says
there is none, and both the Clarifications entry and Key Entities say so in those words rather than
quietly re-scoping the sentence. The Input description is left verbatim as the record of what was
asked for; Key Entities is what a reader must obey.

**Two consequences to carry into planning**, because both are cheaper to notice now than at task 20:

- **FR-013a is the hard one.** A choice stored against the account is not knowable at the first
  moment a screen is painted, and FR-013 forbids showing the wrong presentation even briefly. The
  device therefore has to be able to answer the question alone and be corrected afterwards without a
  visible flip — and FR-013b adds the case where no account exists yet at all.
- **FR-028's "one value, two presentations"** meets a header count that already has non-obvious rules
  about when it narrows with a filter and when it does not. Two independent readings of one fact is
  how a screen comes to contradict itself.
