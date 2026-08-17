"""Nominatim geocoding — the single caller of OpenStreetMap's search API.

research.md R-001: called from the backend, never the browser, so the required identifying
`User-Agent` and Nominatim's roughly-one-request-per-second usage policy are satisfied by one
identified caller rather than left to a browser making the request directly. `httpx2`, not
`httpx` — see `pyproject.toml` — and this module is its second caller, after FastAPI's own test
client.
"""

import httpx2 as httpx

from app.schemas import LocationCandidate

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

# Nominatim's usage policy requires a descriptive User-Agent identifying the calling application
# (research.md R-001) — an unidentified or browser-default User-Agent risks the request being
# refused outright, independent of anything this product controls.
USER_AGENT = "VictorTracker/0.3 (personal travel map; single owner)"

# Enough for the owner to tell two same-named places apart (`LocationCandidate.address`) without
# scrolling a long list on a 375px screen. Not specified by spec.md — an implementation choice.
RESULT_LIMIT = 5

TIMEOUT_SECONDS = 5.0


class GeocodingError(Exception):
    """Raised when Nominatim cannot be reached, times out, answers with an error status, or
    answers with a body this module cannot read.

    FR-012's "search failed, retry" — the 502 `searchLocations` declares in
    `contracts/openapi.yaml` — is this exception reaching `app/api/locations.py`. Kept separate
    from "zero results", which is a *successful* call that answered with nothing: an empty list
    is a normal outcome of a search (FR-012), not an error, so it is a plain `[]` return rather
    than this exception.
    """


def search(query: str) -> list[LocationCandidate]:
    """Resolve a typed place name to zero or more candidate coordinates (FR-011, FR-012).

    `name` is derived from the first segment of Nominatim's `display_name` rather than a `name`
    field, which `format=jsonv2` does not reliably include — `display_name` is the one field
    Nominatim's docs guarantee on every result.
    """
    try:
        response = httpx.get(
            NOMINATIM_SEARCH_URL,
            params={"q": query, "format": "jsonv2", "limit": RESULT_LIMIT},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GeocodingError(f"Nominatim request failed: {exc}") from exc

    # A response that arrived but cannot be read is still a failed search, not an empty one.
    #
    # Raised as `GeocodingError` so it becomes the contract's **502** — "the search itself failed,
    # retry" — rather than escaping as an unhandled 500 with a `text/plain` body, which is what a
    # missing key or a non-numeric coordinate did before the Final Phase `reviewer` pass flagged
    # the shape (T058, 2026-08-17). Returning `[]` would be the worse repair of the two: FR-012
    # turns on the owner being able to tell "no matches" from "the search broke", and a silent
    # empty list collapses exactly that distinction.
    try:
        results = response.json()
        return [
            LocationCandidate(
                name=result["display_name"].split(",", 1)[0].strip(),
                address=result["display_name"],
                latitude=float(result["lat"]),
                longitude=float(result["lon"]),
            )
            for result in results
        ]
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise GeocodingError(f"Nominatim returned an unreadable response: {exc!r}") from exc
