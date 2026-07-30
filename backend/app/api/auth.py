"""Login and logout — the only two auth operations that exist.

There is no register, no refresh, and no password reset. `.claude/rules/tech-defaults.md` locks the
Auth row to "login + access token only", and the single account is created by
`app.scripts.seed_user`. If a third endpoint appears here, that is scope drift.

Both halves of the session live somewhere else: the token is minted in `app.auth`, and the cookie
carrying it is written by the Next.js proxy (research.md R-001). This module never sees a cookie.
"""

from datetime import datetime
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import select

from app.auth import PresentedToken, create_access_token, hash_password, verify_password
from app.db import SessionDep
from app.models import Creator

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Exactly the contract's login body — no more fields, no remember-me flag."""

    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    """The contract's 200 body for login.

    `expires_at` comes back from `create_access_token` rather than being recomputed here, so the
    value in this body and the `exp` claim inside the token cannot drift apart.
    """

    access_token: str
    # Not a credential, despite the name: it is the literal string "bearer" the contract pins with
    # `const`. Hence the bandit suppression.
    token_type: str = "bearer"  # noqa: S105
    expires_at: datetime


def normalise_email(email: str) -> str:
    """Lowercase and strip, the one way an email is compared.

    `creator.email` is unique, so a seeded `Ah@Example.com` and a typed `ah@example.com` would
    otherwise be two different accounts — and the second one does not exist, which surfaces as a
    creator who cannot log in with the password they were just given. The seed script normalises
    through this same function, which is what makes the two agree.
    """
    return email.strip().lower()


@lru_cache
def _timing_equaliser() -> str:
    """A real bcrypt hash to verify against when the email matches no row.

    Without it, an unknown email returns in microseconds while a known one costs a full bcrypt
    verification, and the timing difference answers the question the 401 message is careful not to:
    whether this address has an account.

    Built lazily and cached rather than at import time, because hashing costs a few hundred
    milliseconds and importing this module must stay free.
    """
    return hash_password("a password that is deliberately not any real credential")


def _invalid_credentials() -> HTTPException:
    """One response for an unknown email and for a wrong password.

    The contract's `InvalidCredentials`: "the message does not reveal which".
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email or password is incorrect.",
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={401: {"description": "Email or password incorrect"}},
    summary="Exchange credentials for an access token",
)
def login(body: LoginRequest, session: SessionDep) -> TokenResponse:
    """FR-001. The only public endpoint that returns anything worth having."""
    creator = session.exec(
        select(Creator).where(Creator.email == normalise_email(body.email))
    ).one_or_none()

    if creator is None:
        # Verified anyway, then refused — see `_timing_equaliser`.
        verify_password(body.password, _timing_equaliser())
        raise _invalid_credentials()

    if not verify_password(body.password, creator.password_hash):
        # Includes the over-72-byte case: `verify_password` returns False rather than raising,
        # because at this boundary an unusable password is simply a wrong one.
        raise _invalid_credentials()

    # `creator.id` is Optional on the model only because it is None before the insert.
    assert creator.id is not None, "a row loaded from the database always has an id"
    token, expires_at = create_access_token(creator.id)
    return TokenResponse(access_token=token, expires_at=expires_at)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="End the session",
)
def logout(_token: PresentedToken) -> Response:
    """Succeeds for any presented token, valid or not — and that is the point.

    v0.1 has no denylist, so there is nothing to revoke server-side; the meaningful effect of
    sign-out is the proxy clearing the cookie, and this endpoint exists so the proxy has something
    to call. It therefore depends on `PresentedToken`, not `CurrentCreator`: a creator whose token
    expired must still be able to sign out, and requiring a *valid* token here would leave them
    holding a dead session they cannot clear.

    The contract's 401 on this path is the no-credential-at-all case, which `PresentedToken` raises.

    An explicit `Response` rather than `return None`: a 204 carrying a JSON `null` body and
    `content-length: 4` is a malformed 204, and some proxies reject it.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)
