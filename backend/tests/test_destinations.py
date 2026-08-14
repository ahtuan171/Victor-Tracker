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
"""

from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Destination, Trip

DESTINATIONS_PATH = "/destinations"

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
