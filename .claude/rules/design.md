# Design rules

## Mobile-first is a hard constraint, not a preference

The creator uses this on a phone, one-handed, between shoots. Every screen is designed at phone
width first and must be fully usable there. Desktop is an enhancement.

- The page body never scrolls horizontally at 375px. Wide content (calendar grids, tables) scrolls
  inside its own container.
- Primary actions sit within thumb reach — bottom half of the screen, not a top-right toolbar.
- Destructive actions require confirmation and are never a single tap away from a common gesture.

## Design system comes from Claude Design

- Components are exported from claude.ai/design into `design/<feature>/`, then adapted into
  `frontend/`. The export is the starting point, not a drop-in.
- shadcn/ui provides the component base. Prefer extending a shadcn primitive over hand-rolling one.
- Content Calendar established the tokens — colour, spacing, type scale — and they are now the
  project's, not that module's. A new module's design stage is far cheaper than the first one was
  precisely because it inherits them.

### The token layer may change; a feature module may not change it

**The rule this replaces read "Later modules consume them; they do not introduce competing ones",
and read literally it froze the presentation layer forever.** That was never what it protected. The
thing it forbids is **a feature module growing a second, parallel set of tokens** — because then the
product carries two visual languages at once, every later module has to pick one, and neither is the
project's.

Stated in the form that survives a re-skin:

- **A module iteration MUST consume the token layer as it finds it.** It may not introduce a token,
  a font, a border treatment or a colour that competes with one already there. If a module seems to
  need one, that is a signal about the token layer, not a licence to extend it locally.
- **The token layer MAY be replaced outright — but only in an iteration whose entire subject *is*
  the token layer**, touching every existing surface in the same iteration so the product is never
  two products joined together. `002-pixel-arcade-skin` is exactly that iteration, and it is the
  only kind permitted to do it.
- **A presentation change is never a side effect of building a feature.** The moment a re-skin rides
  along inside a feature branch, the product spends that whole branch in two languages and invites
  the next feature to start a third.

The load-bearing half of this rule is the reason, not the conclusion: **one language at a time,
across the whole product**. Any change that keeps that true is allowed; any change that breaks it is
not, whichever direction it comes from.

## Status must be readable at a glance

The pipeline (idea → draft → posted) is the product's core value. In calendar and backlog views,
an item's status is distinguishable without reading text and without opening it. Colour alone is not
sufficient — pair it with shape, weight, or icon so it survives colourblindness and glare.

## Polish is deferred, structure is not

At v0.1 a rough screen in production beats a refined one on localhost. That licenses skipping
decoration — not skipping responsive behaviour, focus states, or confirmation on destructive actions.
Those are structural and cost more to retrofit than to build.

## Design changes that touch data

If a screen needs a field the spec does not describe, amend `spec.md` before building it. A new field
is a product decision wearing a visual costume.
