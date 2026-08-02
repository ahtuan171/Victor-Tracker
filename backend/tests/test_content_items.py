"""Create and list, over HTTP, against the real database.

This is the first file in the suite that exercises a content-item route, and it is the file every
later story extends — T036 adds date-range filtering, T048 partial-update semantics, T059 the
platform filter, T063 published links. Keep the sections below in the order the endpoints were built
so a later task appends rather than interleaves.

Four things here are decided by `contracts/openapi.yaml` — or by a silence in it — rather than by
taste, and each is the kind of thing a later reader would otherwise "simplify" into a defect:

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
* **A date bound never matches an undated item, and the contract does not say so.** It declares
  `date_from` and `date_to` as inclusive bounds on `scheduled_date` and stops there; SQL's
  three-valued logic decides the rest, because `NULL >= '2026-09-01'` is `NULL` and not `TRUE`. That
  is the behaviour the calendar needs — an item with no date is not on any day of the grid (FR-012)
  — but it falls out of the database rather than being stated anywhere, so the date-range section
  below asserts it explicitly in both directions. Without those assertions, a well-meaning rewrite
  that filtered in Python (`item.scheduled_date is None or ...`) would pass every other test here.
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


# ---------------------------------------------------------------------------
# List — FR-012 and FR-013, the date-range read the calendar grid is built on
# ---------------------------------------------------------------------------

DAY_BEFORE = "2026-08-31"
RANGE_FROM = "2026-09-01"
RANGE_MIDDLE = "2026-09-15"
RANGE_TO = "2026-09-30"
DAY_AFTER = "2026-10-01"
"""Five days spanning one month and one day either side of it.

Chosen so every boundary case is a distinct calendar day *and* crosses a month boundary in both
directions. A range wholly inside one month would pass against an implementation that compared only
the day-of-month, and September 2026 has 30 days, so `2026-09-31` cannot be written by mistake.
"""

FULL_SPAN = {"date_from": RANGE_FROM, "date_to": RANGE_TO}

MONTH_TITLES = {
    DAY_BEFORE: "Day before",
    RANGE_FROM: "First day",
    RANGE_MIDDLE: "Middle day",
    RANGE_TO: "Last day",
    DAY_AFTER: "Day after",
}


def seed_the_span(client: TestClient) -> None:
    """Create one dated item on each of the five days, plus one with no date at all.

    Every date-range assertion below reads from the same fixture set, so a filter that is too wide
    fails by naming exactly which extra day it let through. The undated item is part of the fixture
    rather than a separate one because "the undated item is missing" is the single easiest thing for
    a date filter to get wrong, and it should be in scope for every case rather than just its own.
    """
    for day, title in MONTH_TITLES.items():
        create_item(client, title=title, scheduled_date=day)
    create_item(client, title="Undated")


def titles_in(client: TestClient, **params: str) -> set[str]:
    """List with the given query parameters and return the titles as a set.

    A set, not a list: every item in `seed_the_span` is created over HTTP inside one transaction, so
    they share a `created_at` and their order is decided entirely by the `id` tiebreaker. Ordering
    under a date filter is asserted once, on its own, against distinct timestamps —
    `test_the_date_range_read_is_ordered_too`.
    """
    response = client.get(ITEMS_PATH, params=params)
    assert response.status_code == 200
    return {item["title"] for item in response.json()}


def test_date_from_is_inclusive_of_its_own_day(auth_client: TestClient) -> None:
    """FR-013, and the half of it a `>` instead of a `>=` silently breaks.

    The contract says "inclusive lower bound". An off-by-one here hides the first day of every month
    the creator opens — one item in thirty, on the day they are most likely to be looking at.
    """
    seed_the_span(auth_client)

    assert "First day" in titles_in(auth_client, date_from=RANGE_FROM)


def test_date_to_is_inclusive_of_its_own_day(auth_client: TestClient) -> None:
    """The same boundary from the other side. Both bounds are inclusive; neither is assumed."""
    seed_the_span(auth_client)

    assert "Last day" in titles_in(auth_client, date_to=RANGE_TO)


def test_a_range_returns_its_endpoints_and_everything_between(auth_client: TestClient) -> None:
    """Both bounds at once — the query the month grid actually issues.

    Asserted as an exact set rather than three `in` checks, so a filter that is too *wide* fails
    here rather than passing three inclusivity tests and shipping.
    """
    seed_the_span(auth_client)

    assert titles_in(auth_client, **FULL_SPAN) == {"First day", "Middle day", "Last day"}


def test_a_range_excludes_the_day_on_either_side(auth_client: TestClient) -> None:
    """The exclusivity half, named separately because it is the one an over-wide filter breaks.

    `2026-08-31` and `2026-10-01` are one day outside the bounds and in adjacent months, so a
    comparison that accidentally truncated to the month would fail here and nowhere else.
    """
    seed_the_span(auth_client)

    seen = titles_in(auth_client, **FULL_SPAN)

    assert "Day before" not in seen
    assert "Day after" not in seen


def test_date_from_alone_is_an_open_ended_lower_bound(auth_client: TestClient) -> None:
    """One bound must not imply the other: `date_from` alone is "this day and everything after"."""
    seed_the_span(auth_client)

    assert titles_in(auth_client, date_from=RANGE_FROM) == {
        "First day",
        "Middle day",
        "Last day",
        "Day after",
    }


def test_date_to_alone_is_an_open_ended_upper_bound(auth_client: TestClient) -> None:
    """And the mirror image: everything up to and including that day."""
    seed_the_span(auth_client)

    assert titles_in(auth_client, date_to=RANGE_TO) == {
        "Day before",
        "First day",
        "Middle day",
        "Last day",
    }


def test_a_single_day_range_returns_only_that_day(auth_client: TestClient) -> None:
    """`date_from == date_to`, which is a day view and also the degenerate case of a week view.

    A range implemented with two strict comparisons is empty here while passing anything that only
    checks a multi-day span.
    """
    seed_the_span(auth_client)

    assert titles_in(auth_client, date_from=RANGE_MIDDLE, date_to=RANGE_MIDDLE) == {"Middle day"}


@pytest.mark.parametrize(
    "params",
    [
        {"date_from": RANGE_FROM},
        {"date_to": RANGE_TO},
        FULL_SPAN,
    ],
    ids=["from-only", "to-only", "both"],
)
def test_a_date_bound_never_matches_an_undated_item(
    auth_client: TestClient, params: dict[str, str]
) -> None:
    """The dated/undated split, asserted rather than left to SQL to imply.

    FR-012 puts an item on the grid *on its date*; an item with no date is on no day of it, and
    FR-011 gives it a home in the backlog drawer instead. In SQL this is free — `NULL >= date` is
    `NULL`, not `TRUE` — which is exactly why it needs a test: nothing in the endpoint will look
    like the line that implements it, so nothing signals when a rewrite drops it. All three bound
    combinations, because an implementation could plausibly special-case `NULL` in one branch only.
    """
    seed_the_span(auth_client)

    assert "Undated" not in titles_in(auth_client, **params)


def test_undated_items_still_come_back_when_no_date_bound_is_given(auth_client: TestClient) -> None:
    """The control for the test above: the undated item exists and the fixture is not lying.

    Without this, `"Undated" not in ...` would pass just as happily against a `seed_the_span` that
    silently failed to create it.
    """
    seed_the_span(auth_client)

    assert "Undated" in titles_in(auth_client)


def test_a_date_bound_with_scheduled_none_returns_nothing(auth_client: TestClient) -> None:
    """The two filters compose with `AND`, and the result of asking for both is empty.

    `scheduled=none` demands `scheduled_date IS NULL`; a date bound cannot be satisfied by a NULL.
    The combination is therefore always empty, and that is deliberate rather than a case worth
    special-handling: the contract declares both parameters on one operation and says nothing about
    them being exclusive, so refusing the pair with a 422 would be inventing behaviour, and quietly
    dropping one of them would make the response a lie about the question asked. No surface issues
    this query — the drawer sends `scheduled=none`, the grid sends dates — so an empty array is the
    honest answer to a question nothing asks.
    """
    seed_the_span(auth_client)

    response = auth_client.get(ITEMS_PATH, params={"scheduled": "none", **FULL_SPAN})

    assert response.status_code == 200
    assert response.json() == []


def test_an_inverted_range_returns_nothing(auth_client: TestClient) -> None:
    """`date_from > date_to` is an empty range, not an error.

    Same reasoning as the case above: the contract declares two independent inclusive bounds and no
    ordering rule between them, so the pair composes to a `WHERE` clause nothing satisfies. A 422
    would be a response the contract does not declare, and it would need `REACHABLE_4XX` to carry a
    case for a request no surface can produce — period navigation always builds `from <= to`.
    """
    seed_the_span(auth_client)

    response = auth_client.get(ITEMS_PATH, params={"date_from": RANGE_TO, "date_to": RANGE_FROM})

    assert response.status_code == 200
    assert response.json() == []


def test_a_range_matching_nothing_is_an_empty_array(auth_client: TestClient) -> None:
    """A month the creator has not planned yet. The grid renders from this, so 200 and `[]`."""
    seed_the_span(auth_client)

    response = auth_client.get(
        ITEMS_PATH, params={"date_from": "2027-01-01", "date_to": "2027-01-31"}
    )

    assert response.status_code == 200
    assert response.json() == []


def test_the_bounds_filter_on_scheduled_date_and_not_on_created_at(auth_client: TestClient) -> None:
    """The two dates on this row are different things, and only one of them is FR-013's.

    Every item in this harness is created *now*, so a filter accidentally written against
    `created_at` — the column the default ordering already uses — would still return plausible
    results for a range around today. Pinning a far-future `scheduled_date` is what separates them:
    the item must appear for its scheduled month and be absent from the month it was created in.
    """
    create_item(auth_client, title="Next spring", scheduled_date="2027-04-10")

    assert titles_in(auth_client, date_from="2027-04-01", date_to="2027-04-30") == {"Next spring"}
    assert titles_in(auth_client, date_from="2026-08-01", date_to="2026-08-31") == set()


def test_the_date_range_read_is_ordered_too(auth_client: TestClient, session: Session) -> None:
    """`created_at DESC, id DESC` survives the new `WHERE` clauses.

    The same failure `test_the_backlog_is_ordered_too` guards against, on the other filtered path:
    an `.order_by()` applied inside the unfiltered branch works everywhere except here. Written
    through the session because distinct `created_at` values cannot be produced over HTTP inside one
    transaction — see this module's docstring — and dated in an order that deliberately disagrees
    with the creation order, so a result accidentally sorted by `scheduled_date` fails.
    """
    now = datetime.now(UTC)
    insert_item(
        session,
        title="Older",
        created_at=now - timedelta(hours=1),
        scheduled_date=date(2026, 9, 30),
    )
    insert_item(session, title="Newer", created_at=now, scheduled_date=date(2026, 9, 1))
    insert_item(session, title="Outside", created_at=now, scheduled_date=date(2026, 10, 1))

    listed = auth_client.get(ITEMS_PATH, params=FULL_SPAN).json()

    assert [item["title"] for item in listed] == ["Newer", "Older"]


@pytest.mark.parametrize("bound", ["date_from", "date_to"], ids=["from", "to"])
@pytest.mark.parametrize(
    "value",
    ["not-a-date", "2026-09-31", "2026-09-01T12:00:00Z", "09/01/2026", ""],
    ids=["nonsense", "impossible-day", "timestamp-with-a-time", "wrong-order", "empty"],
)
def test_a_malformed_date_bound_is_refused(auth_client: TestClient, bound: str, value: str) -> None:
    """`format: date` is a closed shape, and a bound the API cannot parse must not be ignored.

    A parameter silently dropped on a parse failure returns *every* item, which on a calendar reads
    as the grid working rather than as the filter failing — the grid appears to work while showing
    the wrong month. Two of these cases are the ones a lenient parser would wave through:
    `2026-09-31` is a real-looking date that does not exist, and `2026-09-01T12:00:00Z` is FR-012a's
    boundary. A bound carrying a real time of day must be refused rather than truncated, because a
    truncated bound answers a question the caller did not ask and there is no way to see that in the
    response body. The exact-midnight spelling is a separate case — see the test below.
    """
    response = auth_client.get(ITEMS_PATH, params={bound: value})

    assert response.status_code == 422


def test_a_bound_spelled_as_exact_midnight_is_read_as_that_plain_day(
    auth_client: TestClient,
) -> None:
    """Pydantic accepts `2026-09-01T00:00:00Z` for a `date`, and this pins what that means.

    Not the behaviour this test was first written to expect — the assumption was that anything but
    `YYYY-MM-DD` is a 422, and it is not: pydantic coerces an RFC 3339 datetime whose time is
    exactly zero, while refusing one with any real time (asserted above). That is a safe pair, which
    is why it is characterised here rather than tightened away. Nothing can be silently truncated,
    because the only extra spelling accepted already names the whole day, and tightening it would
    cost a bespoke validator for an input no client sends — `frontend/lib/dates.ts` formats
    `YYYY-MM-DD` and nothing else.

    The value of the test is the direction it fails in. If either bound were ever retyped as a
    `datetime`, `2026-09-01T12:00:00Z` would start being accepted and the range would quietly begin
    filtering by time of day — which FR-012a says this iteration does not have. This test and the
    `timestamp-with-a-time` case above are the pair that notices.
    """
    seed_the_span(auth_client)

    midnight = titles_in(auth_client, date_from=f"{RANGE_FROM}T00:00:00Z", date_to=RANGE_TO)

    assert midnight == titles_in(auth_client, **FULL_SPAN)


def test_a_date_range_read_carries_the_full_contracted_shape(auth_client: TestClient) -> None:
    """FR-017 and FR-018 again, on the response the month grid renders from directly.

    The unfiltered list already asserts this, but the calendar's real read is the filtered one, and
    a response model applied per-branch is a thing that can drift.
    """
    create_item(auth_client, title="Filming day", scheduled_date=RANGE_MIDDLE)

    (item,) = auth_client.get(ITEMS_PATH, params=FULL_SPAN).json()

    assert set(item) == CONTRACTED_ITEM_KEYS


# ---------------------------------------------------------------------------
# Fetch one, and partial update — T048 (FR-004, FR-023, FR-023a)
#
# The invariant behaviour of `PATCH` lives in `test_transitions.py`; this section is about the
# *semantics* of a partial update, which is a different subject with a different failure mode. The
# distinction that carries the whole section: pydantic reports an omitted field and an explicitly
# null field both as `None`, and only `model_fields_set` separates them. An implementation reading
# `model_dump()` instead of `model_dump(exclude_unset=True)` turns every request into a full
# replacement — and passes any test whose request happens to name every field.
# ---------------------------------------------------------------------------


FULL_ITEM = {
    "title": "Three-point lighting",
    "hook": "The one setup that fixes every talking head",
    "platform": "youtube",
    "scheduled_date": "2026-09-20",
    "status": "posted",
    "published_url": "https://youtube.com/watch?v=xyz789",
}
"""An item with every writable field set.

The starting point for the untouched-field tests, because a field that is null to begin with cannot
demonstrate that it survived a request that did not mention it.
"""


def a_full_item(client: TestClient) -> Any:
    """Create an item with every field set and return the parsed body."""
    response = create_item(client, **FULL_ITEM)
    assert response.status_code == 201, response.text
    return response.json()


def test_fetch_one_requires_authentication(client: TestClient) -> None:
    """FR-002 reaches the by-id routes too — the boundary is per-route, not per-module."""
    assert client.get(f"{ITEMS_PATH}/1").status_code == 401


def test_update_requires_authentication(client: TestClient) -> None:
    """The mutation endpoint, unauthenticated."""
    assert client.patch(f"{ITEMS_PATH}/1", json={"title": "x"}).status_code == 401


def test_fetch_one_returns_the_full_contracted_shape(auth_client: TestClient) -> None:
    """Same exact-set rule as the list response, in both directions."""
    item = a_full_item(auth_client)

    fetched = auth_client.get(f"{ITEMS_PATH}/{item['id']}")

    assert fetched.status_code == 200
    assert set(fetched.json()) == CONTRACTED_ITEM_KEYS
    assert fetched.json() == item


def test_update_returns_the_full_contracted_shape(auth_client: TestClient) -> None:
    """The response model applies to this route as well, and it is a separate declaration."""
    item = a_full_item(auth_client)

    updated = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": "Renamed"})

    assert set(updated.json()) == CONTRACTED_ITEM_KEYS


def test_fetching_an_item_that_does_not_exist_is_a_404(auth_client: TestClient) -> None:
    """The contract's `NotFound`, on the read."""
    assert auth_client.get(f"{ITEMS_PATH}/999999").status_code == 404


def test_updating_an_item_that_does_not_exist_is_a_404(auth_client: TestClient) -> None:
    """The same, on the write.

    Reachable in production rather than hypothetical: T054's drag names an id, and T056 has to
    recover cleanly when the item is already gone — a second window can delete it mid-gesture.
    """
    assert auth_client.patch(f"{ITEMS_PATH}/999999", json={"title": "x"}).status_code == 404


@pytest.mark.parametrize(
    "field",
    ["title", "hook", "platform", "scheduled_date", "status", "published_url"],
)
def test_updating_one_field_leaves_every_other_field_untouched(
    auth_client: TestClient, field: str
) -> None:
    """FR-023's core promise, asserted once per field rather than once overall.

    Parametrised because the failure this guards against is asymmetric: an implementation that
    dumped the whole model would clear the five fields the request did not name, and a single test
    naming one field would catch it — but a *partial* regression, where one field is handled
    differently from the rest, needs every field to be the one under test at some point. The
    comparison is whole-item, so a field added to the model later is covered on the day it is added.
    """
    item = a_full_item(auth_client)
    replacement = {
        "title": "A different title",
        "hook": "A different hook",
        "platform": "tiktok",
        "scheduled_date": "2026-10-01",
        "status": "draft",
        "published_url": "https://tiktok.com/@creator/video/1",
    }[field]

    updated = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={field: replacement}).json()

    assert updated[field] == replacement
    assert {k: v for k, v in updated.items() if k not in {field, "updated_at"}} == {
        k: v for k, v in item.items() if k not in {field, "updated_at"}
    }


@pytest.mark.parametrize("field", ["hook", "scheduled_date", "published_url"])
def test_an_explicit_null_clears_the_field(auth_client: TestClient, field: str) -> None:
    """The other half of the distinction: null means clear, and it must not mean "leave alone".

    `platform` is absent from this list on purpose — clearing it is governed by INV-1 and lives in
    `test_transitions.py`, where the legal and illegal cases sit together. `status` has no null
    spelling at all: the column is `NOT NULL`, and the contract `$ref`s `Status` directly.

    Paired with the test above, these two are what pin `exclude_unset=True`. An implementation that
    ignored explicit nulls would pass every untouched-field test and quietly make the three
    clearable fields write-once — a creator could never unschedule an item, which is FR-014 with the
    backlog as its destination.
    """
    item = a_full_item(auth_client)

    updated = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={field: None})

    assert updated.status_code == 200
    assert updated.json()[field] is None


def test_clearing_a_field_is_durable(auth_client: TestClient) -> None:
    """FR-023 again: the clear reaches Postgres, not only the response body."""
    item = a_full_item(auth_client)

    auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"scheduled_date": None})

    assert auth_client.get(f"{ITEMS_PATH}/{item['id']}").json()["scheduled_date"] is None


def test_an_unscheduled_item_returns_to_the_backlog(auth_client: TestClient) -> None:
    """The clear above, observed through the read the backlog drawer actually issues.

    Clearing `scheduled_date` is how an item leaves the calendar, and `scheduled=none` is the only
    query that finds undated items. Asserting the two together is what makes "unschedule" a
    behaviour rather than a column write — T054's drag onto the drawer depends on exactly this.
    """
    item = a_full_item(auth_client)

    auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"scheduled_date": None})

    backlog = auth_client.get(ITEMS_PATH, params={"scheduled": "none"}).json()

    assert [row["id"] for row in backlog] == [item["id"]]


def test_an_empty_update_body_is_refused(auth_client: TestClient) -> None:
    """The contract's `minProperties: 1`.

    A no-op that answered 200 would be indistinguishable from a successful save, so a frontend bug
    that dropped its payload would look like it worked — and under optimistic updates (R-007) the
    creator would watch the change stick and then vanish on the next load.
    """
    item = a_full_item(auth_client)

    assert auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={}).status_code == 422


def test_the_last_write_wins_with_no_version_check(auth_client: TestClient) -> None:
    """FR-023a, asserted as the *absence* of a conflict response.

    Two updates to the same item from the same starting state, with nothing between them. Neither is
    refused and the second one's value is what is stored — no version column, no `If-Match`, no 409
    for a stale write. Written down because "we simply don't do that" decays silently, and because a
    future reader who adds optimistic concurrency should have to delete a test that says not to.
    """
    item = a_full_item(auth_client)

    first = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": "First writer"})
    second = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": "Second writer"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert auth_client.get(f"{ITEMS_PATH}/{item['id']}").json()["title"] == "Second writer"


@pytest.mark.parametrize(
    "title",
    ["", "   ", "\t", "\n"],
    ids=["empty", "spaces", "tab", "newline"],
)
def test_update_refuses_a_title_that_trims_to_nothing(auth_client: TestClient, title: str) -> None:
    """INV-2 on the update path, not only on create.

    The shared `Title` annotation is what makes this hold, and this test is what stops someone
    restating the type inline on `ContentItemUpdate` with the `strip_whitespace` dropped — which
    would pass `min_length` on `"   "` and reach the CHECK constraint as a 500.
    """
    item = a_full_item(auth_client)

    assert auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": title}).status_code == 422


def test_update_stores_a_title_stripped(auth_client: TestClient) -> None:
    """The same annotation's other half, so both write paths normalise identically."""
    item = a_full_item(auth_client)

    updated = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": "  Ring light  "})

    assert updated.json()["title"] == "Ring light"


def test_update_refuses_a_title_over_the_contracted_length(auth_client: TestClient) -> None:
    """200 characters, matching `String(200)` so the column can never be the thing that refuses."""
    item = a_full_item(auth_client)

    assert (
        auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": "x" * 201}).status_code
        == 422
    )


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://example.com/video",
        "not a url at all",
        "//example.com/video",
    ],
    ids=["javascript", "data", "ftp", "nonsense", "protocol-relative"],
)
def test_update_refuses_a_published_link_that_is_not_http(
    auth_client: TestClient, url: str
) -> None:
    """FR-019's value is rendered as an `href` (T065), so the scheme is an allowlist.

    An allowlist of `http`/`https` rather than a denial list of dangerous schemes, because a denial
    list is only as good as its author's imagination. `javascript:` and `data:` are the two that
    matter; the others pin that the rule is "starts with http(s)://" rather than "does not start
    with javascript:". T063 extends this to the frontend's rendering.
    """
    item = a_full_item(auth_client)

    response = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"published_url": url})

    assert response.status_code == 422


def test_update_refuses_a_published_link_over_the_contracted_length(
    auth_client: TestClient,
) -> None:
    """2048, matching `String(2048)` — an unbounded URL is a 500 from the column otherwise."""
    item = a_full_item(auth_client)
    too_long = "https://example.com/" + "x" * 2048

    response = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"published_url": too_long})

    assert response.status_code == 422


def test_a_refused_update_stores_nothing(auth_client: TestClient) -> None:
    """A 422 must not be a partial write.

    The request below carries one legal field and one illegal one. A model that validated field by
    field and assigned as it went would store the title and then refuse the request, which is the
    worst of both — the creator sees an error and the data changed anyway.
    """
    item = a_full_item(auth_client)

    response = auth_client.patch(
        f"{ITEMS_PATH}/{item['id']}",
        json={"title": "Should not be stored", "published_url": "javascript:alert(1)"},
    )

    assert response.status_code == 422
    assert auth_client.get(f"{ITEMS_PATH}/{item['id']}").json() == item


def test_an_update_is_visible_in_the_list_read(auth_client: TestClient) -> None:
    """The calendar renders from the list, so a change only the by-id read can see is invisible.

    R-007 loads the list once and narrows it client-side, which means every change the creator makes
    has to be present in *that* response for the surface to reflect it after a reload.
    """
    item = a_full_item(auth_client)

    auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"title": "Renamed in the list"})

    listed = auth_client.get(ITEMS_PATH).json()

    assert [row["title"] for row in listed] == ["Renamed in the list"]


def test_a_scheduled_date_set_by_update_round_trips_as_a_plain_date(
    auth_client: TestClient,
) -> None:
    """FR-012a on the write path T054's drag uses.

    The drag sets exactly one field and it is this one, so the `DATE`-end-to-end promise has to hold
    here as well as on create — a timestamp creeping in is how the midnight-UTC off-by-one gets back
    in.
    """
    item = a_full_item(auth_client)

    updated = auth_client.patch(f"{ITEMS_PATH}/{item['id']}", json={"scheduled_date": "2026-11-03"})

    assert updated.json()["scheduled_date"] == "2026-11-03"
