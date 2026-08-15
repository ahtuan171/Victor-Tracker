"""The Destination routes. `listDestinations` (T012) and `createDestination` (T013) land here
first (User Story 1); `getDestination` (T023), `updateDestination`/`deleteDestination` at
T024-T025 (User Story 2); FR-017's containment check at T039 (User Story 3).
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, select

from app.auth import CurrentCreator
from app.db import SessionDep
from app.models import Destination, DestinationStatus, Photograph
from app.schemas import (
    DestinationCreate,
    DestinationDetail,
    DestinationRead,
    DestinationUpdate,
    ErrorResponse,
    PhotographRead,
)
from app.services.object_storage import read_url

router = APIRouter(prefix="/destinations", tags=["destinations"])


def get_or_404(session: SessionDep, destination_id: int) -> Destination:
    """Fetch one Destination or raise the contract's 404 — the shared lookup every
    id-addressed route in this file uses, matching `001`'s `get_or_404` precedent
    (`content_items.py`) so "no such destination" reads identically whichever verb asked.
    """
    destination = session.get(Destination, destination_id)
    if destination is None:
        raise HTTPException(status_code=404, detail="No such destination.")
    return destination


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


@router.get(
    "/{destination_id}",
    response_model=DestinationDetail,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such destination."},
    },
    summary="Read one Destination, with its note and photograph URLs",
)
def get_destination(
    destination_id: int,
    session: SessionDep,
    _creator: CurrentCreator,
) -> DestinationDetail:
    """Always includes `note` and `photographs` regardless of `status` — FR-009's "no gallery on
    a non-Visited pin" is a **frontend** display rule (INV-3, data-model.md), not a reason for
    the API to withhold data that exists. Each photograph's `url` is a presigned GET, minted
    fresh on this call (FR-024) — never a stored or cached link.
    """
    destination = get_or_404(session, destination_id)
    photographs = session.exec(
        select(Photograph)
        .where(col(Photograph.destination_id) == destination_id)
        .order_by(col(Photograph.id))
    ).all()

    photograph_reads = []
    for photograph in photographs:
        assert photograph.id is not None, "a row loaded from the database always has an id"
        photograph_reads.append(
            PhotographRead(
                id=photograph.id,
                url=read_url(photograph.object_key),
                created_at=photograph.created_at,
            )
        )

    assert destination.id is not None, "a row loaded from the database always has an id"
    return DestinationDetail(
        id=destination.id,
        trip_id=destination.trip_id,
        name=destination.name,
        latitude=destination.latitude,
        longitude=destination.longitude,
        start_date=destination.start_date,
        end_date=destination.end_date,
        status=destination.status,
        created_at=destination.created_at,
        updated_at=destination.updated_at,
        note=destination.note,
        photographs=photograph_reads,
    )


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


@router.patch(
    "/{destination_id}",
    response_model=DestinationRead,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such destination."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
    },
    summary="Change one or more fields of a Destination",
)
def update_destination(
    destination_id: int,
    body: DestinationUpdate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> Destination:
    """Partial update, `001`'s semantics — `exclude_unset=True` yields exactly the fields the
    caller sent, including an explicit `null` on `trip_id`/`start_date`/`end_date`/`note`
    (FR-020's detach path among them), and touches nothing else.

    Covers FR-016 (edit), FR-006 (note) and FR-028 (status, any direction — no validation beyond
    `DestinationUpdate` already requiring one of the three enum values). Changing `name` does
    **not** re-geocode; a coordinate only changes when the caller sends new `latitude`/`longitude`
    explicitly, matching the contract's own note that a label edit must never move a pin.
    """
    destination = get_or_404(session, destination_id)
    updates = body.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(destination, field, value)

    session.add(destination)
    session.commit()
    session.refresh(destination)
    return destination


@router.delete(
    "/{destination_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such destination."},
    },
    summary="Delete a Destination and its photographs",
)
def delete_destination(
    destination_id: int,
    session: SessionDep,
    _creator: CurrentCreator,
) -> None:
    """FR-016. Cascades to `photograph` rows via `ON DELETE CASCADE` (data-model.md) — nothing
    here has to delete them explicitly. Does **not** touch the parent Trip, if any.

    No return annotation of `Response` and no `response_model`, matching `001`'s
    `delete_content_item` precedent: a 204 must carry no body.
    """
    session.delete(get_or_404(session, destination_id))
    session.commit()
