<!--
Sync Impact Report
==================
Version change: 2.0.0 → 2.1.0
Bump rationale: MINOR. The Scope Constraints section's exclusion list is narrowed — route planning
  and trip budgeting move from "out of scope" to permitted — which is materially expanded guidance,
  not a redefinition or removal of any Core Principle. No principle changed.

Principles modified: none.
Principles unchanged: I, II, III, IV, V, VI, VII.

Sections replaced: Scope Constraints — the exclusion paragraph now permits route planning and trip
  budgeting/expenses, states why, and keeps automatic location capture (and the two exclusions
  nothing in the current input spec requests) forbidden without a further amendment.
Sections added: none.
Sections removed: none.

Reasoning for this amendment: the owner decided on 2026-08-11 that the "Victor Tracker" input spec
  (`drafts/travel-tracker.spec.draft.md`) needs both capabilities — its §8 (Route) and its
  §1/§9/§10/§13 (Budget) — rather than have them stripped from an owner-reviewed, already-scoped-down
  draft to fit an exclusion list written before that draft existed. Automatic location capture is not
  requested anywhere in the draft, so it is unaffected and remains forbidden. Recorded in
  `.claude/memory.md`'s Deferred section, trigger condition (002-pixel-arcade-skin's T047 closing)
  satisfied 2026-08-13 with the `v0.2.0` tag.

Deferred TODOs: none. All placeholder tokens remain replaced.

Note on the project name: the brand text is "VictorHub" as of 2026-08-08. The repository path, the
GitLab project, both deploy targets and the GitHub mirror still say "creator-hub" — renaming those
touches the project path, the git remotes, the mirror URL and two deployed services, so that part is
tracked as a separate manual pass in `.claude/memory.md` rather than done here.
-->

# VictorHub Constitution

## Core Principles

### I. Mobile-First, Thumb-First

The owner uses this on a phone, one-handed, away from a desk. Every screen MUST be designed at
phone width first and MUST be fully usable there; desktop is an enhancement, never the baseline.
The page body MUST NOT scroll horizontally at 375px — wide content such as calendar grids and world
maps scrolls, pans, or zooms inside its own container. Primary actions MUST sit within thumb reach.
A feature that works only on desktop is not done.

Rationale: the moments when this product earns its place — pinning somewhere on the way home from
it, adding a place to the list mid-conversation — happen away from a desk.

### II. Personal Data Is Private By Default

Where a person has been, when they were there, and the photographs they took are the most sensitive
data this product has ever held. A location history is a pattern of life; it is not recoverable once
disclosed.

- No endpoint MAY return data belonging to another user.
- Stored photographs MUST NOT be reachable without an explicit, expiring grant. A publicly readable
  object store bucket is prohibited: it turns the entire archive into guessable URLs.
- No analytics, telemetry, or third-party script MAY be given access to entity data.
- **No third-party request MAY carry entity data.** This binds map tiles specifically: a tile request
  MUST NOT contain a place name, a pin label, a note, a photograph, or any identifier of a stored
  record. Tile requests necessarily disclose viewport coordinates to the tile provider; that
  disclosure MUST be stated in `plan.md` rather than left implicit.
- Anything intended to be publicly shareable MUST be an explicit per-resource opt-in carrying its own
  access token, and MUST NOT become reachable as a side effect of an existing endpoint.

### III. One Core Capability Per Module

Each module ships CRUD plus exactly one capability that makes it worth using, and nothing else.
Travel Map's is the world map itself. Content Calendar's is the status pipeline view. A proposed
feature absent from the current `spec.md` MUST NOT be built in the current iteration; it is recorded
as input for the next one.

Rationale: this project's defining risk is scope sprawl across attractive adjacent ideas, which
produces several half-built surfaces instead of one that works. The rule survived the pivot
unchanged because the pivot is exactly the pressure it exists to resist.

### IV. The Spec Is The Source Of Truth

`spec.md` describes what and why and MUST contain no technology decisions; those belong in
`plan.md`. When code and spec disagree, work MUST stop until it is decided which one is wrong, and
the resolution MUST be stated explicitly in the merge request. Coding around the gap is prohibited.
Design work that implies a new data field REQUIRES a spec amendment before implementation.

### V. Working And Deployed Beats Polished And Local

A rough screen running in production is worth more than a refined one on localhost. Visual polish is
deferred to a dedicated pass after the pipeline runs end to end. This principle licenses skipping
decoration only. It MUST NOT be invoked to skip tests, responsive behaviour, focus states, or
confirmation on destructive actions — those are structural and cost more to retrofit than to build.

### VI. Merges Are Gated, Not Trusted

`main` is protected. Every change MUST arrive by merge request with lint, type-check, and tests
passing. This holds when working solo; the gate exists to catch the author, not a hypothetical
teammate. Failing tests MUST block merge, including on one's own merge requests.

### VII. Build For One User Until There Is A Second

This product serves a single person. Multi-tenancy, roles, organization entities, and speculative
owner columns MUST NOT be added in anticipation of future users. Multi-user support becomes a real
migration when a real second user exists.

Rationale: speculative multi-tenancy taxes every query and migration for a requirement that may
never arrive in the form imagined.

## Scope Constraints

**v0.2 delivers the Travel Map only.** A world map recording places visited and places wanted, each
visited place opening the photographs and notes kept against it.

**Content Calendar, shipped at v0.1, is retained unchanged as a secondary scheduling surface** and
moves behind the navigation drawer. Retargeting its `content_item` entity from content pipeline to
trip itinerary is a separate iteration with its own `spec.md`; it MUST NOT be attempted as a side
effect of building the map.

The technology stack is fixed and recorded in `.claude/rules/tech-defaults.md`: FastAPI on
Python 3.13 with `uv`, SQLModel and Alembic over PostgreSQL, Next.js App Router with TypeScript,
Tailwind, and shadcn/ui, MapLibre GL JS for the map, Cloudflare R2 for object storage, JWT
authentication for a single seeded user, GitLab CI, and deployment to Render and Vercel.
Substituting any of these REQUIRES an explicit stated reason in `plan.md`, never a silent change.

**Media file upload and storage, excluded at v0.1, is in scope from v0.2** — photographs are the
substance of a memory, not an attachment to it. It arrives through object storage under the
constraints principle II places on it, never as bytes in the database and never through a public
bucket.

**Route planning and trip budgeting/expenses are in scope for v0.2, permitted at the 2.1.0 amendment
(2026-08-13).** The "Victor Tracker" input spec (`drafts/travel-tracker.spec.draft.md`) needs both —
its §8 (Route) and its §1/§9/§10/§13 (Budget) — and the owner decided to amend the exclusion list
rather than strip owner-reviewed, already-scoped-down requirements from the draft to fit it. Neither
capability is exempt from the rest of this document: each still enters through the ordinary stage-1
process — `/speckit-specify` against the draft, `/speckit-clarify` for its open questions (a geocoding
provider is the one most likely to block early), and a `plan.md` naming their technology — and each
remains subject to principle II if it touches location or cost data tied to a place.

Out of scope for v0.2: automatic location capture from the device — no GPS, no background tracking,
no check-in; every pin is placed deliberately by hand. This exclusion is unchanged by the amendment
above: nothing in the "Victor Tracker" draft requests it, and it remains the feature principle II most
clearly forbids adding casually, so naming it first here is deliberate. Also still out of scope: any
public or shared view of the map, and integration with any social platform — neither is requested by
the current input spec either, and either would need its own amendment, stated with its own reasoning,
before being built.

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
`reviewer` agent defined in `.claude/agents/reviewer.md` performs this check, with principles II,
III, IV, and VII as the recurring offenders. Principle II joins that list at v0.2: the product now
holds location and photographic data, so a privacy regression is both easier to introduce and
harder to reverse than it was at v0.1. A constitution conflict found during `/speckit-analyze` is
CRITICAL and MUST be resolved by adjusting the spec, plan, or tasks — never by diluting,
reinterpreting, or silently ignoring the principle.

**Version**: 2.1.0 | **Ratified**: 2026-07-30 | **Last Amended**: 2026-08-13
