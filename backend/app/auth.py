"""Password hashing, the session token, and the authentication boundary.

One token type, one lifetime. There is no refresh token and no refresh endpoint —
`.claude/rules/tech-defaults.md` locks the Auth row to "login + access token only", and research.md
R-002 resolves that against FR-002a's ~30-day sliding session by reissuing *the same* access token
rather than introducing a second one.

Two things here are easy to get subtly wrong:

* **bcrypt refuses passwords over 72 bytes.** It no longer truncates them, it raises. Length is
  therefore bounded at this boundary and the caller is told, rather than wrapped and silently
  shortened — truncating would let two different passwords open the same account.
* **Token lifetime is measured in *bytes* of trust, not convenience.** v0.1 has no denylist, so a
  token that leaks is valid until it expires and reissue-on-use extends that indefinitely. That
  trade is stated in R-002 and accepted for a single-user tool; it is not something to widen here.

The lower half of this file is the HTTP boundary: `CurrentCreator`, which every authenticated
endpoint depends on, and `PresentedToken`, which only logout uses.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Final

import jwt
from fastapi import Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from app.config import get_settings
from app.db import SessionDep
from app.models import Creator

ALGORITHM: Final = "HS256"

MAX_PASSWORD_BYTES: Final = 72
"""bcrypt's hard limit. Not a policy choice — the algorithm rejects anything longer.

Measured in UTF-8 bytes, not characters: a 30-character password of emoji or accented Latin can
exceed 72 bytes while looking short.
"""

_password_hash = PasswordHash((BcryptHasher(),))


class PasswordTooLongError(ValueError):
    """Raised instead of letting bcrypt's own error escape, or worse, truncating."""

    def __init__(self) -> None:
        super().__init__(
            f"Password must be at most {MAX_PASSWORD_BYTES} bytes when UTF-8 encoded "
            "(a limit of the bcrypt algorithm)."
        )


def _check_length(password: str) -> None:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise PasswordTooLongError


def hash_password(password: str) -> str:
    """Hash a password for storage. Used only by the seed script (T015)."""
    _check_length(password)
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Return whether `password` matches `password_hash`.

    An over-long password returns False rather than raising: at the login boundary it is simply a
    wrong password, and a distinct error there would tell an attacker something about the stored
    credential's shape.
    """
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return False
    return _password_hash.verify(password, password_hash)


def create_access_token(creator_id: int) -> tuple[str, datetime]:
    """Issue a token for `creator_id`, and return it with its expiry.

    The expiry is returned rather than recomputed by the caller so that the value in the login
    response body and the value inside the token cannot drift apart.

    Truncated to whole seconds, because `exp` and `iat` are defined as integer seconds: without it
    the returned datetime carries microseconds the claim cannot, and the body advertises an expiry a
    fraction of a second later than the one the token actually enforces. Harmless in effect, but it
    makes the sentence above false, and a paired value that is only nearly equal is the kind of
    thing a later test tolerates instead of trusting.
    """
    settings = get_settings()
    now = datetime.now(UTC).replace(microsecond=0)
    expires_at = now + timedelta(days=settings.token_ttl_days)
    payload = {
        "sub": str(creator_id),
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expires_at


class InvalidTokenError(Exception):
    """The presented token is absent, malformed, expired, or signed with the wrong key.

    Deliberately one error for all four. The API says 401 and nothing more; distinguishing "expired"
    from "forged" in the response tells an attacker which half of the problem to work on.
    """


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a token, or raise `InvalidTokenError`.

    `algorithms` is pinned to a single symmetric algorithm. Accepting a list — or reading the
    algorithm from the token's own header — is the classic JWT confusion attack.
    """
    try:
        return jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError from exc


def is_past_half_life(payload: dict[str, Any]) -> bool:
    """Whether a valid token is more than halfway through its lifetime.

    This is the trigger for sliding reissue (FR-002a, research.md R-002). Half-life rather than a
    fixed threshold so the rule holds if `TOKEN_TTL_DAYS` changes: a creator who opens the app at
    least once per half-lifetime never sees the login screen again.
    """
    issued_at = int(payload["iat"])
    expires_at = int(payload["exp"])
    midpoint = issued_at + (expires_at - issued_at) / 2
    return datetime.now(UTC).timestamp() > midpoint


# ---------------------------------------------------------------------------
# The HTTP boundary
# ---------------------------------------------------------------------------

REISSUE_HEADER: Final = "X-Access-Token"
"""Where a reissued token is returned. The one transport sliding reissue has.

research.md R-001 puts all cookie handling in the Next.js proxy and none in FastAPI, so this API
cannot "set a cookie" — it can only hand the proxy a new token and let the proxy rewrite the cookie
with a fresh `Max-Age`. Remove this and sessions die on day 30 with nothing in the logs to say why.
"""

_bearer = HTTPBearer(
    # Our own 401, not Starlette's. `auto_error=True` returns a 403 with `{"detail": "Not
    # authenticated"}` for a missing header, and the contract declares 401 with a uniform Error body
    # for every unauthenticated case.
    auto_error=False,
    description="The session JWT. Attached by the Next.js proxy, never by the browser (R-001).",
)

_BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthenticated() -> HTTPException:
    """The single 401 every failure mode returns.

    Absent, malformed, expired, wrong key, and "decodes but names a creator that no longer exists"
    are one response with one message. Distinguishing them tells an attacker which half of the
    problem to work on, and FR-002 wants no information at all in this response.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_creator(
    session: SessionDep,
    response: Response,
    credentials: _BearerCredentials,
) -> Creator:
    """Resolve the signed-in creator, reissuing the token when it is past half-life.

    Endpoints depend on a `Creator` rather than on a token so that no endpoint has to know how
    authentication works, and so the token is never decoded twice with different options.

    `Response` is injected purely so the half-life branch has somewhere to put the reissued token.
    FastAPI merges headers set on this object into the real response, which holds for endpoints that
    return a model or a dict — every endpoint in this API. An endpoint returning its own `Response`
    object directly would bypass it, so do not introduce one without carrying the header across.
    """
    if credentials is None:
        raise _unauthenticated()

    try:
        payload = decode_access_token(credentials.credentials)
        creator_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        # A token can be validly signed and still carry a `sub` that is not an integer — it would be
        # one this deployment's own secret signed, but the claim set is still not ours.
        raise _unauthenticated() from exc

    creator = session.get(Creator, creator_id)
    if creator is None:
        # Valid signature, real expiry, no such row: the account was removed after the token was
        # issued. v0.1 has no denylist, so this is the only revocation there is.
        raise _unauthenticated()

    if is_past_half_life(payload):
        fresh_token, _ = create_access_token(creator_id)
        response.headers[REISSUE_HEADER] = fresh_token

    return creator


CurrentCreator = Annotated[Creator, Depends(current_creator)]
"""What every authenticated endpoint annotates. The counterpart to `SessionDep`."""


def presented_token(credentials: _BearerCredentials) -> str:
    """The raw token, whether or not it is still valid. **Only logout may use this.**

    T014 requires sign-out to work from an expired session: a creator whose token died must still be
    able to clear it, and `current_creator` would refuse them, leaving them unable to sign out of a
    session they can no longer use. So logout accepts any presented credential and only refuses a
    request that presents none — which is what the contract's 401 on `/auth/logout` covers.

    Nothing is decoded here, so this returns no identity and grants no access. It exists to give
    logout a credential-shaped precondition, not an authenticated one.
    """
    if credentials is None:
        raise _unauthenticated()
    return credentials.credentials


PresentedToken = Annotated[str, Depends(presented_token)]
