"""The content-item routes. Create and list at T030 and T031; the rest arrive with their stories.

`GET /content-items/{id}`, `PATCH`, and `DELETE` land at T049 and T050, and the two query parameters
this file does not implement yet — `date_from`/`date_to` at T037, `platform` at T060 — belong to the
stories that need them. `contracts/openapi.yaml` describes the finished module, so this file being a
subset of it is incremental delivery; a parameter appearing here *before* its task would be the
speculative build constitution VII forbids.

Two things here are the whole reason this module is not a thin CRUD wrapper:

* **INV-1 is checked at the boundary, before the write.** The `CHECK` constraint in the migration is
  a backstop for anything that reaches the database by another route — a psql session, a future
  migration — not the mechanism. A constraint reached by an HTTP request is a 500 carrying a
  Postgres error string, and the post-review pass in `tasks.md` recorded that exact defect.
* **A title is stripped before it is validated**, so INV-2 is enforced by the request model rather
  than by the constraint. `minLength: 1` alone accepts a single space.
"""

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, StringConstraints
from sqlmodel import col, select

from app.auth import CurrentCreator
from app.db import SessionDep
from app.models import ContentItem, Platform, Status
from app.schemas import ErrorResponse, InvariantErrorResponse, InvariantViolationError

router = APIRouter(prefix="/content-items", tags=["content-items"])

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
"""INV-2, expressed where it can produce a 422 rather than a 500.

`strip_whitespace` is not cosmetic and it is not just normalisation — it is what makes `min_length`
mean what INV-2 means. Pydantic strips before it measures, so `"   "` becomes `""` and fails the
length check; without the strip it is three characters long and passes, then hits
`length(trim(title)) > 0` in the database. Stripping also stores the title the creator meant: two
titles differing only in leading spaces are one idea, and a stored `" Ring light"` sorts wrongly for
the rest of the item's life.

`max_length` matches both the contract and `String(200)`, so the column width can never be the thing
that rejects a request.
"""

Hook = Annotated[str, StringConstraints(max_length=500)]

PublishedUrl = Annotated[
    str, StringConstraints(max_length=2048, pattern=r"^https?://", strip_whitespace=True)
]
"""Bounded and scheme-restricted here, not at T063.

T063 writes the *tests* for `javascript:` and `data:` URLs and for the length limit. The constraint
itself has to exist from the moment the field is first writable, which is this task: `POST` accepts
`published_url` today, and an unbounded one is a 500 from `String(2048)` — one of the six defects
the post-review pass in `tasks.md` found. The pattern is an allowlist of two schemes rather than a
denial list of dangerous ones, because a denial list is only as good as its author's imagination and
this value is rendered as an `href` (FR-019, T065).
"""


class ContentItemCreate(BaseModel):
    """The contract's `ContentItemCreate`. Title is the only required field — that is FR-005.

    `status` and `platform` are accepted even though the capture sheet sends neither, because the
    item sheet at T052 does and because INV-1 has to be reachable on create as well as on update.
    Refusing them here would move the invariant's first test to T049 and leave a create path that
    could not express a posted item at all.
    """

    title: Title
    hook: Hook | None = None
    platform: Platform | None = None
    scheduled_date: date | None = None
    status: Status = Status.IDEA
    published_url: PublishedUrl | None = None


class ContentItemRead(BaseModel):
    """The contract's `ContentItem`, and the single response model for every route in this file.

    A separate model rather than serialising `ContentItem` directly, which is the one place this
    module departs from tech-defaults' "one class for DB model and API schema". The divergence is
    real: `ContentItem.id` is `int | None` because it is None until the insert, and handing that to
    FastAPI generates a schema whose `id` is nullable — contradicting the contract, which lists `id`
    as required, and telling a generated client to null-check a value that is never null.

    Everything else is column-for-column, and `test_content_items.py` asserts the key set exactly in
    both directions so a field can neither go missing nor appear uninvited.
    """

    id: int
    title: str
    hook: str | None
    platform: Platform | None
    scheduled_date: date | None
    status: Status
    published_url: str | None
    created_at: datetime
    updated_at: datetime


def check_invariant_1(item_status: Status, platform: Platform | None) -> None:
    """INV-1: a platform is required past `idea` (FR-009, FR-009a).

    Both non-`idea` statuses are guarded, not just `draft`. `idea -> posted` directly is a legal
    transition (data-model.md), so a guard written as `status == DRAFT` lets exactly one path
    through to the CHECK constraint — and it is the path a creator who films and publishes in one
    sitting takes.

    Shared rather than inlined because T049's `PATCH` is the second caller and raises the *other*
    code from the same rule: advancing without a platform and clearing a platform while advanced are
    one invariant, and the contract distinguishes them only to give the creator the right next step.
    """
    if item_status is not Status.IDEA and platform is None:
        raise InvariantViolationError(
            "platform_required",
            "Pick a platform before moving this item out of ideas.",
        )


@router.post(
    "",
    response_model=ContentItemRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        409: {
            "model": InvariantErrorResponse,
            "description": "The item as submitted would violate INV-1.",
        },
    },
    summary="Create a content item",
)
def create_content_item(
    body: ContentItemCreate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> ContentItem:
    """FR-005. Capture costs one field, and everything else is optional.

    `_creator` is depended on for its side effects and deliberately unused: it is what makes this
    route refuse an unauthenticated caller (FR-002) and what attaches `X-Access-Token` when the
    presented token is past half-life (FR-002a). Removing it because "nothing reads the creator"
    would silently make the endpoint public — there is no owner column to notice its absence.
    """
    check_invariant_1(body.status, body.platform)

    item = ContentItem(**body.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.get(
    "",
    response_model=list[ContentItemRead],
    responses={401: {"model": ErrorResponse, "description": "No valid token."}},
    summary="List content items",
)
def list_content_items(
    session: SessionDep,
    _creator: CurrentCreator,
    scheduled: Annotated[
        Literal["none"] | None,
        Query(description="`none` returns only undated items — the backlog drawer (FR-011)."),
    ] = None,
) -> list[ContentItem]:
    """FR-011 and the calendar's read, which are the same query with one clause different.

    `Literal["none"]` rather than a free string: the contract's enum has exactly one member, so
    `scheduled=all` is a typo and must be refused rather than quietly treated as "no filter". That
    distinction is invisible in the response body, which is why it gets a 422.

    **Ordering is `created_at DESC, id DESC`, and the second key is not decoration.** `created_at`
    alone is not a total order: Postgres `now()` is transaction time, so anything written in one
    transaction shares a timestamp, and the row order Postgres returns for ties is not stable
    between reads. The creator-visible symptom is a backlog that reshuffles on refresh, which reads
    as data loss. `id` is monotonic with insertion, so it never contradicts `created_at` — it only
    decides what `created_at` leaves open.
    """
    query = select(ContentItem)

    if scheduled == "none":
        query = query.where(col(ContentItem.scheduled_date).is_(None))

    query = query.order_by(col(ContentItem.created_at).desc(), col(ContentItem.id).desc())

    return list(session.exec(query).all())
