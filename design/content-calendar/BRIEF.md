# Stage 2 design brief — Content Calendar

The input to the Claude Design export, and the checklist the export must pass before any of it reaches
`frontend/`. Written before the export exists so the audit is mechanical rather than improvised.

The export itself lands in this directory alongside screenshots. It is a **starting point, not a
drop-in** (`.claude/rules/design.md`).

> Content Calendar establishes the colour, spacing, and type tokens for **all four** CreatorHub
> modules. Later modules consume these; they do not introduce competing ones. Decisions here are
> effectively project-wide.

---

## Hard constraints

Not preferences. Each traces to a ratified requirement, and a design that breaks one is rework.

| Constraint | Source |
|---|---|
| Designed at **375px** first and fully usable there. The page body **never** scrolls horizontally — wide content scrolls inside its own container. | constitution I, FR-021, SC-003 |
| Primary actions sit in the **bottom half** of the screen, within one-handed thumb reach. Not a top-right toolbar. | constitution I, FR-022 |
| Status is readable **without colour**. Encoded by shape *and* fill, verifiable in a greyscale screenshot. | FR-017, SC-004, research.md R-005 |
| Focus states on every interactive element, and confirmation on destructive actions. These are **structural**, explicitly not covered by "polish is deferred". | constitution V, FR-020, T056, T067 |
| **No time of day** anywhere — not asked for, not stored, not displayed. Dates are calendar days. | FR-012a, research.md R-006 |

### The status cue is already fixed

Locked by research.md R-005. The export may re-skin the palette; it may **not** change the encoding.

| Status | Shape | Fill | Colour (decorative only) |
|---|---|---|---|
| `idea` | circle | outline only | neutral |
| `draft` | circle | half-filled | amber |
| `posted` | circle | solid, with check | green |

Outline → half → solid reads as pipeline progress in greyscale, which is exactly what SC-004 tests.

- **Overdue** (an `idea` or `draft` whose date has passed) is a **left border** — orthogonal to status,
  not a fourth state. Keeps FR-007's three-state pipeline honest.
- **Platform** is a monogram badge — **T / I / Y** — not brand logos. Logos are trademarked, vary in
  legibility at 16px, and would need bundling; a monogram is a text node.

---

## Surfaces to design

Three routes and three overlays. Exactly this list — anything else is a fifth module wearing a costume.

| Surface | Shape it must have | Task |
|---|---|---|
| **Login** | Single form. The only screen reachable unauthenticated. | T025 |
| **Month grid** + day cell | Seven-column grid over the **six-week** span the month view displays, including adjacent-month days. Overflow in a cell is a **remainder count that stays reachable** — not a clipped list. | T042 |
| **Week view** | Seven **vertical sections**, one per day. Explicitly **not** seven columns — columns cannot hold a readable chip at 375px. | T043 |
| **Item chip** | Title + status cue + platform cue, at a size that fits a 375px day cell. Used in the grid **and** in the backlog drawer. | T040, T041 |
| **Capture sheet** | Bottom-anchored overlay, **one** field: title. Reachable in ≤3 interactions from landing. | T034 |
| **Item sheet** | The single editing surface. Carries **title, hook, platform, date, status, published link** — all six. The platform control sits adjacent to the status control so a refusal is resolvable without leaving the sheet. | T052, T053 |
| **Backlog drawer** | A **drawer on the calendar surface**, with a collapsed peek strip and an expanded state. **Not a route** — a DOM node cannot be dragged between routes, which is what made the original two-route design unable to satisfy SC-008. | T035 |
| **Period nav** | Month/week toggle + adjacent-period controls, in thumb reach. | T044 |
| **Platform filter** | Narrows grid and drawer alike. In thumb reach. Needs a filtered empty state that **names the active filter**. | T061, T062 |
| **Delete confirm** | Placed so no single tap and no common navigation gesture can trigger deletion. | T056 |

Also needed: a first-run empty state for an account with zero items (T068).

### Two interactions that are already decided

- **Drag is for dates only.** Drop targets are day cells and the backlog drawer. Do not design status
  lanes — status changes are **tap-only**. Lanes were cut because they are a second core capability
  (constitution III) and no 375px layout holds them beside a month grid (FR-021).
- **The URL never changes** during the whole capture → advance → posted journey. Everything is an
  overlay on `/calendar`.

---

## Data-shape audit — run this before adapting anything into `frontend/`

Constitution IV: *design work that implies a new data field REQUIRES a spec amendment before
implementation.* So this audit happens **before T034**, not before T038. A design implying a new field
is cheap to resolve now and expensive once the item sheet is built.

**Every control in the export must map to exactly one of these six editable fields:**

`title` · `hook` · `platform` · `scheduled_date` · `status` · `published_url`

(`id`, `created_at`, `updated_at` are system-managed and never edited.)

Anything that does not map is **a product decision wearing a visual costume**. It goes to
`.claude/memory.md` under Deferred, or becomes a `spec.md` amendment. It does **not** go into code.

These are the ones most likely to appear, each already rejected with a stated reason
(`data-model.md`, "Not present"):

| If the design shows… | It implies | Verdict |
|---|---|---|
| Drag handles / manual reordering in the backlog | `sort_order` | Rejected — backlog orders by `created_at DESC` |
| Tags, categories, labels, series | a new table | Not in spec. Out of scope for v0.1 |
| A time picker, or "9:00 AM" on a chip | `scheduled_time`, `timezone` | Forbidden by FR-012a |
| Two platform badges on one item | many-to-many | FR-010a — at most one platform per item |
| An archive or trash view | `deleted_at` | FR-004 is a hard delete |
| Priority, assignee, collaborator, avatar | owner columns | Constitution VII and FR-003 |
| A "last edited by" or conflict banner | `version` / `etag` | FR-023a is last-write-wins, silently |
| Attachments, thumbnails, media upload | file storage | Explicitly out of scope (constitution, Scope Constraints) |

**Write the result down even when it is clean.** An audit that found nothing and an audit that never
ran are indistinguishable unless the outcome is recorded. Append findings to the bottom of this file.

---

## Audit findings

**2026-08-01 — export received, audit run, result: CLEAN. No spec amendment required.**

Export: `CreatorHub-Content-Calendar.dc.html` (one Claude Design canvas, two turns — dark at `1a`–`1l`,
light counterpart at `2a`–`2l`). Pulled with `DesignSync get_file` from project
`32445b82-32e5-4ac4-86d3-4fcc885a5484` ("Thiết kế v0.1 hoàn thành") — **not** the empty
`CreatorHub Design System` project recorded in `CLAUDE.md`. `support.js` is the canvas runtime, kept
so the file renders offline.

### Coverage — all eleven surfaces present, at 375px

`Login` · `Month grid + day cell` · `Week view` · `Item chip` · `Capture sheet` · `Item sheet` ·
`Backlog drawer` · `Period nav` · `Platform filter` · `Delete confirm` · `First-run empty state`.

### Field mapping — every control maps to one of the six

The item sheet (`1g`) carries exactly: **Title · Hook · Status · Platform · Date · Published link**,
with the platform control adjacent to the status control as required. No seventh control exists on
any surface.

Each rejected field was searched for by pattern across the whole export:

| Checked for | Result |
|---|---|
| Time of day, clock icon, time picker, timezone | **Absent.** No `HH:MM`, no AM/PM, no clock glyph anywhere. |
| Tags, categories, labels, series, collections | **Absent.** The three "label" matches are the *type-scale token* `Label 13/600` and the canvas's own `data-screen-label` attribute. |
| Drag handles, manual reorder, `sort_order` | **Absent.** The drawer states "Undated ideas, newest first" — matches `created_at DESC`. |
| Two platform badges on one item | **Absent.** Every chip carries exactly one monogram, T/I/Y as text nodes. No platform logos. |
| Archive, trash, undo, `deleted_at` | **Absent as features.** The two "trash"/"undo" matches are the delete-confirm *copy*: "There is no trash and no undo" — which reinforces FR-004's hard delete rather than implying a soft one. |
| Priority, assignee, collaborator, avatar, owner | **Absent.** |
| Version history, "last edited by", conflict banner | **Absent.** Consistent with FR-023a last-write-wins. |
| Attachments, thumbnails, media upload | **Absent.** |
| Search | **Absent.** |
| Performance metrics, streaks, notifications | **Absent.** The single "metric" match is the word "geo**metric**" in the prompt echo. |

**One item examined and cleared rather than assumed:** the month-grid header shows `14 items` /
`3 overdue`, and the drawer shows `Backlog 6` / `2 of 6` under a filter. These are **derived counts
over the item list already fetched**, not stored fields and not performance metrics — nothing new to
persist, so no amendment. Recorded here so a later reader does not re-open the question.

### Locked encodings — preserved exactly

`idea` outline circle · `draft` half-filled circle · `posted` solid circle with check. Overdue is a
**4px dashed left border** (bone `#DCD3BE` dark / `#5C5240` light), deliberately dashed so it separates
from the solid brand red in both hue and greyscale, and it stays orthogonal to status rather than
becoming a fourth state.

### The acceptance test passes

`screenshot-month-grid-375-dark.png` and `screenshot-month-grid-375-greyscale.png` are the two
screenshots the prompt demanded, rendered from the export with Playwright at 375px. In the greyscale
one the outline → half → solid progression stays separable and the dashed overdue border still reads,
which is what SC-004 tests. The export also carries the greyscale panel as a first-class surface
(`1d`/`2d`), so the check is repeatable rather than a one-off.

Also confirmed structurally: six-week span including adjacent-month days; cell overflow is a
**`+2 more` remainder count**, not a clipped list; week view is seven **vertical sections**; primary
actions (`+ CAPTURE`, period nav, month/week toggle) sit in the **bottom band**; the filtered empty
state **names the filter** ("No YouTube items in March 2026" + "Clear YouTube filter"); delete confirm
puts **Keep** as the focused default with Delete as the lower, lighter-weight action.

### Consequences for `frontend/`

The token layer landed in `frontend/app/globals.css` at the same time as this audit, replacing the
provisional shadcn palette that file always described as stage-2 disposable. **The surfaces themselves
were deliberately not built** — each belongs to a task from T033 onward and is built there, from this
export. This file plus the `.dc.html` is what those tasks read.
