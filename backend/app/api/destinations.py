"""The Destination routes. `listDestinations` (T012) and `createDestination` (T013) land here
first (User Story 1); `getDestination`/`updateDestination`/`deleteDestination` at T023-T025
(User Story 2); FR-017's containment check at T039 (User Story 3).
"""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import col, select

from app.auth import CurrentCreator
from app.db import SessionDep
from app.models import Destination, DestinationStatus
from app.schemas import DestinationRead, ErrorResponse

router = APIRouter(prefix="/destinations", tags=["destinations"])


@router.get(
    "",
    response_model=list[DestinationRead],
    responses={401: {"model": ErrorResponse, "description": "No valid token."}},
    summary="List Destinations, optionally narrowed",
)
def list_destinations(
    session: SessionDep,
    _creator: CurrentCreator,
    trip_id: Annotated[
        int | None,
        Query(description="Narrow to one Trip's Destinations (the organising view, User Story 3)."),
    ] = None,
    status: Annotated[DestinationStatus | None, Query(description="FR-010's map filter.")] = None,
) -> list[Destination]:
    """FR-001, FR-010, FR-019. With no query parameters, returns every Destination regardless of
    Trip membership — this is the map's own read, and every Destination renders on it whether or
    not it has a Trip.

    Ordered by `id` ascending — the contract states no ordering requirement for this operation
    (unlike `001`'s content-item list, whose `created_at DESC, id DESC` is contract-documented),
    so this is a determinism choice for consistent test results, not a promise the frontend
    depends on.
    """
    query = select(Destination)

    if trip_id is not None:
        query = query.where(col(Destination.trip_id) == trip_id)

    if status is not None:
        query = query.where(col(Destination.status) == status)

    query = query.order_by(col(Destination.id))

    return list(session.exec(query).all())
