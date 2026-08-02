"""The content-item routes. Create and list at T030 and T031, the by-id three at T049 and T050.

All five operations the module needs now exist. The one query parameter this file does not implement
— `platform` at T060 — belongs to the story that needs it. `contracts/openapi.yaml` describes the
finished module, so this file being a subset of it is incremental delivery; a parameter appearing
here *before* its task would be the speculative build constitution VII forbids.

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

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, StringConstraints, model_validator
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


class ContentItemUpdate(BaseModel):
    """The contract's `ContentItemUpdate`: every field optional, and *optional* means two things.

    This model is where FR-023's partial-update semantics live, and the whole of it rests on
    pydantic's distinction between a field that was **omitted** and one that was set to **null**.
    Both are `None` on the instance; only `model_fields_set` tells them apart, which is why the
    route below reads `model_dump(exclude_unset=True)` and never `model_dump()`. Dumping everything
    would turn every `PATCH` into a full replacement that silently clears whatever the caller left
    out — the single most destructive way this endpoint can be written, and one that passes any test
    whose request happens to set every field.

    `status` is the one field with no null spelling: the column is `NOT NULL` with a default, so
    "clear the status" has no meaning. The contract agrees — it `$ref`s `Status` directly while
    every other nullable field is a union with `"null"`.

    The field types are shared with `ContentItemCreate` (`Title`, `Hook`, `PublishedUrl`) rather
    than restated, so INV-2's strip-then-measure rule and the URL scheme allowlist cannot drift
    between the two write paths. A second hand-written copy is exactly where they would.
    """

    title: Title | None = None
    hook: Hook | None = None
    platform: Platform | None = None
    scheduled_date: date | None = None
    status: Status | None = None
    published_url: PublishedUrl | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "ContentItemUpdate":
        """The contract's `minProperties: 1`.

        An empty body is refused rather than treated as a no-op 200. A `PATCH` that changed nothing
        and answered 200 is indistinguishable from one that worked, so a frontend bug that dropped
        its payload would look like a successful save — and with optimistic updates (R-007) the
        creator would see the change stick on screen and vanish on the next load.
        """
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        return self


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


def check_invariant_1(
    item_status: Status,
    platform: Platform | None,
    *,
    clearing_platform: bool = False,
) -> None:
    """INV-1: a platform is required past `idea` (FR-009, FR-009a).

    Both non-`idea` statuses are guarded, not just `draft`. `idea -> posted` directly is a legal
    transition (data-model.md), so a guard written as `status == DRAFT` lets exactly one path
    through to the CHECK constraint — and it is the path a creator who films and publishes in one
    sitting takes.

    Shared rather than inlined because `PATCH` is the second caller and raises the *other* code from
    the same rule: advancing without a platform and clearing a platform while advanced are one
    invariant, and the contract distinguishes them only to give the creator the right next step.

    **There is one condition here, and `clearing_platform` chooses the instruction, not the rule.**
    The stored predicate — `status = 'idea' OR platform IS NOT NULL` — cannot tell the two
    approaches apart and should not: both leave the row in the same forbidden state. What differs is
    creator does next, so `platform_required` says "pick one" and `platform_locked` says "move it
    back to ideas first" (T053 renders it beside the platform control). Writing this as two `if`
    statements is the parallel check `backend/AGENTS.md` warns against — the two would then be free
    to disagree about what "past idea" means.

    **Both callers pass the item as it would be *after* the change, never as stored.** Validating an
    incoming status against the stored platform would refuse
    `{"status": "draft", "platform": "tiktok"}` on a title-only idea, leaving no single request that
    can advance it and the creator alternating between two 409s.
    """
    if item_status is not Status.IDEA and platform is None:
        if clearing_platform:
            raise InvariantViolationError(
                "platform_locked",
                "Move this item back to ideas before removing its platform.",
            )
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
    date_from: Annotated[
        date | None,
        Query(description="Inclusive lower bound on `scheduled_date` (FR-013)."),
    ] = None,
    date_to: Annotated[
        date | None,
        Query(description="Inclusive upper bound on `scheduled_date` (FR-013)."),
    ] = None,
) -> list[ContentItem]:
    """FR-011, FR-012 and FR-013 — the backlog read and the calendar read, one query apart.

    `Literal["none"]` rather than a free string: the contract's enum has exactly one member, so
    `scheduled=all` is a typo and must be refused rather than quietly treated as "no filter". That
    distinction is invisible in the response body, which is why it gets a 422. The same reasoning
    makes the two bounds `date` rather than `str`: a bound the endpoint cannot parse must be a 422,
    because a silently dropped filter returns *every* item and on a calendar that reads as the grid
    working rather than as the filter failing.

    **Both bounds are inclusive**, which is what the contract declares and what T036 pins from both
    sides. `>=` and `<=`, not `>` and `<`: an off-by-one here hides the first or last day of every
    period the creator opens.

    **Neither bound can match an undated item, and no clause here says so.** `NULL >= '2026-09-01'`
    is `NULL`, not `TRUE`, so SQL's three-valued logic does the work — which is exactly the kind of
    behaviour that disappears in a rewrite, because nothing in this function looks like the line
    implementing it. It is the behaviour the calendar needs (an item with no date is on no day of
    the grid, FR-012) and the reason `scheduled=none` remains the *only* way to reach the backlog.

    Two combinations therefore always return an empty array, and both are deliberate rather than
    special-cased. `scheduled=none` with a date bound asks for a row that is both NULL and within a
    range; `date_from > date_to` asks for a day after itself. The contract declares these parameters
    as independent filters with no stated interaction, so refusing either pair with a 422 would be
    inventing a response the contract does not carry — and no surface issues either query, because
    the drawer sends `scheduled=none` and period navigation always builds `from <= to`.

    **Ordering is `created_at DESC, id DESC`, and the second key is not decoration.** `created_at`
    alone is not a total order: Postgres `now()` is transaction time, so anything written in one
    transaction shares a timestamp, and the row order Postgres returns for ties is not stable
    between reads. The creator-visible symptom is a backlog that reshuffles on refresh, which reads
    as data loss. `id` is monotonic with insertion, so it never contradicts `created_at` — it only
    decides what `created_at` leaves open. Applied once, after every filter, so it holds on all four
    paths through this function rather than on the one a test happened to exercise.
    """
    query = select(ContentItem)

    if scheduled == "none":
        query = query.where(col(ContentItem.scheduled_date).is_(None))

    if date_from is not None:
        query = query.where(col(ContentItem.scheduled_date) >= date_from)

    if date_to is not None:
        query = query.where(col(ContentItem.scheduled_date) <= date_to)

    query = query.order_by(col(ContentItem.created_at).desc(), col(ContentItem.id).desc())

    return list(session.exec(query).all())


def get_or_404(session: SessionDep, item_id: int) -> ContentItem:
    """Fetch one item or raise the contract's 404.

    Shared by the two by-id routes because "no such item" must read identically whichever verb asked
    — a `GET` and a `PATCH` disagreeing about the message is the kind of thing nobody notices until
    it is on a screen. `HTTPException` rather than `InvariantViolationError`: a 404 carries the
    plain `{detail}` shape, and only the 409 may add a `code` key (`tests/test_errors.py`).
    """
    item = session.get(ContentItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="No such item.")
    return item


@router.get(
    "/{item_id}",
    response_model=ContentItemRead,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such item."},
    },
    summary="Fetch one content item",
)
def get_content_item(
    item_id: int,
    session: SessionDep,
    _creator: CurrentCreator,
) -> ContentItem:
    """FR-004's "view", and the read the frontend uses to confirm a write landed.

    No surface fetches one item to *render* it — the list response already carries every field
    (FR-017, FR-018), which is what R-007's single read depends on. This exists because the contract
    declares it and because a caller that has just been handed an id needs a way to read it back.
    """
    return get_or_404(session, item_id)


@router.patch(
    "/{item_id}",
    response_model=ContentItemRead,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such item."},
        409: {
            "model": InvariantErrorResponse,
            "description": "The change would violate INV-1.",
        },
    },
    summary="Partially update a content item",
)
def update_content_item(
    item_id: int,
    body: ContentItemUpdate,
    session: SessionDep,
    _creator: CurrentCreator,
) -> ContentItem:
    """The single mutation endpoint behind every date and status change (FR-014a, FR-015a).

    A drag and a tap send the identical request with one field set, which is what makes "both paths
    produce an identical result" true by construction rather than by discipline — there is no second
    code path for either to diverge from.

    **The invariant is checked against the item as it would be, and before anything is assigned.**
    Computing `next_status`/`next_platform` first means a request that both advances the item and
    sets its platform is legal, and so is one that moves it back to `idea` while clearing the
    platform — the two escape hatches the 409 messages point at. Checking before assignment is what
    makes a refusal leave the row untouched: with `create_savepoint` in the test harness, an
    implementation that assigned first and validated second would mutate the in-session object and
    leave whether that reaches Postgres up to transaction bookkeeping.

    **`exclude_unset=True` is the whole of the partial-update contract.** It yields the fields the
    caller actually sent, including the ones sent as an explicit `null`, and omits the rest. Without
    it every `PATCH` becomes a full replacement that clears whatever was left out. INV-3 needs no
    code of its own as a result: nothing here touches a field the caller did not name, so a backward
    status change cannot clear `platform` or `published_url` (FR-008a, FR-019a). That is an absence
    rather than a line, which is why `tests/test_transitions.py` asserts it exhaustively.

    Last write wins with no version check (FR-023a). One creator, so the only person who can be
    overwritten is themselves from a second window.
    """
    item = get_or_404(session, item_id)
    updates = body.model_dump(exclude_unset=True)

    next_status = updates.get("status", item.status)
    next_platform = updates.get("platform", item.platform)

    # "Clearing" means this request removed a platform the item had. An item that never had one and
    # is being advanced has not had anything taken from it, so it gets `platform_required` — the
    # instruction that fits. Both are the same violation of the same predicate.
    clearing_platform = (
        "platform" in updates and updates["platform"] is None and item.platform is not None
    )

    check_invariant_1(next_status, next_platform, clearing_platform=clearing_platform)

    for field, value in updates.items():
        setattr(item, field, value)

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        404: {"model": ErrorResponse, "description": "No such item."},
    },
    summary="Delete a content item",
)
def delete_content_item(
    item_id: int,
    session: SessionDep,
    _creator: CurrentCreator,
) -> None:
    """FR-004's delete. Hard, and there is no other kind available here.

    `data-model.md` gives `content_item` no `deleted_at` and no archive flag, so a soft delete would
    need a column the spec does not describe — a product decision wearing an implementation costume.
    The contract says hard delete outright, and `tests/test_content_items.py` asserts the row is
    gone from the *database* rather than only from the list response, because a soft delete as a
    filter on the list read passes every assertion made over HTTP and then hands the item straight
    back through `GET /content-items/{id}`.

    **No confirmation, no `?confirm=` parameter.** FR-020 requires the creator to confirm before a
    delete, and that belongs to T056's dialog: it is a placement and gesture problem (`design.md` —
    never one tap from a common gesture), and an API-side second step would not make an accidental
    tap any less accidental. The API does not second-guess a caller that has already confirmed.

    **404 rather than an idempotent 204 on a missing id.** 204 both times is defensible HTTP, but it
    would tell T056 that its delete succeeded when the row had already been destroyed elsewhere. The
    contract declares 404 for a missing id with no exception for this verb, and the frontend is the
    right place to decide that a 404 here is benign — it is recovering a screen, not a transaction.

    Third caller of `get_or_404`, so "no such item" reads identically whichever verb asked.

    No return annotation of `Response`, and no `response_model`: a 204 must carry no body, and a
    route declaring a model would serialise `null` into it — a body where the contract promises
    none, which some clients treat as a protocol error rather than as a value.
    """
    session.delete(get_or_404(session, item_id))
    session.commit()
