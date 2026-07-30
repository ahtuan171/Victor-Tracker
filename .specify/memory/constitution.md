<!--
Sync Impact Report
==================
Version change: (template, unversioned) → 1.0.0
Bump rationale: MINOR-type content on an initial ratification collapses to 1.0.0 — first
  concrete adoption of the constitution, replacing the unfilled template.

Principles defined (all new, template placeholders replaced):
  [PRINCIPLE_1_NAME] → I. Mobile-First, Thumb-First
  [PRINCIPLE_2_NAME] → II. Creator Data Is Private By Default
  [PRINCIPLE_3_NAME] → III. One Core Capability Per Module
  [PRINCIPLE_4_NAME] → IV. The Spec Is The Source Of Truth
  [PRINCIPLE_5_NAME] → V. Working And Deployed Beats Polished And Local
  (added beyond template) → VI. Merges Are Gated, Not Trusted
  (added beyond template) → VII. Build For One User Until There Is A Second

Sections filled:
  [SECTION_2_NAME]   → Scope Constraints
  [SECTION_3_NAME]   → Development Workflow
  Governance         → amendment procedure, versioning policy, compliance review

Removed sections: none.
Deferred TODOs: none. All placeholder tokens replaced.
-->

# CreatorHub Constitution

## Core Principles

### I. Mobile-First, Thumb-First

The creator uses this on a phone, one-handed, between shoots. Every screen MUST be designed at
phone width first and MUST be fully usable there; desktop is an enhancement, never the baseline.
The page body MUST NOT scroll horizontally at 375px — wide content such as calendar grids scrolls
inside its own container. Primary actions MUST sit within thumb reach. A feature that works only on
desktop is not done.

Rationale: the moments when this product earns its place — capturing an idea mid-conversation,
checking the week's plan before filming — happen away from a desk.

### II. Creator Data Is Private By Default

Follower counts, revenue, brand deals, and unpublished content ideas are commercially sensitive.
No endpoint MAY return data belonging to another user. No analytics, telemetry, or third-party
script MAY be given access to entity data. Anything intended to be publicly shareable — media kit
pages in a later iteration — MUST be an explicit per-resource opt-in carrying its own access token,
and MUST NOT become reachable as a side effect of an existing endpoint.

### III. One Core Capability Per Module

Each module ships CRUD plus exactly one capability that makes it worth using, and nothing else.
Content Calendar's is the status pipeline view. Growth Tracker's is the trend chart. Media Kit's is
the generated document. Deal Tracker's is the payment-status pipeline. A proposed feature absent
from the current `spec.md` MUST NOT be built in the current iteration; it is recorded as input for
the next one.

Rationale: this project's defining risk is scope sprawl across four attractive modules, which
produces four half-built ones.

### IV. The Spec Is The Source Of Truth

`spec.md` describes what and why and MUST contain no technology decisions; those belong in
`plan.md`. When code and spec disagree, work MUST stop until it is decided which one is wrong, and
the resolution MUST be stated explicitly in the merge request. Coding around the gap is prohibited.
Design work that implies a new data field REQUIRES a spec amendment before implementation.

### V. Working And Deployed Beats Polished And Local

At v0.1, a rough screen running in production is worth more than a refined one on localhost. Visual
polish is deferred to a dedicated pass after the pipeline runs end to end. This principle licenses
skipping decoration only. It MUST NOT be invoked to skip tests, responsive behaviour, focus states,
or confirmation on destructive actions — those are structural and cost more to retrofit than to
build.

### VI. Merges Are Gated, Not Trusted

`main` is protected. Every change MUST arrive by merge request with lint, type-check, and tests
passing. This holds when working solo; the gate exists to catch the author, not a hypothetical
teammate. Failing tests MUST block merge, including on one's own merge requests.

### VII. Build For One User Until There Is A Second

v0.1 serves a single creator. Multi-tenancy, roles, organization entities, and speculative owner
columns MUST NOT be added in anticipation of future users. Multi-user support becomes a real
migration when a real second user exists.

Rationale: speculative multi-tenancy taxes every query and migration for a requirement that may
never arrive in the form imagined.

## Scope Constraints

**v0.1 delivers Content Calendar only.** Growth Tracker, Media Kit Generator, and Deal/Collab
Tracker are separate iterations, each restarting the full workflow with its own `spec.md` against
this constitution.

The technology stack is fixed for v0.1 and recorded in `.claude/rules/tech-defaults.md`: FastAPI on
Python 3.13 with `uv`, SQLModel and Alembic over PostgreSQL, Next.js App Router with TypeScript,
Tailwind, and shadcn/ui, JWT authentication for a single seeded user, GitLab CI, and deployment to
Render and Vercel. Substituting any of these REQUIRES an explicit stated reason in `plan.md`, never
a silent change.

Out of scope for v0.1: TikTok, Instagram, and YouTube API integrations; media file upload or
storage; recurring or templated content series; notifications; and collaboration of any kind.

## Development Workflow

Each iteration runs eight stages: plan, design, load, implement, test, review, ship, reflect.
The detailed procedure is maintained in `.claude/rules/workflow.md`.

Stage 1 uses SpecKit in order: `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`,
`/speckit-tasks`, `/speckit-analyze`. `/speckit-clarify` MUST NOT be skipped on the grounds that a
spec "feels clear"; the ambiguities it surfaces are precisely those otherwise discovered
mid-implementation. Planning artifacts MUST be committed before any application code is written.

Tasks are sized at half a day to one day. Commits are atomic and reference their issue. No
abstraction is introduced before a second caller exists. All repository content — documentation,
specifications, commit messages, comments, and identifiers — is written in English.

Stage 6 re-runs `/speckit-analyze` before merge to catch specification drift. Stage 8 produces
`docs/retro-NN.md` comparing shipped behaviour against the acceptance criteria in `spec.md`,
item by item.

## Governance

This constitution supersedes conflicting practices, conventions, and convenience. Where a rule file
under `.claude/rules/` conflicts with this document, this document prevails and the rule file MUST
be corrected.

**Amendment procedure.** Amendments occur only in the Reflect stage, via `/speckit-constitution`,
and never mid-implementation to justify a shortcut already taken. Every amendment MUST record its
version change and rationale in the Sync Impact Report at the top of this file.

**Versioning policy.** Semantic versioning applies. MAJOR for backward-incompatible principle
removals or redefinitions. MINOR for a new principle or materially expanded guidance. PATCH for
clarifications and wording that do not change meaning.

**Compliance review.** Every merge request is checked against these principles before it lands; the
`reviewer` agent defined in `.claude/agents/reviewer.md` performs this check, with principles III,
IV, and VII as the recurring offenders. A constitution conflict found during `/speckit-analyze` is
CRITICAL and MUST be resolved by adjusting the spec, plan, or tasks — never by diluting,
reinterpreting, or silently ignoring the principle.

**Version**: 1.0.0 | **Ratified**: 2026-07-30 | **Last Amended**: 2026-07-30
