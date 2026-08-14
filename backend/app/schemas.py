"""Response models shared across routers.

Only what more than one module needs. Request and response models specific to a single resource stay
with that resource's router — `LoginRequest` and `TokenResponse` belong in `app/api/auth.py`, and
the content-item models live in `app/api/content_items.py`.

This module exists because `ErrorResponse` acquired a second caller: `app/main.py` declares it as
the global 422 model, and every router declares it on its own 4xx responses. Defining it in
`main.py` would make the routers import the application they are mounted on.

`PreferencesRead` and `PreferencesUpdate` (002-pixel-arcade-skin) live here for the same reason, not
despite it: `app/api/preferences.py` is their first caller, and `app/api/auth.py`'s login response
is their second (T012 — the amended login response optionally carries a `Preferences` body).
Putting them in `preferences.py` would make `auth.py` import a sibling router module for a response
model, the same shape of mistake `ErrorResponse` living in `main.py` would have been.

**003-travel-map's Trip/Destination/Photograph/LocationCandidate models live here too, and that is a
departure from `content_items.py`'s precedent** — `tasks.md`'s T005 places them in this shared
module rather than with their own routers because `Photograph` and `DestinationDetail` are each read
by more than one router file (`destinations.py` and `photographs.py`), the same multi-caller reason
`ErrorResponse` and the Preferences pair are here.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import DestinationStatus, Theme, TripStatus


class ErrorResponse(BaseModel):
    """The contract's `Error`. One shape for every 4xx in this API, without exception.

    `contracts/openapi.yaml` promises `{"detail": "<string>"}` everywhere, and the typed client
    generated from it at T023 types `detail` as a string. Two separate things have to hold for that
    promise to be true, and they fail independently:

    * the **runtime body** — FastAPI's `RequestValidationError` returns `detail` as an array of
      objects, which the handler in `app/main.py` flattens;
    * the **generated document** — a route that declares a 4xx without a model advertises no body at
      all, so a generated client is left guessing at the one response it most needs to render.

    Declaring this model on every 4xx is what closes the second half. `tests/test_errors.py` asserts
    both, because the handler fixes only one of them and reading the code cannot tell you which.
    """

    detail: str


InvariantCode = Literal["platform_required", "platform_locked"]
"""The contract's `InvariantError.code` enum, in full.

Two members, and the closed set is the point. `platform_required` means "pick a platform";
`platform_locked` means "move it back to `idea` first". They are different instructions to the
creator, and a third value appearing here without a contract amendment would be a rule nothing on
the frontend knows how to explain.

`platform_locked` is unreachable until `PATCH` exists at T049 — nothing can *clear* a platform yet.
It is declared now regardless, because the enum is what the frontend switches on and a client
generated against a one-member enum would need regenerating rather than extending.
"""


class InvariantErrorResponse(BaseModel):
    """The contract's `InvariantError`. The **only** error in this API that is not just `detail`.

    Every other 4xx is `ErrorResponse`, and `test_errors.py` enforces that. This one is the single
    documented exception, and it exists because `code` is doing work no string can do: it is what
    separates the two INV-1 failures from each other, and the frontend renders a different
    instruction for each. Pattern-matching on `detail` instead would make the human-readable message
    load-bearing — so it could not be reworded, translated, or improved.

    The seam this closes is written up in `backend/AGENTS.md`: `contracts/openapi.yaml` declared
    this shape from the start while `tests/test_errors.py` asserted exactly one key everywhere, and
    both were green only because no endpoint could return a 409. T030 built the first one. The
    contract won, per CLAUDE.md's first non-negotiable.
    """

    code: InvariantCode
    detail: str


class InvariantViolationError(Exception):
    """Raised at the API boundary when a request would break INV-1.

    An exception plus a handler in `app/main.py`, rather than an `HTTPException`, because
    `HTTPException(detail=...)` can only produce `{"detail": ...}` — a dict passed to it nests as
    `{"detail": {"code": ..., "detail": ...}}`, which is neither shape the contract declares.

    Raised *before* the write, never caught after it. Letting the `CHECK` constraint fire and
    translating the `IntegrityError` would work, but it would mean the database's error message is
    the thing the creator's experience depends on, and a 500 is one forgotten `except` away.
    """

    def __init__(self, code: InvariantCode, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


class PreferencesRead(BaseModel):
    """The contract's `Preferences`. Both fields always present, never null.

    `theme` and `sound_enabled` are `NOT NULL` with defaults on `creator` (data-model.md,
    002-pixel-arcade-skin), so "never chosen" and "chosen, and it is the default" are the same value
    on the wire — there is no third state to represent.
    """

    theme: Theme
    sound_enabled: bool


class PreferencesUpdate(BaseModel):
    """The contract's `PreferencesUpdate`: at least one key, and no unknown ones.

    Unlike `ContentItemUpdate`, neither field is nullable — an explicit `null` is a validation
    failure rather than a third meaning, because neither column can be cleared (data-model.md: "no
    third state that no requirement reads"). `extra="forbid"` is the contract's
    `additionalProperties: false`: without it, a client that misspells `sound_enabled` would get a
    200 describing a change that never happened, because FastAPI ignores unknown body keys by
    default.

    The generated request schema is looser than the contract, deliberately and safely - the same
    shape as `PublishedUrl`'s date-string looseness in `backend/AGENTS.md`. The contract types both
    properties as their bare, non-nullable schema (`$ref: Theme`, `type: boolean`); this model's
    Python annotations are `Theme | None` / `bool | None` so the generated schema advertises `null`
    as an accepted value where the contract does not. What matters is that no `null` is ever
    accepted at runtime: `at_least_one_field` below refuses one with a 422, the same status the
    contract's tighter schema would produce. Loosening the document rather than the behaviour is
    accepted here, not a reason to amend the contract.
    """

    model_config = ConfigDict(extra="forbid")

    theme: Theme | None = None
    sound_enabled: bool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "PreferencesUpdate":
        """The contract's `minProperties: 1` and its "no null spelling" rule, in one place.

        An empty body is refused rather than treated as a no-op 200, for the same reason
        `ContentItemUpdate.at_least_one_field` refuses one: a `PATCH` that changed nothing and
        answered 200 is indistinguishable from one that worked.

        Both fields are typed `Theme | None` / `bool | None` only so the omitted case can be told
        apart from the sent case via `model_fields_set` — not because either may hold `null` on the
        wire. A field present in `model_fields_set` with a value of `None` was sent as an explicit
        `null`, which the contract refuses: neither column can be cleared, so there is no "unset"
        meaning for `null` to carry the way there is on `ContentItemUpdate`.
        """
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        nulled = [field for field in self.model_fields_set if getattr(self, field) is None]
        if nulled:
            raise ValueError(f"{', '.join(sorted(nulled))} may not be set to null.")
        return self


# --- 003-travel-map -------------------------------------------------------------------------


class TripCreate(BaseModel):
    """The contract's `TripCreate`. `name`/`start_date`/`end_date` are required (FR-014);
    `status` defaults to `wishlist`, matching `trip.status`'s own column default.
    """

    name: str = Field(max_length=200)
    start_date: date
    end_date: date
    status: TripStatus = TripStatus.WISHLIST


class TripUpdate(BaseModel):
    """The contract's `TripUpdate`: at least one key, no unknown ones, and — unlike
    `DestinationUpdate` — **no field here may be sent as an explicit null**. None of `trip`'s
    columns are nullable (data-model.md), so every field in this model has the same "no null
    spelling" rule `PreferencesUpdate` states for both of its own fields.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    status: TripStatus | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "TripUpdate":
        """The contract's `minProperties: 1` plus its "no null spelling" rule, in one place —
        the same shape as `PreferencesUpdate.at_least_one_field`, for the same reason: every
        field on this model disallows `null`.
        """
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        nulled = [field for field in self.model_fields_set if getattr(self, field) is None]
        if nulled:
            raise ValueError(f"{', '.join(sorted(nulled))} may not be set to null.")
        return self


class Trip(BaseModel):
    """The contract's `Trip` — the single response model for every route in `app/api/trips.py`."""

    id: int
    name: str
    start_date: date
    end_date: date
    status: TripStatus
    created_at: datetime
    updated_at: datetime


class DestinationCreate(BaseModel):
    """The contract's `DestinationCreate`. `name`/`latitude`/`longitude` are required — this
    operation is reached **after** `GET /locations/search` has already resolved a name to
    coordinates (FR-011); it does not itself geocode. `trip_id` is optional (FR-020); `status`
    defaults to `wishlist`, matching `destination.status`'s own column default.
    """

    trip_id: int | None = None
    name: str = Field(max_length=200)
    latitude: float
    longitude: float
    start_date: date | None = None
    end_date: date | None = None
    status: DestinationStatus = DestinationStatus.WISHLIST
    note: str | None = None


class DestinationUpdate(BaseModel):
    """The contract's `DestinationUpdate`: at least one key, no unknown ones, and a **mixed**
    null-spelling rule, the same shape `ContentItemUpdate` uses. `trip_id`, `start_date`,
    `end_date` and `note` are nullable on `destination` (data-model.md), so an explicit `null`
    on any of those four clears it — `trip_id: null` is FR-020's detach. `name`, `latitude`,
    `longitude` and `status` back `NOT NULL` columns and may not be sent as `null`.
    """

    model_config = ConfigDict(extra="forbid")

    trip_id: int | None = None
    name: str | None = Field(default=None, max_length=200)
    latitude: float | None = None
    longitude: float | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: DestinationStatus | None = None
    note: str | None = None

    _NEVER_NULL = ("name", "latitude", "longitude", "status")

    @model_validator(mode="after")
    def at_least_one_field(self) -> "DestinationUpdate":
        """The contract's `minProperties: 1`, plus refusing `null` on the four fields that back
        a `NOT NULL` column. `trip_id`/`start_date`/`end_date`/`note` are exempt — sending those
        as `null` is a real clear, not a mistake.
        """
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        nulled = [
            field
            for field in self.model_fields_set
            if field in self._NEVER_NULL and getattr(self, field) is None
        ]
        if nulled:
            raise ValueError(f"{', '.join(sorted(nulled))} may not be set to null.")
        return self


class Destination(BaseModel):
    """The contract's `Destination`. Every nullable field is always emitted, matching
    `ContentItemRead`'s own precedent of being *stricter* than the contract's optional-but-
    nullable properties (`backend/AGENTS.md`) — no client written against the contract breaks.
    """

    id: int
    trip_id: int | None
    name: str
    latitude: float
    longitude: float
    start_date: date | None
    end_date: date | None
    status: DestinationStatus
    created_at: datetime
    updated_at: datetime


class Photograph(BaseModel):
    """The contract's `Photograph`. `url` is a presigned GET, minted fresh on every response
    that includes it (FR-024) — never stored, so there is nothing to keep in sync with R2.
    """

    id: int
    url: str
    created_at: datetime


class DestinationDetail(Destination):
    """The contract's `DestinationDetail`: `Destination` plus `note` and `photographs`.

    Always includes both regardless of `status` — FR-009's "no gallery on a non-Visited pin" is
    a **frontend** display rule (INV-3, data-model.md), not a reason for the API to withhold
    data that exists.
    """

    note: str | None
    photographs: list[Photograph]


class PhotographCreate(BaseModel):
    """The contract's `PhotographCreate`. Sent **after** the browser has already `PUT` the image
    bytes to the presigned URL from `POST .../photos/upload-url` — this carries only the
    `object_key` that upload already used, never image bytes (FR-023, FR-025).
    """

    object_key: str = Field(max_length=512)


class PhotoUploadUrl(BaseModel):
    """The contract's `PhotoUploadUrl`. `upload_url` is a presigned `PUT` the browser uploads
    directly to R2 — this backend never receives the image (`tech-defaults.md`'s Object Storage
    section).
    """

    upload_url: str
    object_key: str = Field(max_length=512)
    expires_at: datetime


class LocationCandidate(BaseModel):
    """The contract's `LocationCandidate`. One geocoding match, as returned by
    `GET /locations/search` (FR-011, FR-012) — `app/services/geocoding.py` is the only producer.
    """

    name: str
    address: str
    latitude: float
    longitude: float
