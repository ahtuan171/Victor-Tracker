"""What the schema must *not* contain — INV-4 and constitution principle VII.

Every other test in this suite asserts that something works. This one asserts that something was
never built, which is a different job: the failure mode it guards against is not a bug but a
well-intentioned addition, made by someone who did not read `data-model.md` and had no reason to
suspect that an ordinary-looking foreign key was forbidden.

The constitution names principle VII as a recurring offender, and `data-model.md` says the guard is
"a test rather than a review note" for exactly that reason — a review note is advice, and advice is
what gets skipped at the end of a long branch.

Two layers, on purpose:

* **The pattern tests** name the forbidden vocabulary, so a failure says *which rule* was broken and
  points at the requirement. They are precise but not exhaustive.
* **The allowlist test** asserts the exact column set from `data-model.md`. It is exhaustive but
  says only "this column should not exist". It is what catches an owner column named something the
  patterns never anticipated.

Neither is redundant. T019 originally specified the patterns alone, and writing them exposed the
hole the allowlist now closes: `%user%`, `%owner%`, and `%tenant%` are the generic vocabulary of
multi-tenancy, but the owner entity in this schema is called `creator` — so `creator_id`, the single
column this project would plausibly add, matched none of them. `data-model.md`'s INV-4 was amended
in the same change rather than the test quietly covering more than the spec asked for.
"""

import pytest
from sqlalchemy import inspect
from sqlmodel import Session

CONTENT_ITEM_COLUMNS = {
    "id",
    "title",
    "hook",
    "platform",
    "scheduled_date",
    "status",
    "published_url",
    "created_at",
    "updated_at",
}
"""Every column `data-model.md` describes for `content_item`, and nothing else.

Written out by hand rather than derived from `ContentItem.__table__`, which would compare the model
to itself and pass no matter what either one said. The spec is the answer key here; the model is one
of the two things under test.
"""

EXPECTED_TABLES = {"creator", "content_item", "alembic_version"}
"""The whole schema. `alembic_version` is Alembic's bookkeeping, not ours.

Constitution VII forbids "organization entities" as well as owner columns, and a new *table* is how
that arrives — `organization`, `workspace`, `team`, `role`. A column allowlist would not see it.
"""


def _columns(session: Session, table: str) -> set[str]:
    return {column["name"] for column in inspect(session.get_bind()).get_columns(table)}


@pytest.mark.parametrize(
    ("pattern", "requirement"),
    [
        ("user", "INV-4, FR-003, constitution VII"),
        ("owner", "INV-4, FR-003, constitution VII"),
        ("tenant", "INV-4, FR-003, constitution VII"),
        ("creator", "INV-4, FR-003, constitution VII"),
        ("version", "FR-023a - last write wins, with no detection"),
        ("etag", "FR-023a - last write wins, with no detection"),
        ("lock", "FR-023a - last write wins, with no detection"),
        ("time", "FR-012a - calendar days only, no time component anywhere"),
        ("deleted", "FR-004 - delete is delete; nothing in the spec asks for recovery"),
        ("order", "Assumptions - backlog order is created_at DESC, not manual"),
    ],
)
def test_content_item_has_no_column_matching_a_forbidden_pattern(
    session: Session, pattern: str, requirement: str
) -> None:
    """The `Columns deliberately absent` table in `data-model.md`, made mechanical.

    Each row of that table exists because something plausible was considered and rejected for a
    stated reason, and none of those reasons are self-evident from reading the model. The pattern is
    matched as a substring, so `creator_id`, `owner_id`, and `lock_version` all fail against the row
    that forbids them.
    """
    offenders = sorted(name for name in _columns(session, "content_item") if pattern in name)

    assert not offenders, (
        f"content_item.{offenders} matches the forbidden pattern %{pattern}%. "
        f"Forbidden by {requirement}. If this column is genuinely needed, amend spec.md and "
        f"data-model.md first - a new field is a product decision, not an implementation detail."
    )


def test_content_item_has_exactly_the_columns_the_data_model_describes(session: Session) -> None:
    """The exhaustive half. Catches an owner column under a name nobody thought to forbid.

    Deliberately an equality assertion rather than a subset check in either direction: a *missing*
    column is drift too, and it is the direction a hand-edited migration produces. `alembic check`
    compares the model against the database; this compares both against the specification, which is
    the comparison neither of them can make.
    """
    assert _columns(session, "content_item") == CONTENT_ITEM_COLUMNS


def test_content_item_has_no_foreign_key_to_anything(session: Session) -> None:
    """INV-4 stated as a relationship rather than as a name.

    `data-model.md`: "No relationship to `content_item`. That is deliberate and is INV-4." A key
    pointing at a table with exactly one row is decoration that taxes every query and every
    migration, and it is the shape multi-tenancy arrives in — one harmless-looking column, then a
    filter on every read, then a spec that has quietly changed.
    """
    foreign_keys = inspect(session.get_bind()).get_foreign_keys("content_item")

    assert foreign_keys == []


def test_the_schema_holds_no_table_beyond_the_two_the_spec_describes(session: Session) -> None:
    """Constitution VII forbids organization entities, and those arrive as tables, not columns.

    Also a scope check with a wider reach than it looks: v0.1 ships Content Calendar only, so a
    `growth_metric` or `deal` table appearing here would mean a later module had started leaking
    into this one — the specific failure this project is structured to avoid.
    """
    assert set(inspect(session.get_bind()).get_table_names()) == EXPECTED_TABLES


def test_creator_carries_no_role_or_organization_column(session: Session) -> None:
    """The other half of principle VII, which names roles alongside multi-tenancy.

    `creator` is the table an ownership model would grow from, so the same rule applies to it: one
    account, no `role`, no `is_admin`, no `organization_id`. Asserted as an allowlist for the same
    reason as above.

    `theme` and `sound_enabled` joined the allowlist at T013 (002-pixel-arcade-skin,
    `data-model.md`): two columns on this same row, not a new table and not an owner column on
    `content_item` — INV-2 there is unchanged and `content_item`'s own assertions in this file are
    untouched.
    """
    assert _columns(session, "creator") == {
        "id",
        "email",
        "password_hash",
        "created_at",
        "theme",
        "sound_enabled",
    }


def test_the_pattern_check_matches_when_a_column_really_does_match(session: Session) -> None:
    """A test for the tests above. Ten green "nothing matched" results are worth exactly as much as
    the matching is, and a substring check that *cannot* match looks identical to one that simply
    found nothing.

    So the same filter is run with a pattern that must hit — "date" — and asserted to hit. If
    `_columns` ever starts returning an empty set, or the comprehension above is refactored into
    something that no longer compares what it claims to, this fails and the ten silent passes stop
    being silent.

    `updated_at` is in the expected result because it contains "date" inside "updated". Not a
    curiosity: it is the reminder that these are substring matches with no word boundaries, so a
    forbidden pattern short enough to appear inside an innocent name would fail a schema that is
    entirely correct. Each of the ten was checked against the nine real columns for exactly that.
    """
    matched = sorted(name for name in _columns(session, "content_item") if "date" in name)

    assert matched == ["scheduled_date", "updated_at"]
