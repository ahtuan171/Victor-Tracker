# Spidey — mascot system

Pixel-art SVG, transparent background, `shape-rendering="crispEdges"`. 32x18 pixel grid, exported at 4x (128x72).
Scales cleanly: use `width="30"` inline in headings, `width="128"` as a standalone figure.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| red | `#FF1F35` | body, accents, links |
| dark red | `#A81222` | body shading, leg tips, secondary badges |
| black | `#0B0D10` | page/card background, eyes |
| grey | `#2A2D34` | props (laptop screen), z's, steam |
| cream | `#F5F2E8` | body text, eye highlight, silk |

## States and where they go

| State | File | README section |
| --- | --- | --- |
| awake | `spidey-awake.svg` | stack · banner · divider |
| coffee | `spidey-coffee.svg` | about |
| web-shoot | `spidey-web-shoot.svg` | projects |
| thinking | `spidey-thinking.svg` | numbers / stats |
| hanging | `spidey-hanging.svg` | contribution graph · footer |
| coding | `spidey-coding.svg` | currently working on |
| success | `spidey-success.svg` | recently shipped |
| confused | `spidey-confused.svg` | currently stuck on |
| error | `spidey-error.svg` | build failures, CI badges, 404 pages |
| asleep | `spidey-asleep.svg` | off the clock |

## Rules

- One state per section, never two in the same heading.
- The eye highlight tells you where Spidey is looking — move it, don't rotate the head.
- Legs: always 3 per side. Down = resting, up = hanging or celebrating.
- Never recolor the eyes. Black with a cream highlight is the whole character.
- Below 24px the props (laptop, mug) stop reading — use `awake` or `asleep` at those sizes.

## Animation

These are static SVGs. Inline `<style>` and SMIL are stripped by this project's file pipeline, so animation has to come from elsewhere:

- **remote services** — the typing line, contribution snake and stats cards already animate/refresh server-side.
- **GIF** — the sprites are 32x18 pixel art, so a 2-4 frame idle blink or typing loop exports tiny. Ask for frame variants and drop them into any GIF encoder.
- **hand-added SMIL** — after pushing, edit the SVG on GitHub and add `<animateTransform>`; GitHub renders it natively.
