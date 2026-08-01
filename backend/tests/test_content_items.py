"""Create and list, over HTTP, against the real database.

This is the first file in the suite that exercises a content-item route, and it is the file every
later story extends — T036 adds date-range filtering, T048 partial-update semantics, T059 the
platform filter, T063 published links. Keep the sections below in the order the endpoints were built
so a later task appends rather than interleaves.

Three things here are decided by `contracts/openapi.yaml` rather than by taste, and each is the kind
of thing a later reader would otherwise "simplify" into a defect:

* **A blank title is 422, not 409.** INV-2 is as real an invariant as INV-1, but the contract's
  `InvariantError.code` enum has exactly two members — `platform_required` and `platform_locked` —
  and neither describes a blank title. A 409 would need a third code the contract does not declare,
  so a title that trims to nothing is a *validation* failure, refused by the request model before
  any invariant is consulted. The 409 is reserved for the one rule that cannot be expressed as a
  field constraint because it spans two fields.
* **The 409 body carries `code` as well as `detail`**, which no other error in this API does. See
  `test_errors.py` — this is the seam that file was written to anticipate.
* **`created_at DESC` needs a tiebreaker to be a total order**, and inside this harness it needs one
  to be an order at all. Postgres `now()` is *transaction* time, not statement time, so every row a
  test creates through the API shares one `created_at` to the microsecond. In production each
  request is its own transaction and the timestamps differ; here they cannot. The ordering
  assertions therefore come in two halves: distinct timestamps written directly through the session,
  which test the documented order, and same-timestamp rows created over HTTP, which test that the
  result is deterministic rather than arbitrary.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import ContentItem, Platform, Status

ITEMS_PATH = "/content-items"

CONTRACTED_ITEM_KEYS = {
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
"""Every property of the contract's `ContentItem`, asserted as an exact set.

Exact rather than a subset check, in both directions. A missing key breaks the calendar, which
renders a status cue and a platform cue per item and is promised (FR-017, FR-018) that one list call
is enough. An *extra* key is the failure this project is most exposed to: the generated client is
hand-written from the contract, so a field the API invents is a field nothing consumes, and a
`creator_id` appearing here would be constitution VII breaking in the one place a test can see it.
"""


def create_item(client: TestClient, **body: Any) -> Any:
    """POST one item and return the parsed response, asserting nothing.

    A helper rather than a fixture because most tests here care about the response itself, including
    the ones where it is a 4xx.
    """
    return client.post(ITEMS_PATH, json=body)


def insert_item(session: Session, **columns: Any) -> ContentItem:
    """Write a row directly, bypassing the API.

    Used only where the API cannot produce the state under test — chiefly distinct `created_at`
    values, which are impossible to create over HTTP inside a single transaction. Everything a
    request *can* set is set through a request, so these do not become a second, quieter definition
    of what a valid item looks like.
    """
    item = ContentItem(**columns)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


# ---------------------------------------------------------------------------
# Authentication — the boundary applies here too
# ---------------------------------------------------------------------------


def test_create_requires_authentication(client: TestClient) -> None:
    """FR-002. `client` sends no `Authorization` header, ever."""
    response = client.post(ITEMS_PATH, json={"title": "should never be stored"})

    assert response.status_code == 401


def test_list_requires_authentication(client: TestClient) -> None:
    """SC-006: an unauthenticated caller sees no content data of any kind."""
    response = client.get(ITEMS_PATH)

    assert response.status_code == 401
    assert "title" not in response.text


def test_an_unauthenticated_create_stores_nothing(
    client: TestClient, auth_client: TestClient
) -> None:
    """The refusal has to happen *before* the insert, not after it.

    A 401 returned by a route that had already committed would look identical from the client's side
    and be a silent data leak into a single-user database. The only way to see the difference is to
    ask an authenticated client what is there afterwards.
    """
    client.post(ITEMS_PATH, json={"title": "should never be stored"})

    assert auth_client.get(ITEMS_PATH).json() == []


# ---------------------------------------------------------------------------
# Create — FR-005, title is the only required field
# ---------------------------------------------------------------------------


def test_create_with_only_a_title_succeeds(auth_client: TestClient) -> None:
    """FR-005, and the whole point of US1: capture costs one field."""
    response = create_item(auth_client, title="Ring light comparison")

    assert response.status_code == 201
    assert response.json()["title"] == "Ring light comparison"


def test_create_returns_every_contracted_field(auth_client: TestClient) -> None:
    """The calendar renders from the list response alone (FR-017, FR-018), so shape matters."""
    body = create_item(auth_client, title="Ring light comparison").json()

    assert set(body) == CONTRACTED_ITEM_KEYS


def test_a_title_only_item_defaults_to_idea(auth_client: TestClient) -> None:
    """FR-007. `idea` is where everything starts, and nothing else in US1 can set a status."""
    body = create_item(auth_client, title="Ring light comparison").json()

    assert body["status"] == Status.IDEA


def test_a_title_only_item_leaves_every_other_field_null(auth_client: TestClient) -> None:
    """FR-005 and FR-011 together: an item captured with a title alone lands in the backlog.

    Asserted field by field rather than as a whole-body comparison because a default that silently
    became `""` instead of `null` would still be falsy, and would still put the item in the backlog,
    while breaking the frontend's "is this scheduled" check.
    """
    body = create_item(auth_client, title="Ring light comparison").json()

    assert body["hook"] is None
    assert body["platform"] is None
    assert body["scheduled_date"] is None
    assert body["published_url"] is None


def test_a_created_item_is_readable_afterwards(auth_client: TestClient) -> None:
    """The capture flow's actual promise (US1): it is still there when you come back."""
    created = create_item(auth_client, title="Ring light comparison").json()

    listed = auth_client.get(ITEMS_PATH).json()

    assert [item["id"] for item in listed] == [created["id"]]


def test_create_accepts_every_field_at_once(auth_client: TestClient) -> None:
    """The contract's `ContentItemCreate` in full — nothing here is write-only or ignored.

    Worth one test on its own: the capture sheet sends a title, but the item sheet at T052 sends all
    of these, and a field the create endpoint silently drops would not surface until then.
    """
    response = create_item(
        auth_client,
        title="Ring light comparison",
        hook="Three lights, one budget",
        platform=Platform.YOUTUBE,
        scheduled_date="2026-09-01",
        status=Status.POSTED,
        published_url="https://youtube.com/watch?v=x",
    )

    assert response.status_code == 201
    assert response.json() | {"id": None, "created_at": None, "updated_at": None} == {
        "id": None,
        "title": "Ring light comparison",
        "hook": "Three lights, one budget",
        "platform": "youtube",
        "scheduled_date": "2026-09-01",
        "status": "posted",
        "published_url": "https://youtube.com/watch?v=x",
        "created_at": None,
        "updated_at": None,
    }


def test_a_scheduled_date_round_trips_as_a_plain_date(auth_client: TestClient) -> None:
    """FR-012a, and research.md R-006's whole reason for choosing `DATE`.

    A `T00:00:00Z` suffix appearing here would mean the column became a timestamp somewhere, and the
    midnight-UTC off-by-one that R-006 made unrepresentable would be representable again.
    """
    body = create_item(auth_client, title="Filming day", scheduled_date="2026-09-01").json()

    assert body["scheduled_date"] == "2026-09-01"


# ---------------------------------------------------------------------------
# INV-2 — a title that trims to nothing is refused, as validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "title",
    ["", " ", "   ", "\t", "\n", " \t\n "],
    ids=["empty", "one-space", "spaces", "tab", "newline", "mixed-whitespace"],
)
def test_create_refuses_a_title_that_trims_to_nothing(auth_client: TestClient, title: str) -> None:
    """INV-2. An item titled " " is indistinguishable from a bug in the capture sheet.

    422 rather than 409 — see this module's docstring. The whitespace variants are not padding: `""`
    is caught by `minLength: 1` alone, and every other case here is caught only if the value is
    stripped *before* that check runs. A test with only `""` in it would pass against an
    implementation that stores a tab as a title.
    """
    response = create_item(auth_client, title=title)

    assert response.status_code == 422


def test_create_refuses_a_missing_title(auth_client: TestClient) -> None:
    """The one required field, absent."""
    assert create_item(auth_client, hook="no title though").status_code == 422


def test_a_blank_title_stores_nothing(auth_client: TestClient) -> None:
    """The CHECK constraint is the backstop, not the mechanism.

    If this ever passes by way of a 500 instead of a 422, the boundary validation has been lost and
    the database is the only thing still holding INV-2 — which is exactly the arrangement T030
    exists to prevent.
    """
    create_item(auth_client, title="   ")

    assert auth_client.get(ITEMS_PATH).json() == []


def test_a_title_is_stored_stripped(auth_client: TestClient) -> None:
    """Surrounding whitespace is removed rather than merely tolerated.

    Two titles that differ only in leading spaces are the same idea to the creator, and a stored
    " Ring light" sorts and reads wrongly for the rest of the item's life. Stripping at the boundary
    is also what makes the INV-2 CHECK unreachable rather than merely unlikely.
    """
    body = create_item(auth_client, title="  Ring light comparison  ").json()

    assert body["title"] == "Ring light comparison"


def test_create_refuses_a_title_over_the_contracted_length(auth_client: TestClient) -> None:
    """`maxLength: 200` is also the column width — a 201 here would be a 500 one layer down."""
    assert create_item(auth_client, title="x" * 201).status_code == 422


def test_a_title_of_exactly_the_contracted_length_is_accepted(auth_client: TestClient) -> None:
    """The boundary from the other side, so the limit cannot drift to 199 unnoticed."""
    assert create_item(auth_client, title="x" * 200).status_code == 201


# ---------------------------------------------------------------------------
# INV-1 — a platform is required past `idea`, and the refusal is a 409
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", [Status.DRAFT, Status.POSTED], ids=["draft", "posted"])
def test_create_past_idea_without_a_platform_is_refused(
    auth_client: TestClient, status: Status
) -> None:
    """INV-1, FR-009, and the reason this endpoint validates at the boundary at all.

    Both statuses, because `idea -> posted` directly is a legal transition (data-model.md) and an
    implementation that only guarded `draft` would let the second one through to the CHECK
    constraint — which surfaces as a 500 carrying a Postgres error string.
    """
    response = create_item(auth_client, title="Ring light comparison", status=status)

    assert response.status_code == 409


def test_the_invariant_refusal_carries_the_contracted_code(auth_client: TestClient) -> None:
    """The seam recorded in `backend/AGENTS.md`, now built.

    `code` is the only thing that distinguishes `platform_required` from `platform_locked`, which
    are two different instructions to the creator — "pick a platform" versus "move it back to `idea`
    first". A `detail` string the frontend has to pattern-match is not a substitute, which is why
    the contract won this over `test_errors.py`'s one-key rule.
    """
    body = create_item(auth_client, title="Ring light comparison", status=Status.DRAFT).json()

    assert body["code"] == "platform_required"
    assert isinstance(body["detail"], str)
    assert body["detail"].strip()


def test_an_invariant_refusal_stores_nothing(auth_client: TestClient) -> None:
    """The 409 has to be a refusal, not a rollback after the fact.

    This is the assertion `conftest.py`'s `join_transaction_mode="create_savepoint"` exists for: if
    the endpoint ever hits the constraint and calls `session.rollback()` to recover, that rollback
    must not unwind past the fixtures — and under the other two modes it does, which presents as
    application logic being wrong.
    """
    create_item(auth_client, title="Ring light comparison", status=Status.DRAFT)

    assert auth_client.get(ITEMS_PATH).json() == []


@pytest.mark.parametrize("status", [Status.DRAFT, Status.POSTED], ids=["draft", "posted"])
def test_create_past_idea_with_a_platform_succeeds(auth_client: TestClient, status: Status) -> None:
    """The other side of INV-1 — the guard refuses a missing platform, not a non-`idea` status."""
    response = create_item(
        auth_client, title="Ring light comparison", status=status, platform=Platform.TIKTOK
    )

    assert response.status_code == 201
    assert response.json()["status"] == status


def test_create_as_idea_without_a_platform_is_fine(auth_client: TestClient) -> None:
    """Restating FR-005 as an invariant check, because this is the case INV-1 must *not* catch.

    An over-eager guard that required a platform unconditionally would pass every test above and
    break the only flow US1 has.
    """
    response = create_item(auth_client, title="Ring light comparison", status=Status.IDEA)

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("status", "archived"),
        ("platform", "twitter"),
        ("scheduled_date", "not-a-date"),
        ("title", 7),
    ],
    ids=["unknown-status", "unknown-platform", "malformed-date", "wrong-type"],
)
def test_create_refuses_values_outside_the_contract(
    auth_client: TestClient, field: str, value: Any
) -> None:
    """FR-007 and FR-010 are closed sets, and a set is only closed if something enforces it."""
    response = create_item(auth_client, **{"title": "Ring light comparison", field: value})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# List — FR-011, the backlog filter and the ordering
# ---------------------------------------------------------------------------


def test_list_is_empty_when_nothing_exists(auth_client: TestClient) -> None:
    """An empty array, not a 404. The backlog drawer's empty state (T035) renders from this."""
    response = auth_client.get(ITEMS_PATH)

    assert response.status_code == 200
    assert response.json() == []


def test_list_returns_dated_and_undated_by_default(auth_client: TestClient) -> None:
    """No `scheduled` parameter is the calendar surface's read — it needs both (FR-012, FR-011)."""
    create_item(auth_client, title="Undated")
    create_item(auth_client, title="Dated", scheduled_date="2026-09-01")

    titles = {item["title"] for item in auth_client.get(ITEMS_PATH).json()}

    assert titles == {"Undated", "Dated"}


def test_scheduled_none_returns_only_undated_items(auth_client: TestClient) -> None:
    """FR-011. This one parameter is the entire backlog query."""
    create_item(auth_client, title="Undated")
    create_item(auth_client, title="Dated", scheduled_date="2026-09-01")

    response = auth_client.get(ITEMS_PATH, params={"scheduled": "none"})

    assert response.status_code == 200
    assert [item["title"] for item in response.json()] == ["Undated"]


def test_scheduled_none_is_empty_when_everything_is_dated(auth_client: TestClient) -> None:
    """The filter excludes, rather than falling back to everything when it matches nothing.

    A `WHERE` clause dropped by an `if` with the wrong truthiness test returns the full list here
    and passes every other assertion in this section.
    """
    create_item(auth_client, title="Dated", scheduled_date="2026-09-01")

    assert auth_client.get(ITEMS_PATH, params={"scheduled": "none"}).json() == []


def test_list_refuses_an_unrecognised_scheduled_value(auth_client: TestClient) -> None:
    """The contract's enum has exactly one member. `scheduled=all` is a typo, not a synonym."""
    response = auth_client.get(ITEMS_PATH, params={"scheduled": "all"})

    assert response.status_code == 422


def test_items_come_back_newest_created_first(auth_client: TestClient, session: Session) -> None:
    """The backlog ordering assumption in `spec.md`, tested against genuinely distinct timestamps.

    Written through the session rather than the API on purpose. Postgres `now()` is transaction
    time, so three items created over HTTP inside this harness share one `created_at` and could not
    distinguish `DESC` from `ASC` — see this module's docstring. Inserted oldest-first so that
    insertion order, id order, and the expected result are not accidentally the same sequence.
    """
    now = datetime.now(UTC)
    for offset, title in enumerate(["Oldest", "Middle", "Newest"]):
        insert_item(session, title=title, created_at=now - timedelta(hours=2 - offset))

    titles = [item["title"] for item in auth_client.get(ITEMS_PATH).json()]

    assert titles == ["Newest", "Middle", "Oldest"]


def test_the_backlog_is_ordered_too(auth_client: TestClient, session: Session) -> None:
    """FR-011 is the ordering's actual consumer, so the filtered path gets its own assertion.

    A `.order_by()` applied before a conditional `.where()` works; one applied inside the branch
    that handles the unfiltered case does not, and only this test can tell them apart.
    """
    now = datetime.now(UTC)
    insert_item(session, title="Older", created_at=now - timedelta(hours=1))
    insert_item(session, title="Newer", created_at=now)
    insert_item(session, title="Dated", created_at=now, scheduled_date=date(2026, 9, 1))

    listed = auth_client.get(ITEMS_PATH, params={"scheduled": "none"}).json()

    assert [item["title"] for item in listed] == ["Newer", "Older"]


def test_items_created_in_the_same_instant_come_back_in_a_stable_order(
    auth_client: TestClient,
) -> None:
    """Same `created_at` to the microsecond — deterministic, not arbitrary.

    Inside this transaction every row shares one timestamp, which makes this the only place the
    tiebreaker is observable. It matters outside the harness too: a creator emptying their head into
    the capture sheet produces several items a second, and a backlog that reshuffles on every
    refresh reads as data loss. Two reads of the same rows must agree.
    """
    for title in ["First", "Second", "Third"]:
        create_item(auth_client, title=title)

    first_read = [item["title"] for item in auth_client.get(ITEMS_PATH).json()]
    second_read = [item["title"] for item in auth_client.get(ITEMS_PATH).json()]

    assert first_read == second_read
    assert first_read == ["Third", "Second", "First"]


def test_every_listed_item_carries_the_full_contracted_shape(auth_client: TestClient) -> None:
    """The list response and the create response are the same model, and must not drift apart.

    FR-017 and FR-018 promise the calendar can render a status cue and a platform cue without a
    follow-up request per item, and this is the response that promise is about.
    """
    create_item(auth_client, title="Ring light comparison", platform=Platform.TIKTOK)

    (item,) = auth_client.get(ITEMS_PATH).json()

    assert set(item) == CONTRACTED_ITEM_KEYS
