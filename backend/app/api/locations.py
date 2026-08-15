"""`GET /locations/search` (T038, User Story 3), proxying Nominatim via
`app/services/geocoding.py` (T006) — the backend calls it, never the browser (research.md R-001).

Imports the **module**, not `search` itself, and calls `geocoding.search(...)` — deliberately not
`from app.services.geocoding import search`. `destinations.py`/`photographs.py` both had to learn
that a name imported that way is bound *into the importing module*, so their own tests patch the
importer, not the definer. Importing the module instead means there is no second bound name to
find: `tests/test_locations.py` patches `app.services.geocoding.search` directly, at its own
definition.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.auth import CurrentCreator
from app.schemas import ErrorResponse, LocationCandidate
from app.services import geocoding

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get(
    "/search",
    response_model=list[LocationCandidate],
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
        502: {"model": ErrorResponse, "description": "Nominatim was unreachable or timed out."},
    },
    summary="Resolve a typed place name to candidate coordinates",
)
def search_locations(
    q: Annotated[str, Query(min_length=1, description="The place name as typed by the owner.")],
    _creator: CurrentCreator,
) -> list[LocationCandidate]:
    """FR-011, FR-012. Zero results is a normal `200` with an empty array — no result matching a
    search is an ordinary outcome, not an error. Only a request that could not be answered at all
    (Nominatim unreachable, timed out, or erroring) is the `502` the contract distinguishes from
    it. The message is generic rather than the raw transport exception — the creator needs "try
    again", not this backend's HTTP client internals.
    """
    try:
        return geocoding.search(q)
    except geocoding.GeocodingError as exc:
        raise HTTPException(status_code=502, detail="Location search failed. Try again.") from exc
