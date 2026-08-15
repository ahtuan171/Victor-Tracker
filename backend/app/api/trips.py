"""The Trip routes (T036-T037, User Story 3): CRUD plus the cascade delete FR-018 describes.

Same shape as `destinations.py`'s own routes — a shared `get_or_404`, partial `PATCH` via
`exclude_unset=True`, a `DELETE` that relies on the database's `ON DELETE CASCADE` rather than
deleting Destinations (and their Photographs) by hand.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.auth import CurrentCreator
from app.db import SessionDep
from app.models import Trip
from app.schemas import ErrorResponse, TripCreate, TripRead, TripUpdate

router = APIRouter(prefix="/trips", tags=["trips"])


def get_or_404(session: SessionDep, trip_id: int) -> Trip:
    """Fetch one Trip or raise the contract's 404 — matching `destinations.py`'s own helper."""
    trip = session.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="No such trip.")
    return trip


@router.get(
    "",
    response_model=list[TripRead],
    responses={401: {"model": ErrorResponse, "description": "No valid token."}},
    summary="List every Trip",
)
def list_trips(session: SessionDep, _creator: CurrentCreator) -> list[Trip]:
    """FR-014. No pagination and no filter — constitution VII's single-owner scope makes a
    personal number of trips the only volume this has to handle.
    """
    return list(session.exec(select(Trip).order_by(col(Trip.id))).all())


@router.post(
    "",
    response_model=TripRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
    },
    summary="Create a Trip",
)
def create_trip(
    body: TripCreate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> Trip:
    """FR-014. `name`/`start_date`/`end_date` are required; `status` defaults to `wishlist`,
    matching `trip.status`'s own column default.
    """
    trip = Trip(**body.model_dump())
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.get(
    "/{trip_id}",
    response_model=TripRead,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such trip."},
    },
    summary="Read one Trip",
)
def get_trip(trip_id: int, session: SessionDep, _creator: CurrentCreator) -> Trip:
    return get_or_404(session, trip_id)


@router.patch(
    "/{trip_id}",
    response_model=TripRead,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such trip."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
    },
    summary="Change one or more fields of a Trip",
)
def update_trip(
    trip_id: int,
    body: TripUpdate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> Trip:
    """Partial update, `001`'s semantics. None of `TripUpdate`'s fields may be sent as an
    explicit `null` (see its own docstring) — `trip`'s columns are all `NOT NULL`.
    """
    trip = get_or_404(session, trip_id)
    updates = body.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(trip, field, value)

    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


@router.delete(
    "/{trip_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such trip."},
    },
    summary="Delete a Trip and every Destination that belongs to it",
)
def delete_trip(trip_id: int, session: SessionDep, _creator: CurrentCreator) -> None:
    """FR-018. Cascades to every Destination whose `trip_id` is this Trip, and to their
    Photographs (`ON DELETE CASCADE`, data-model.md) — nothing here deletes them by hand. The
    frontend confirmation naming what will be lost happens before this call; the API performs the
    delete unconditionally once called, the same division `deleteDestination` draws.
    """
    session.delete(get_or_404(session, trip_id))
    session.commit()
