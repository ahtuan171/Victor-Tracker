# Data model — Pixel-Arcade Presentation Layer

**This iteration adds two columns to one existing table and nothing else.** No new table, no new
entity, no change to `content_item`. If a task in this iteration proposes a third column, it is
building something the spec does not describe.

The spec's Input description says this iteration adds no records at all. **That was superseded on
2026-08-06** when the owner chose to remember the presentation and sound choices against the account
rather than the device. Key Entities in `spec.md` says so in those words; this file is the schema
consequence.

---

## The change

`creator` — the single-row table that exists so a password hash has somewhere to live — gains two
columns:

| Column | Type | Null | Default | Source |
|---|---|---|---|---|
| `theme` | `theme` (enum: `dark`, `light`) | `NOT NULL` | `'dark'` | FR-010, FR-011, FR-012 |
| `sound_enabled` | `boolean` | `NOT NULL` | `false` | FR-020, FR-022 |

`content_item` is **untouched**. So is every existing column on `creator`.

### Why both are `NOT NULL` with a default, rather than nullable

The spec says each preference is "absent until chosen", and absent means dark / off. A nullable column
would represent that absence literally. It is still the wrong choice, and the reasoning is worth
writing down because "the spec said absent" is a good argument for the other answer:

**Nothing in the product ever needs to distinguish "never chosen" from "chosen, and happens to be the
default."** FR-012 asks only that the presentation be dark before any choice; FR-020 asks only that
there be no sound before any choice. Both are satisfied by the default value. A nullable column would
add a third state that no requirement reads, every query would carry a coalesce, and the first time
someone forgot one the product would decide the theme from `null` — which renders as neither.

If a later iteration ever needs "has this person ever chosen?", that is a new fact and gets its own
column. Guessing at it now is the speculative infrastructure principle VII names.

### Why `theme` is a Postgres enum and not a `VARCHAR` with a `CHECK`

Consistency with `content_item.status` and `content_item.platform`, which are both enums, and with the
migration conventions already established. It also means the two-value domain is enforced by the type
rather than by a constraint someone can drop.

**Two traps come with that, both already recorded in `backend/AGENTS.md` and both live here:**

1. **A SQLAlchemy enum column stores the Python member *names* by default** — `Theme.DARK` would
   persist as `DARK` while the contract, the cookie and the frontend all say `dark`. Pass
   `values_callable=lambda e: [m.value for m in e]`. It surfaces only against a real database.
2. **Alembic's generated `downgrade` does not drop an enum type it implicitly created.** The second
   `upgrade` then fails with "type theme already exists". Create and drop the type explicitly with
   `postgresql.ENUM(..., create_type=False)` and run `upgrade → downgrade base → upgrade` on this
   revision before merging it.

### `alembic check` after the revision

The new columns must be declared on the `Creator` model **and** written into the migration. Indexes
and constraints declared in only one place are what `alembic check` catches, and the check must come
back clean before the task is done.

---

## What this does *not* add

Listed because each is one small step away and each would be a different product decision:

- **No `preferences` table.** Two columns on the one row that already exists is the whole need. A
  table implies rows per person, which is principle VII's speculative multi-tenancy wearing a
  different hat.
- **No owner column anywhere.** `content_item` still has none, `test_schema.py` still asserts that,
  and this iteration must not weaken that assertion. What `test_schema.py` *does* need is amending —
  its allowlist of `creator` columns grows by two, and the point of the allowlist is that it is
  exhaustive rather than plausible.
- **No `updated_at` on the preferences.** Nothing reads when a preference changed. Last write wins,
  as it does everywhere else in this product (FR-023a of 001, constitution VII): the only person who
  can overwrite this owner is the same owner on another device.
- **No history, no audit trail.** A theme toggle is not an event worth keeping.

---

## The cookie is not part of the data model

`ch_theme` holds a copy of `theme` so the server can pick a presentation before the document is
written (R-002). It is a **cache with a stated staleness window**, not a source of truth:

- The database row is authoritative. The cookie is corrected from it at sign-in and once per app
  mount.
- It holds one of two words and **no identifier of any kind**. It is not a credential and is
  deliberately not `httpOnly`, because the client writes it on every toggle.
- Its accepted weakness — a theme changed on another device is stale on this one until its next load
  — is stated in R-002 and in the spec's edge cases, not hidden here.

---

## Invariants

Two, and both are narrow enough to be checked in one test each.

- **INV-1**: `creator` holds exactly one row, and this iteration does not change that. The preference
  operations read and write **the authenticated account's own row** and take no id from the request.
- **INV-2**: `content_item` is byte-for-byte the same shape after this iteration as before it. The
  existing `test_schema.py` assertions about absent owner columns and the absence of a third table
  must still pass **unmodified** — a failure there means this iteration changed something it has no
  business changing.
