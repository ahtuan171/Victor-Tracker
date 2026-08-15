"""`GET /locations/search` (T046, User Story 3), against a stubbed Nominatim — no test in this
file reaches the real `nominatim.openstreetmap.org`.

Patched on `app.services.geocoding.search` directly — see `app/api/locations.py`'s own docstring
for why importing the module rather than the function removes the bound-name trap
`test_destinations.py`/`test_photographs.py` both have to work around.
"""

import pytest
from fastapi.testclient import TestClient

from app.schemas import LocationCandidate
from app.services.geocoding import GeocodingError

LOCATIONS_SEARCH_PATH = "/locations/search"


def test_search_locations_returns_candidates(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.services.geocoding.search",
        lambda query: [
            LocationCandidate(
                name="Kyoto", address="Kyoto, Japan", latitude=35.0116, longitude=135.7681
            )
        ],
    )

    response = auth_client.get(LOCATIONS_SEARCH_PATH, params={"q": "Kyoto"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0] == {
        "name": "Kyoto",
        "address": "Kyoto, Japan",
        "latitude": 35.0116,
        "longitude": 135.7681,
    }


def test_search_locations_zero_matches_is_200_with_an_empty_array(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """FR-012: no result matching a search is an ordinary outcome, not an error — distinct from
    the 502 below, which is the search itself failing to run.
    """
    monkeypatch.setattr("app.services.geocoding.search", lambda query: [])

    response = auth_client.get(LOCATIONS_SEARCH_PATH, params={"q": "asdkjhasdkjhasdkjh"})

    assert response.status_code == 200
    assert response.json() == []


def test_search_locations_unreachable_nominatim_is_502(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(query: str) -> list[LocationCandidate]:
        raise GeocodingError("Nominatim request failed: connection refused")

    monkeypatch.setattr("app.services.geocoding.search", _raise)

    response = auth_client.get(LOCATIONS_SEARCH_PATH, params={"q": "Kyoto"})

    assert response.status_code == 502
    assert response.json()["detail"]


def test_search_locations_requires_a_credential(client: TestClient) -> None:
    response = client.get(LOCATIONS_SEARCH_PATH, params={"q": "Kyoto"})
    assert response.status_code == 401


def test_search_locations_422s_on_an_empty_query(auth_client: TestClient) -> None:
    response = auth_client.get(LOCATIONS_SEARCH_PATH, params={"q": ""})
    assert response.status_code == 422


def test_search_locations_422s_with_no_query_at_all(auth_client: TestClient) -> None:
    response = auth_client.get(LOCATIONS_SEARCH_PATH)
    assert response.status_code == 422
