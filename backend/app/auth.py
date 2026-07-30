"""Password hashing and the session token.

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
"""

from datetime import UTC, datetime, timedelta
from typing import Any, Final

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from app.config import get_settings

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
    """
    settings = get_settings()
    now = datetime.now(UTC)
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
