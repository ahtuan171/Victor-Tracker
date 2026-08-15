"""The per-Destination photograph routes: upload-url, confirm, delete (T026-T028, User Story 2),
calling `app/services/object_storage.py` (T007).

Prefixed `/destinations` rather than its own resource root: every operation here is
`/destinations/{destination_id}/photos...` in `contracts/openapi.yaml` — a photograph has no
identity apart from the Destination it belongs to. Kept in its own module rather than
`destinations.py` because the upload flow (mint a presigned URL, then confirm) is a distinct
concern from Destination CRUD, matching `plan.md`'s Project Structure.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.api.destinations import get_or_404
from app.auth import CurrentCreator
from app.db import SessionDep
from app.models import Photograph
from app.schemas import ErrorResponse, PhotographCreate, PhotographRead, PhotoUploadUrl
from app.services.object_storage import create_upload_url, read_url

router = APIRouter(prefix="/destinations", tags=["photographs"])


@router.post(
    "/{destination_id}/photos/upload-url",
    response_model=PhotoUploadUrl,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such destination."},
    },
    summary="Mint a short-lived presigned URL for uploading one photograph",
)
def create_photo_upload_url(
    destination_id: int,
    session: SessionDep,
    _creator: CurrentCreator,
) -> PhotoUploadUrl:
    """FR-023. The browser `PUT`s image bytes straight to the returned `upload_url` — this
    backend never receives them — then confirms via `POST .../photos` with the same `object_key`.
    """
    get_or_404(session, destination_id)
    return create_upload_url(destination_id)


@router.post(
    "/{destination_id}/photos",
    response_model=PhotographRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such destination."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
    },
    summary="Confirm a photograph upload and record it against a Destination",
)
def create_photograph(
    destination_id: int,
    body: PhotographCreate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> PhotographRead:
    """FR-023, FR-025. Called **after** the browser has already `PUT` the image bytes to the
    presigned URL from `POST .../photos/upload-url` — this call never receives image bytes, only
    the `object_key` that upload already used. No HEAD request to R2 on this path: a photograph
    pointing at a key that never finished uploading fails visibly the first time its presigned GET
    URL is requested, which the contract accepts as honest for a single-owner tool.
    """
    get_or_404(session, destination_id)
    photograph = Photograph(destination_id=destination_id, object_key=body.object_key)
    session.add(photograph)
    session.commit()
    session.refresh(photograph)
    assert photograph.id is not None, "a row loaded from the database always has an id"
    return PhotographRead(
        id=photograph.id,
        url=read_url(photograph.object_key),
        created_at=photograph.created_at,
    )


@router.delete(
    "/{destination_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such destination or photograph."},
    },
    summary="Remove one photograph from a Destination",
)
def delete_photograph(
    destination_id: int,
    photo_id: int,
    session: SessionDep,
    _creator: CurrentCreator,
) -> None:
    """Not named as its own line in `spec.md`'s FR list, but implied by FR-016's "edit... a
    Destination" — removing one wrongly attached image is ordinary editing. Deletes the database
    row; does **not** delete the R2 object (no requirement asks for storage reclamation, and a
    single-owner account's photo volume does not justify building it here).
    """
    get_or_404(session, destination_id)
    photograph = session.exec(
        select(Photograph)
        .where(col(Photograph.id) == photo_id)
        .where(col(Photograph.destination_id) == destination_id)
    ).first()
    if photograph is None:
        raise HTTPException(status_code=404, detail="No such destination or photograph.")
    session.delete(photograph)
    session.commit()
