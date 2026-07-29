# CreatorHub Constitution (draft)

Principles that outlive any single feature. Every spec, plan, and merge request is checked against
these. Amend only in the Reflect stage, never mid-implementation to justify a shortcut.

## I. Mobile-first, thumb-first

The creator uses this between shoots, on a phone, one-handed. Every screen is designed at phone
width first and must remain fully usable there. Desktop is an enhancement, not the baseline.
A feature that only works well on desktop is not done.

## II. Creator data is private by default

Follower counts, revenue, brand deals, and unpublished content ideas are commercially sensitive.
No endpoint returns another user's data. No analytics, telemetry, or third-party script gets access
to entity data. Anything intended to be publicly shareable (media kit pages, later) is an explicit,
per-resource opt-in with its own access token — never a side effect of an existing endpoint.

## III. One core capability per module

Each module ships CRUD plus exactly one capability that makes it worth using, and nothing else.
Content Calendar's is the status pipeline view. Growth Tracker's is the trend chart. Media Kit's is
the generated document. If a proposed feature is not in the current `spec.md`, it does not get built
in the current iteration — it becomes input for the next one.

## IV. The spec is the source of truth

`spec.md` describes what and why, with no technology in it. `plan.md` holds technology decisions.
When code and spec disagree, stop and resolve which one is wrong; do not code around the gap.
Design work that implies a new data field requires a spec amendment first.

## V. Working and deployed beats polished and local

At v0.1, a rough screen running in production is worth more than a refined one running on localhost.
Visual polish is deferred to a dedicated pass after the pipeline runs end to end. This principle does
not license skipping tests — it licenses skipping decoration.

## VI. Merges are gated, not trusted

`main` is protected. Every change arrives by merge request with lint, type-check, and tests passing.
This holds even when working solo — the gate exists to catch the author, not a hypothetical teammate.

## VII. Build for one user until there is a second

v0.1 serves a single creator. No multi-tenancy, no roles, no organization entities, no "user_id"
columns added speculatively. Multi-user is a real migration when a real second user exists.
