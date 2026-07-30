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

from app.api import auth
from app.config import get_settings


class ErrorResponse(BaseModel):
    """The contract's `Error`. One shape for every 4xx in the API."""

    detail: str


class HealthResponse(BaseModel):
    status: Literal["ok"]


app = FastAPI(
    title="CreatorHub — Content Calendar API",
    version="0.1.0",
    description=(
        "Content Calendar for CreatorHub v0.1. Contract: "
        "specs/001-content-calendar/contracts/openapi.yaml, which is the source of truth — if this "
        "generated document disagrees with it, the code is what is wrong."
    ),
    # Declared globally so the generated schema shows the flattened shape the handler below actually
    # returns, rather than FastAPI's own array-of-objects `HTTPValidationError`.
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
