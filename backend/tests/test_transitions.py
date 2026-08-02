"""INV-1 and INV-3 over HTTP — the two rules that make the pipeline a pipeline.

Split out of `test_content_items.py` because these are assertions about *transitions*, not about an
endpoint. `PATCH` is the vehicle, but the subject is the state machine in `data-model.md`, and a
later reader looking for "why can this item not move" should find one file rather than a section.

Three things decided here, each of which a later reader could plausibly undo:

* **INV-1 is one rule with two error codes, not two rules.** Advancing past `idea` with no platform
  and clearing the platform of an advanced item are the same violation approached from opposite
  sides — the stored predicate `status = 'idea' OR platform IS NOT NULL` cannot tell them apart, and
  it should not. The contract distinguishes them only because the creator's *next step* differs:
  `platform_required` means "pick one", `platform_locked` means "move it back to ideas first". So
  `check_invariant_1` keeps a single condition and branches only on which instruction to give. Both
  directions are asserted here so that collapsing the two codes into one fails a test.

* **Every non-`idea` status is guarded, not just `draft`.** `idea -> posted` is a legal edge
  (data-model.md), so a guard written as `status == DRAFT` lets exactly one path reach the CHECK
  constraint — and it is the path a creator who films and publishes in one sitting takes. The
  parametrised cases below cover both forward targets for that reason; a single `draft` case would
  pass against the broken guard.

* **INV-3 is an absence, and an absence needs an exhaustive assertion.** No code path clears
  `platform` or `published_url` as a side effect of a status change. There is no constraint that can
  express that, so the test walks `posted -> draft -> idea` with *every* field set and compares the
  whole item, key by key, against what it was. Asserting only "platform survived" would pass against
  an implementation that dropped the hook, which is the failure mode `test_schema.py`'s docstring
  warns about in the other direction: a test of an absence is green against a great many broken
  things unless it is written to be exhaustive.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.models import Platform, Status

ITEMS_PATH = "/content-items"

ADVANCED_STATUSES = [Status.DRAFT, Status.POSTED]
"""Both statuses past `idea`.

Written out rather than derived as `set(Status) - {IDEA}` so that adding a fourth status to the enum
does not silently widen every parametrised case here into one that was never considered. FR-007 says
three, and a fourth is a spec change before it is a test change.
"""


def create(client: TestClient, **body: Any) -> Any:
    """POST one item and return the response, asserting nothing."""
    return client.post(ITEMS_PATH, json=body)


def patch(client: TestClient, item_id: int, **body: Any) -> Any:
    """PATCH one item and return the response, asserting nothing."""
    return client.patch(f"{ITEMS_PATH}/{item_id}", json=body)


def an_idea(client: TestClient, **overrides: Any) -> Any:
    """Create a plain `idea` and return the parsed body, failing loudly if the create failed.

    The invariant tests all start from a known-good item, and a create that quietly 4xx'd would make
    the *next* assertion fail for the wrong reason — a 404 on a `PATCH` to `None`.
    """
    response = create(client, title="Ring light comparison", **overrides)
    assert response.status_code == 201, f"setup create failed: {response.text}"
    return response.json()


# ---------------------------------------------------------------------------
# INV-1, forward: advancing past `idea` needs a platform (FR-009)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("target", ADVANCED_STATUSES)
def test_advancing_an_item_with_no_platform_is_refused(
    auth_client: TestClient, target: Status
) -> None:
    """FR-009. Both forward targets, because `idea -> posted` skips `draft` legally."""
    item = an_idea(auth_client)

    response = patch(auth_client, item["id"], status=target.value)

    assert response.status_code == 409
    assert response.json()["code"] == "platform_required"


@pytest.mark.parametrize("target", ADVANCED_STATUSES)
def test_a_refused_advance_leaves_the_item_exactly_as_it_was(
    auth_client: TestClient, target: Status
) -> None:
    """A 409 must not be a partial write.

    `PATCH` assigns to the model before the session is committed, so an implementation that checked
    the invariant *after* assigning would still refuse the request while leaving the in-session item
    mutated — and with `create_savepoint` in the harness, whether that reaches the database depends
    on transaction bookkeeping rather than on intent. Re-reading over HTTP is what makes this an
    assertion about stored state rather than about the response body.
    """
    item = an_idea(auth_client)

    patch(auth_client, item["id"], status=target.value)

    assert auth_client.get(f"{ITEMS_PATH}/{item['id']}").json() == item


@pytest.mark.parametrize("target", ADVANCED_STATUSES)
def test_advancing_and_setting_a_platform_in_one_request_succeeds(
    auth_client: TestClient, target: Status
) -> None:
    """The resolution FR-009 implies, and the one the item sheet at T052 has to be able to send.

    The invariant is checked against the item as it *would be*, not against the item as stored. An
    implementation that validated the incoming status against the *current* platform would refuse
    this — which would leave a title-only idea with no single request that can advance it, and the
    creator alternating between two 409s.
    """
    item = an_idea(auth_client)

    response = patch(auth_client, item["id"], status=target.value, platform=Platform.TIKTOK.value)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == target.value
    assert body["platform"] == Platform.TIKTOK.value


def test_setting_a_platform_alone_leaves_an_idea_an_idea(auth_client: TestClient) -> None:
    """INV-1 constrains status given platform, never the reverse.

    A platform on an `idea` is exactly the state FR-006a describes — captured without one, assigned
    later, ready to advance. Nothing may auto-advance it: the creator decides when it stops being an
    idea, and a helpful implementation that promoted it to `draft` would take that decision away.
    """
    item = an_idea(auth_client)

    response = patch(auth_client, item["id"], platform=Platform.YOUTUBE.value)

    assert response.status_code == 200
    assert response.json()["status"] == Status.IDEA.value
    assert response.json()["platform"] == Platform.YOUTUBE.value


# ---------------------------------------------------------------------------
# INV-1, backward: clearing a platform past `idea` is refused (FR-009a)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("current", ADVANCED_STATUSES)
def test_clearing_the_platform_of_an_advanced_item_is_refused(
    auth_client: TestClient, current: Status
) -> None:
    """FR-009a, and the *other* half of the same stored predicate.

    The code differs from the forward case on purpose. Both leave the item in a state INV-1 forbids;
    what differs is what the creator should do next, and `platform_locked` is the only thing telling
    them the way out is to move the item back to ideas first (T053 renders it beside the control).
    """
    item = an_idea(auth_client, platform=Platform.INSTAGRAM.value, status=current.value)

    response = patch(auth_client, item["id"], platform=None)

    assert response.status_code == 409
    assert response.json()["code"] == "platform_locked"


@pytest.mark.parametrize("current", ADVANCED_STATUSES)
def test_a_refused_clear_leaves_the_platform_in_place(
    auth_client: TestClient, current: Status
) -> None:
    """Same reasoning as the refused advance: assert the stored row, not the response."""
    item = an_idea(auth_client, platform=Platform.INSTAGRAM.value, status=current.value)

    patch(auth_client, item["id"], platform=None)

    assert auth_client.get(f"{ITEMS_PATH}/{item['id']}").json() == item


def test_clearing_the_platform_of_an_idea_is_allowed(auth_client: TestClient) -> None:
    """The lock is on *advanced* items, and the boundary is worth pinning from the legal side.

    An implementation that refused every `platform: null` would satisfy every test above it while
    making a mis-assigned platform permanent on an idea. This is the case that distinguishes
    "clearing is refused" from "clearing is refused past `idea`".
    """
    item = an_idea(auth_client, platform=Platform.TIKTOK.value)

    response = patch(auth_client, item["id"], platform=None)

    assert response.status_code == 200
    assert response.json()["platform"] is None


def test_moving_back_to_idea_and_clearing_in_one_request_is_allowed(
    auth_client: TestClient,
) -> None:
    """The escape hatch `platform_locked` points at, taken in a single request.

    Same reasoning as the paired forward case: the invariant is evaluated against the resulting
    item. If it were evaluated against the stored status, this would be refused and the message
    "move it back to ideas first" would describe a two-request dance the API forces rather than a
    choice the creator makes.
    """
    item = an_idea(auth_client, platform=Platform.TIKTOK.value, status=Status.POSTED.value)

    response = patch(auth_client, item["id"], status=Status.IDEA.value, platform=None)

    assert response.status_code == 200
    assert response.json()["status"] == Status.IDEA.value
    assert response.json()["platform"] is None


def test_swapping_one_platform_for_another_past_idea_is_allowed(auth_client: TestClient) -> None:
    """FR-009a locks *clearing*, not *changing* — the item never leaves the legal set.

    Worth its own case because the obvious over-strict implementation — "the platform of an advanced
    item is immutable" — passes every other test in this section.
    """
    item = an_idea(auth_client, platform=Platform.TIKTOK.value, status=Status.DRAFT.value)

    response = patch(auth_client, item["id"], platform=Platform.YOUTUBE.value)

    assert response.status_code == 200
    assert response.json()["platform"] == Platform.YOUTUBE.value


def test_the_two_invariant_codes_are_not_interchangeable(auth_client: TestClient) -> None:
    """One assertion holding the whole distinction, so collapsing the codes fails loudly.

    `test_errors.py` proves a 409 carries `{code, detail}`; it does not prove the two codes are ever
    *different*. An implementation raising `platform_required` for both would pass every shape test
    in the suite and every case above that checks only one direction — and would tell a creator with
    a posted item to "pick a platform" when it already has one.
    """
    advancing = an_idea(auth_client)
    clearing = an_idea(auth_client, platform=Platform.TIKTOK.value, status=Status.POSTED.value)

    forward = patch(auth_client, advancing["id"], status=Status.DRAFT.value)
    backward = patch(auth_client, clearing["id"], platform=None)

    assert {forward.json()["code"], backward.json()["code"]} == {
        "platform_required",
        "platform_locked",
    }
    assert forward.json()["detail"] != backward.json()["detail"]


# ---------------------------------------------------------------------------
# INV-3 — backward transitions are lossless (FR-008a, FR-019a)
# ---------------------------------------------------------------------------


FULLY_POPULATED = {
    "title": "Softbox teardown",
    "hook": "Why the cheap one is fine for talking heads",
    "platform": Platform.YOUTUBE.value,
    "scheduled_date": "2026-09-14",
    "status": Status.POSTED.value,
    "published_url": "https://youtube.com/watch?v=abc123",
}
"""Every writable field set at once — the only starting state that can prove a *lossless* walk.

An item missing a field cannot demonstrate that field survives, and the fields most at risk are
exactly the two a naive "reset on backward transition" would clear: `platform` and `published_url`.
"""


def test_walking_backwards_preserves_every_field(auth_client: TestClient) -> None:
    """INV-3 in one walk: `posted -> draft -> idea`, comparing the whole item each step.

    Compared key by key against the previous state rather than field by field against literals, so a
    field added to the model later is covered by this test on the day it is added — the alternative
    is a list of assertions that silently stops being exhaustive the moment the schema grows.

    `updated_at` is excluded because a status change is precisely the thing that should move it; it
    gets its own assertion below.
    """
    created = create(auth_client, **FULLY_POPULATED)
    assert created.status_code == 201, created.text
    item = created.json()

    for target in [Status.DRAFT, Status.POSTED, Status.DRAFT, Status.IDEA]:
        response = patch(auth_client, item["id"], status=target.value)
        assert response.status_code == 200, response.text
        moved = response.json()

        assert moved["status"] == target.value
        assert {k: v for k, v in moved.items() if k not in {"status", "updated_at"}} == {
            k: v for k, v in item.items() if k not in {"status", "updated_at"}
        }
        item = moved


def test_the_published_link_survives_leaving_posted(auth_client: TestClient) -> None:
    """FR-019a named on its own, because it is the field with the strongest pull toward clearing.

    "It is not posted any more, so the link is stale" is a reasonable-sounding argument and the spec
    refuses it: the link is removable only by the creator editing it directly. A creator who
    un-posts to fix a typo and re-posts must not lose the URL in between.
    """
    created = create(auth_client, **FULLY_POPULATED)
    item_id = created.json()["id"]

    back_to_draft = patch(auth_client, item_id, status=Status.DRAFT.value)

    assert back_to_draft.json()["published_url"] == FULLY_POPULATED["published_url"]


def test_the_platform_survives_returning_to_idea(auth_client: TestClient) -> None:
    """The other half of INV-3, and the one INV-1 makes tempting to clear.

    Returning to `idea` is the moment the platform stops being *required*, which is not the moment
    it stops being *wanted*. Clearing it here would mean a creator who moves an item back to rework
    it has to re-pick the platform before they can advance it again.
    """
    created = create(auth_client, **FULLY_POPULATED)
    item_id = created.json()["id"]

    back_to_idea = patch(auth_client, item_id, status=Status.IDEA.value)

    assert back_to_idea.json()["platform"] == FULLY_POPULATED["platform"]


def test_a_backward_walk_is_durable_and_not_only_a_response_body(auth_client: TestClient) -> None:
    """FR-023: re-read the item after the walk, so the assertion is about Postgres.

    Every test above reads the `PATCH` response, which an implementation could satisfy by echoing
    the request. This one is the control.
    """
    created = create(auth_client, **FULLY_POPULATED)
    item_id = created.json()["id"]

    patch(auth_client, item_id, status=Status.DRAFT.value)
    patch(auth_client, item_id, status=Status.IDEA.value)

    stored = auth_client.get(f"{ITEMS_PATH}/{item_id}").json()

    assert stored["status"] == Status.IDEA.value
    assert stored["platform"] == FULLY_POPULATED["platform"]
    assert stored["published_url"] == FULLY_POPULATED["published_url"]
    assert stored["hook"] == FULLY_POPULATED["hook"]
    assert stored["scheduled_date"] == FULLY_POPULATED["scheduled_date"]
