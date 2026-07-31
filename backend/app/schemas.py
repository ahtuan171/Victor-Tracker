"""Response models shared across routers.

Only what more than one module needs. Request and response models specific to a single resource stay
with that resource's router — `LoginRequest` and `TokenResponse` belong in `app/api/auth.py`, and
the content-item models will belong in `app/api/content_items.py`.

This module exists because `ErrorResponse` acquired a second caller: `app/main.py` declares it as
the global 422 model, and every router declares it on its own 4xx responses. Defining it in
`main.py` would make the routers import the application they are mounted on.
"""

from pydantic import BaseModel


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
