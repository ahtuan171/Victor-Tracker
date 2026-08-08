"""The ASGI application: error shape, CORS, health, routers.

    uv run uvicorn app.main:app --reload

Assembly only. No business logic lives here, and no route is defined here except `/health`, which
belongs to no resource.

The `RequestValidationError` handler at the top is not boilerplate. It is the reason
`contracts/openapi.yaml` can promise that *every* error body is `{"detail": "<string>"}`.
"""

from typing import Literal

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api import auth, content_items
from app.config import get_settings
from app.schemas import ErrorResponse, InvariantViolationError


class HealthResponse(BaseModel):
    status: Literal["ok"]


app = FastAPI(
    title="VictorHub — Content Calendar API",
    version="0.1.0",
    description=(
        "Content Calendar for VictorHub v0.1. Contract: "
        "specs/001-content-calendar/contracts/openapi.yaml, which is the source of truth — if this "
        "generated document disagrees with it, the code is what is wrong."
    ),
    # Declared globally so the generated schema shows the flattened shape the handler below actually
    # returns, rather than FastAPI's own array-of-objects `HTTPValidationError`. Verified at T020:
    # with this here, `HTTPValidationError` is absent from the generated components entirely.
    #
    # The cost is that every route advertises a 422, including `/health`, which takes no input and
    # can never produce one. That is accepted rather than fixed: declaring the model per route
    # instead would let a single forgotten route reintroduce the array shape, and an impossible
    # response in the document is a smaller lie than a wrong one. `test_errors.py` pins both halves
    # so neither can be "tidied" without a failure explaining why.
    responses={
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "model": ErrorResponse,
            "description": "Request failed validation",
        }
    },
)


@app.exception_handler(RequestValidationError)
async def flatten_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Turn FastAPI's array-shaped `detail` into the single string the contract declares.

    FastAPI's default body is `{"detail": [{"loc": [...], "msg": "...", "type": "..."}, ...]}`. The
    contract — and the typed client generated from it at T023 — types `detail` as a string, so
    without this handler the frontend renders `[object Object]` on every validation failure and the
    contract is simply a lie.

    The field path is kept in the message rather than discarded. "email: value is not a valid email
    address" is something the login form can show; "value is not a valid email address" on its own
    is not, once a form has more than one field.
    """
    messages = []
    for error in exc.errors():
        # `loc` is like ("body", "email"). The first element names the request part, which tells the
        # creator nothing useful, so it is dropped when there is a field name after it.
        location = [str(part) for part in error["loc"]]
        field = ".".join(location[1:]) if len(location) > 1 else ".".join(location)
        messages.append(f"{field}: {error['msg']}" if field else str(error["msg"]))

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": "; ".join(messages) or "Request failed validation."},
    )


@app.exception_handler(InvariantViolationError)
async def render_invariant_violation(
    _request: Request, exc: InvariantViolationError
) -> JSONResponse:
    """The contract's `InvariantError`: a 409 carrying `code` alongside `detail`.

    A handler rather than an `HTTPException`, because `HTTPException(detail={...})` nests the dict
    as `{"detail": {"code": ..., "detail": ...}}` and there is no argument that produces a sibling
    key.

    This is the **only** error in the API whose body is not exactly `{"detail": "..."}`, and it is a
    deliberate, contract-declared exception rather than a drift — `code` is what separates
    `platform_required` from `platform_locked`, and those are two different instructions to the
    creator. `tests/test_errors.py` allows the extra key on 409 and on nothing else, so a third
    error shape cannot appear without a test failing.
    """
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"code": exc.code, "detail": exc.detail},
    )


app.add_middleware(
    CORSMiddleware,
    # Defence in depth only, and deliberately one exact origin rather than a regex. research.md
    # R-008 makes the Next.js proxy allowlist the real boundary: no browser ever contacts this
    # origin directly, so a CORS mistake here cannot be the thing that saves us.
    allow_origins=[get_settings().frontend_origin],
    # The token travels as an Authorization header the proxy attaches server-side, never as a cookie
    # on this origin (research.md R-001). Nothing needs credentialed cross-origin requests.
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(content_items.router)


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["auth"],
    summary="Liveness probe",
)
def health() -> HealthResponse:
    """Public by design, and deliberately says nothing else.

    Render polls this to decide whether an instance is live. It does not touch the database: a probe
    that fails when Postgres is briefly unreachable gets the whole instance recycled, which turns a
    momentary database blip into an outage.
    """
    return HealthResponse(status="ok")
