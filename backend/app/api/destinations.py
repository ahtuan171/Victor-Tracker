"""The Destination routes. `listDestinations` (T012) and `createDestination` (T013) land here
first (User Story 1); `getDestination`/`updateDestination`/`deleteDestination` at T023-T025
(User Story 2); FR-017's containment check at T039 (User Story 3).
"""

from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlmodel import col, select

from app.auth import CurrentCreator
from app.db import SessionDep
from app.models import Destination, DestinationStatus
from app.schemas import DestinationCreate, DestinationRead, ErrorResponse

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


@router.post(
    "",
    response_model=DestinationRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
    },
    summary="Create a Destination",
)
def create_destination(
    body: DestinationCreate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> Destination:
    """FR-015, FR-020, FR-021. `trip_id` is optional (FR-020) — omit it for a place marked
    independent of any Trip. `latitude`/`longitude` are required on this call: this operation is
    reached **after** `GET /locations/search` has already resolved a name to coordinates
    (FR-011); it does not itself geocode a free-text name.

    **INV-1** (coordinates never null on a stored row) is enforced entirely by
    `DestinationCreate` requiring both fields with no default — there is no code path here that
    can construct a row without them, so there is nothing further to check before the insert
    (data-model.md: unlike `001`'s INV-1, this one has no `CHECK` expressible from the columns
    alone, since (0,0) is a real coordinate).
    """
    destination = Destination(**body.model_dump())
    session.add(destination)
    session.commit()
    session.refresh(destination)
    return destination
