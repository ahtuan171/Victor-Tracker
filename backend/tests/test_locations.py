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


# --- An unreadable Nominatim body (T058, 2026-08-17) -----------------------------------------
#
# The Final Phase `reviewer` pass flagged `geocoding.search` indexing `display_name`/`lat`/`lon`
# and calling `float()` with no guard: a response that arrived but could not be parsed escaped as
# an unhandled 500 instead of the 502 the contract declares. These tests go through the real
# `geocoding.search` against a stubbed transport, which is the only level the parsing lives at.


@pytest.mark.parametrize(
    ("payload", "why"),
    [
        ([{"lat": "35.0", "lon": "135.7"}], "display_name missing"),
        ([{"display_name": "Kyoto, Japan", "lon": "135.7"}], "lat missing"),
        ([{"display_name": "Kyoto, Japan", "lat": "north", "lon": "135.7"}], "lat not a number"),
        ([{"display_name": None, "lat": "35.0", "lon": "135.7"}], "display_name not a string"),
        ({"unexpected": "shape"}, "top level is not a list of results"),
    ],
)
def test_search_raises_geocoding_error_on_an_unreadable_body(
    monkeypatch: pytest.MonkeyPatch, payload: object, why: str
) -> None:
    import httpx2 as httpx

    from app.services import geocoding

    class _Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> object:
            return payload

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: _Response())

    with pytest.raises(GeocodingError):
        geocoding.search("Kyoto")


def test_search_still_parses_a_well_formed_body(monkeypatch: pytest.MonkeyPatch) -> None:
    """The control. Every case above is an `assert raises`, which is green against a `search`
    that raises unconditionally — so this is what makes them evidence about *malformed* bodies
    rather than about a function that stopped working.
    """
    import httpx2 as httpx

    from app.services import geocoding

    class _Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> object:
            return [
                {"display_name": "Kyoto, Kyoto Prefecture, Japan", "lat": "35.0", "lon": "135.7"}
            ]

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: _Response())

    candidates = geocoding.search("Kyoto")

    assert len(candidates) == 1
    assert candidates[0].name == "Kyoto"
    assert candidates[0].latitude == 35.0


def test_an_unreadable_body_surfaces_as_the_contract_s_502(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The end the frontend actually sees: FR-012 turns on "the search failed, retry" being
    distinguishable from "no matches", so an unreadable body must not become a 200 with `[]`.
    """
    import httpx2 as httpx

    class _Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> object:
            return [{"lat": "35.0"}]

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: _Response())

    response = auth_client.get(LOCATIONS_SEARCH_PATH, params={"q": "Kyoto"})

    assert response.status_code == 502
    assert response.json() == {"detail": "Location search failed. Try again."}
