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

_(empty — the export does not exist yet)_
