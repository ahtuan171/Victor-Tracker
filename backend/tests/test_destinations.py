"""List and create, over HTTP, against the real database (T021, User Story 1).

The first file in the suite exercising a Destination route, and the file every later story
extends the way `test_content_items.py` describes for its own resource — T033 adds the by-id
three (User Story 2), T045 the FR-017 containment flag (User Story 3).

**INV-1 (coordinates never null on a stored row) has no 409 to test.** Unlike `001`'s INV-1,
which is a `CHECK` constraint reachable over HTTP, this one is enforced entirely by
`DestinationCreate` requiring `latitude`/`longitude` with no default — there is no code path
that can construct a row without them, so the only reachable failure is `pydantic`'s own 422 for
a missing field. `test_errors.py`'s `REACHABLE_4XX` carries that case; this file's own INV-1
coverage is instead the positive assertion — every created row has real, non-null coordinates.

**`read_url` is monkeypatched, never real R2.** `GET /destinations/{id}` mints a presigned URL
per photograph, and no R2 bucket is provisioned in this environment (or in CI) — the same reason
`test_photographs.py` stubs `object_storage` entirely. Patching `app.api.destinations.read_url`
(the name bound *into that module*, not the defining module) is what actually intercepts the
call — `from ... import read_url` binds a local reference the source module's own patch target
does not reach.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Destination, Photograph, Trip

DESTINATIONS_PATH = "/destinations"


@pytest.fixture(autouse=True)
def _stub_read_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.destinations.read_url", lambda object_key: f"https://stub.example/{object_key}"
    )


CONTRACTED_DESTINATION_KEYS = {
    "id",
    "trip_id",
    "name",
    "latitude",
    "longitude",
    "start_date",
    "end_date",
    "status",
    "created_at",
    "updated_at",
    "outside_trip_range",
}
"""Every property of the contract's `Destination`, asserted as an exact set — the same "neither
missing nor uninvited" check `test_content_items.py` runs for `ContentItem`."""


# --- Create -----------------------------------------------------------------------------------


def test_create_destination_with_only_the_required_fields(auth_client: TestClient) -> None:
    """FR-015, FR-020. `name`/`latitude`/`longitude` are the only required fields — `trip_id` is
    optional (FR-020, a place marked independent of any Trip) and `status` defaults to
    `wishlist`, matching `destination.status`'s own column default.
    """
    response = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == CONTRACTED_DESTINATION_KEYS
    assert body["name"] == "Kyoto"
    assert body["latitude"] == 35.0116
    assert body["longitude"] == 135.7681
    assert body["status"] == "wishlist"
    assert body["trip_id"] is None
    assert body["start_date"] is None
    assert body["end_date"] is None


def test_create_destination_with_every_field(auth_client: TestClient) -> None:
    """The full body the contract's `DestinationCreate` allows, all echoed back."""
    response = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Tokyo",
            "latitude": 35.6812,
            "longitude": 139.7671,
            "start_date": "2026-09-01",
            "end_date": "2026-09-10",
            "status": "planned",
            "note": "First time back since the trip that started all this.",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Tokyo"
    assert body["start_date"] == "2026-09-01"
    assert body["end_date"] == "2026-09-10"
    assert body["status"] == "planned"
    # `note` is not in the contract's `Destination` — only `DestinationDetail` (T023) carries it.
    assert "note" not in body


def test_create_destination_requires_coordinates(auth_client: TestClient) -> None:
    """INV-1's negative case: a body naming a place but no location is refused before any row
    exists — data-model.md's guarantee that there is no code path inserting one without both.
    """
    missing_both = auth_client.post(DESTINATIONS_PATH, json={"name": "Nowhere"})
    assert missing_both.status_code == 422

    missing_longitude = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Nowhere", "latitude": 35.0}
    )
    assert missing_longitude.status_code == 422


def test_create_destination_requires_a_credential(client: TestClient) -> None:
    response = client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    )
    assert response.status_code == 401


# --- List -------------------------------------------------------------------------------------


def test_list_destinations_is_empty_with_no_rows(auth_client: TestClient) -> None:
    response = auth_client.get(DESTINATIONS_PATH)
    assert response.status_code == 200
    assert response.json() == []


def test_list_destinations_requires_a_credential(client: TestClient) -> None:
    assert client.get(DESTINATIONS_PATH).status_code == 401


def test_list_destinations_returns_every_row_regardless_of_trip_membership(
    auth_client: TestClient,
) -> None:
    """FR-001, FR-019: with no query parameters, every Destination renders on the map whether or
    not it has a Trip — this is the map's own read.
    """
    unattached = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Unattached", "latitude": 1.0, "longitude": 1.0}
    ).json()

    response = auth_client.get(DESTINATIONS_PATH)
    assert response.status_code == 200
    ids = {row["id"] for row in response.json()}
    assert unattached["id"] in ids


def test_list_destinations_filters_by_status(auth_client: TestClient) -> None:
    """FR-010's map filter."""
    visited = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Visited place", "latitude": 1.0, "longitude": 1.0, "status": "visited"},
    ).json()
    auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Wishlist place", "latitude": 2.0, "longitude": 2.0, "status": "wishlist"},
    )

    response = auth_client.get(DESTINATIONS_PATH, params={"status": "visited"})
    assert response.status_code == 200
    names = {row["name"] for row in response.json()}
    assert names == {visited["name"]}


def test_list_destinations_filters_by_trip_id(auth_client: TestClient, session: Session) -> None:
    """User Story 3's organising view: "this Trip's Destinations"."""
    trip = Trip(name="Japan 2026", start_date=date(2026, 9, 1), end_date=date(2026, 9, 15))
    session.add(trip)
    session.commit()
    session.refresh(trip)

    in_trip = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "In the trip", "latitude": 1.0, "longitude": 1.0, "trip_id": trip.id},
    ).json()
    auth_client.post(
        DESTINATIONS_PATH, json={"name": "Not in the trip", "latitude": 2.0, "longitude": 2.0}
    )

    response = auth_client.get(DESTINATIONS_PATH, params={"trip_id": trip.id})
    assert response.status_code == 200
    names = {row["name"] for row in response.json()}
    assert names == {in_trip["name"]}


def test_list_destinations_matches_the_contracted_shape(auth_client: TestClient) -> None:
    auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    )

    response = auth_client.get(DESTINATIONS_PATH)
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert set(rows[0]) == CONTRACTED_DESTINATION_KEYS


# --- INV-1, asserted directly against the database -----------------------------------------


def test_every_created_row_has_real_non_null_coordinates(
    auth_client: TestClient, session: Session
) -> None:
    """INV-1, read back from the table itself rather than from the response body — the response
    could theoretically echo a value it never stored; the row is the actual guarantee.
    """
    auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    )

    rows = session.exec(select(Destination)).all()
    assert len(rows) == 1
    assert rows[0].latitude is not None
    assert rows[0].longitude is not None


# --- Get one (T023, User Story 2) -----------------------------------------------------------


def test_get_destination_returns_note_and_photographs(
    auth_client: TestClient, session: Session
) -> None:
    """FR-005, FR-024. `note` and `photographs` are always present regardless of `status`
    (INV-3) — the frontend's gate on `status` is a display rule, not something the API enforces.
    Each photograph's `url` is a freshly minted presigned GET (stubbed here — see the module
    docstring).
    """
    created = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "status": "visited",
            "note": "The temple in the rain.",
        },
    ).json()
    photograph = Photograph(destination_id=created["id"], object_key="destinations/1/abc")
    session.add(photograph)
    session.commit()

    response = auth_client.get(f"{DESTINATIONS_PATH}/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["note"] == "The temple in the rain."
    assert len(body["photographs"]) == 1
    assert body["photographs"][0]["url"] == "https://stub.example/destinations/1/abc"


def test_get_destination_requires_a_credential(auth_client: TestClient, client: TestClient) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()
    assert client.get(f"{DESTINATIONS_PATH}/{created['id']}").status_code == 401


def test_get_destination_404s_on_a_missing_id(auth_client: TestClient) -> None:
    assert auth_client.get(f"{DESTINATIONS_PATH}/999999").status_code == 404


# --- Update (T024, User Story 2) ------------------------------------------------------------


def test_update_destination_changes_only_the_sent_fields(auth_client: TestClient) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681, "status": "wishlist"},
    ).json()

    response = auth_client.patch(
        f"{DESTINATIONS_PATH}/{created['id']}", json={"note": "Finally went."}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Kyoto"
    assert body["status"] == "wishlist"


@pytest.mark.parametrize(
    "start,end",
    [
        ("wishlist", "planned"),
        ("planned", "visited"),
        ("visited", "wishlist"),
        ("visited", "planned"),
    ],
)
def test_update_destination_status_moves_freely_in_either_direction(
    auth_client: TestClient, start: str, end: str
) -> None:
    """FR-028: any of the three values is a valid target from any of the other two, at any time —
    no forced order, unlike Content Calendar's status pipeline.
    """
    created = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681, "status": start},
    ).json()

    response = auth_client.patch(f"{DESTINATIONS_PATH}/{created['id']}", json={"status": end})

    assert response.status_code == 200
    assert response.json()["status"] == end


def test_update_destination_null_detaches_trip_id(
    auth_client: TestClient, session: Session
) -> None:
    trip = Trip(name="Japan 2026", start_date=date(2026, 9, 1), end_date=date(2026, 9, 15))
    session.add(trip)
    session.commit()
    session.refresh(trip)

    created = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681, "trip_id": trip.id},
    ).json()
    assert created["trip_id"] == trip.id

    response = auth_client.patch(f"{DESTINATIONS_PATH}/{created['id']}", json={"trip_id": None})

    assert response.status_code == 200
    assert response.json()["trip_id"] is None


def test_update_destination_requires_a_credential(
    auth_client: TestClient, client: TestClient
) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()
    response = client.patch(f"{DESTINATIONS_PATH}/{created['id']}", json={"note": "x"})
    assert response.status_code == 401


def test_update_destination_404s_on_a_missing_id(auth_client: TestClient) -> None:
    assert auth_client.patch(f"{DESTINATIONS_PATH}/999999", json={"note": "x"}).status_code == 404


def test_update_destination_422s_on_an_empty_body(auth_client: TestClient) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()
    assert auth_client.patch(f"{DESTINATIONS_PATH}/{created['id']}", json={}).status_code == 422


# --- Delete (T025, User Story 2) ------------------------------------------------------------


def test_delete_destination_removes_the_row(auth_client: TestClient, session: Session) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()

    response = auth_client.delete(f"{DESTINATIONS_PATH}/{created['id']}")

    assert response.status_code == 204
    assert session.get(Destination, created["id"]) is None


def test_delete_destination_cascades_to_its_photographs(
    auth_client: TestClient, session: Session
) -> None:
    """FR-016. `ON DELETE CASCADE` (data-model.md) does the work; this proves it end to end."""
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()
    photograph = Photograph(destination_id=created["id"], object_key="destinations/1/abc")
    session.add(photograph)
    session.commit()
    session.refresh(photograph)
    photograph_id = photograph.id

    auth_client.delete(f"{DESTINATIONS_PATH}/{created['id']}")

    assert session.get(Photograph, photograph_id) is None


def test_delete_destination_does_not_touch_its_trip(
    auth_client: TestClient, session: Session
) -> None:
    trip = Trip(name="Japan 2026", start_date=date(2026, 9, 1), end_date=date(2026, 9, 15))
    session.add(trip)
    session.commit()
    session.refresh(trip)

    created = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681, "trip_id": trip.id},
    ).json()

    auth_client.delete(f"{DESTINATIONS_PATH}/{created['id']}")

    assert session.get(Trip, trip.id) is not None


def test_delete_destination_requires_a_credential(
    auth_client: TestClient, client: TestClient
) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()
    assert client.delete(f"{DESTINATIONS_PATH}/{created['id']}").status_code == 401


def test_delete_destination_404s_on_a_missing_id(auth_client: TestClient) -> None:
    assert auth_client.delete(f"{DESTINATIONS_PATH}/999999").status_code == 404


# --- FR-017's containment flag (T045, User Story 3) ------------------------------------------


@pytest.fixture
def trip(session: Session) -> Trip:
    trip = Trip(name="Japan 2026", start_date=date(2026, 9, 1), end_date=date(2026, 9, 15))
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


def test_create_destination_within_trip_range_is_not_flagged(
    auth_client: TestClient, trip: Trip
) -> None:
    response = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "trip_id": trip.id,
            "start_date": "2026-09-03",
            "end_date": "2026-09-05",
        },
    )

    assert response.status_code == 201
    assert response.json()["outside_trip_range"] is False


def test_create_destination_starting_before_its_trip_is_flagged_not_rejected(
    auth_client: TestClient, trip: Trip
) -> None:
    """FR-017: flagged, never a rejected write — still a 201, not a 422/409."""
    response = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "trip_id": trip.id,
            "start_date": "2026-08-25",
            "end_date": "2026-09-05",
        },
    )

    assert response.status_code == 201
    assert response.json()["outside_trip_range"] is True


def test_create_destination_ending_after_its_trip_is_flagged(
    auth_client: TestClient, trip: Trip
) -> None:
    response = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "trip_id": trip.id,
            "start_date": "2026-09-10",
            "end_date": "2026-09-20",
        },
    )

    assert response.status_code == 201
    assert response.json()["outside_trip_range"] is True


def test_create_destination_with_no_trip_is_never_flagged(auth_client: TestClient) -> None:
    """Nothing to compare against — FR-017 only applies once both ranges exist."""
    response = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Somewhere",
            "latitude": 1.0,
            "longitude": 1.0,
            "start_date": "2020-01-01",
            "end_date": "2020-01-02",
        },
    )

    assert response.status_code == 201
    assert response.json()["outside_trip_range"] is False


def test_create_destination_in_a_trip_with_no_dates_of_its_own_is_not_flagged(
    auth_client: TestClient, trip: Trip
) -> None:
    """FR-017 applies only when both ranges are present (data-model.md's note on nullable
    dates) — a Destination with no dates of its own has nothing to compare.
    """
    response = auth_client.post(
        DESTINATIONS_PATH,
        json={"name": "Kyoto", "latitude": 35.0, "longitude": 135.0, "trip_id": trip.id},
    )

    assert response.status_code == 201
    assert response.json()["outside_trip_range"] is False


def test_update_destination_dates_flips_the_flag(auth_client: TestClient, trip: Trip) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "trip_id": trip.id,
            "start_date": "2026-09-03",
            "end_date": "2026-09-05",
        },
    ).json()
    assert created["outside_trip_range"] is False

    response = auth_client.patch(
        f"{DESTINATIONS_PATH}/{created['id']}", json={"end_date": "2026-10-01"}
    )

    assert response.status_code == 200
    assert response.json()["outside_trip_range"] is True


def test_update_destination_detaching_its_trip_clears_the_flag(
    auth_client: TestClient, trip: Trip
) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "trip_id": trip.id,
            "start_date": "2026-08-25",
            "end_date": "2026-09-05",
        },
    ).json()
    assert created["outside_trip_range"] is True

    response = auth_client.patch(f"{DESTINATIONS_PATH}/{created['id']}", json={"trip_id": None})

    assert response.status_code == 200
    assert response.json()["outside_trip_range"] is False


def test_get_destination_includes_the_containment_flag(auth_client: TestClient, trip: Trip) -> None:
    created = auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Kyoto",
            "latitude": 35.0116,
            "longitude": 135.7681,
            "trip_id": trip.id,
            "start_date": "2026-08-25",
            "end_date": "2026-09-05",
        },
    ).json()

    response = auth_client.get(f"{DESTINATIONS_PATH}/{created['id']}")

    assert response.status_code == 200
    assert response.json()["outside_trip_range"] is True


def test_list_destinations_computes_the_flag_for_every_row(
    auth_client: TestClient, trip: Trip
) -> None:
    auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "In range",
            "latitude": 1.0,
            "longitude": 1.0,
            "trip_id": trip.id,
            "start_date": "2026-09-03",
            "end_date": "2026-09-05",
        },
    )
    auth_client.post(
        DESTINATIONS_PATH,
        json={
            "name": "Out of range",
            "latitude": 2.0,
            "longitude": 2.0,
            "trip_id": trip.id,
            "start_date": "2026-08-01",
            "end_date": "2026-08-02",
        },
    )

    response = auth_client.get(DESTINATIONS_PATH, params={"trip_id": trip.id})

    assert response.status_code == 200
    by_name = {row["name"]: row["outside_trip_range"] for row in response.json()}
    assert by_name == {"In range": False, "Out of range": True}
