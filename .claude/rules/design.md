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
- Content Calendar establishes the tokens — colour, spacing, type scale — for all four modules.
  Later modules consume them; they do not introduce competing ones.

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
