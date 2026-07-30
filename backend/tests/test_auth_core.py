"""Password hashing and token mechanics, below the HTTP layer.

T018 covers login and the 401 paths through the API. This file covers the primitives those paths
rest on, because two of them fail in ways that are invisible from the endpoint: a password silently
truncated to 72 bytes still logs in, and a token accepted with the wrong algorithm still decodes.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.auth import (
    ALGORITHM,
    MAX_PASSWORD_BYTES,
    InvalidTokenError,
    PasswordTooLongError,
    create_access_token,
    decode_access_token,
    hash_password,
    is_past_half_life,
    verify_password,
)
from app.config import get_settings

PASSWORD = "correct horse battery staple"


@pytest.fixture(autouse=True)
def _configured_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """A known secret and lifetime, independent of whatever .env is on the machine."""
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/db")
    monkeypatch.setenv("JWT_SECRET", "test-secret-" + "x" * 32)
    monkeypatch.setenv("TOKEN_TTL_DAYS", "30")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_hash_and_verify_round_trip() -> None:
    hashed = hash_password(PASSWORD)
    assert hashed != PASSWORD
    assert verify_password(PASSWORD, hashed)


def test_wrong_password_is_rejected() -> None:
    assert not verify_password("wrong", hash_password(PASSWORD))


def test_hashing_is_salted() -> None:
    """Two hashes of the same password must differ, or the store leaks which accounts match."""
    assert hash_password(PASSWORD) != hash_password(PASSWORD)


def test_password_at_the_bcrypt_limit_is_accepted() -> None:
    assert verify_password("a" * MAX_PASSWORD_BYTES, hash_password("a" * MAX_PASSWORD_BYTES))


def test_over_long_password_is_refused_rather_than_truncated() -> None:
    """The whole point: truncating would let two different passwords open the same account."""
    with pytest.raises(PasswordTooLongError):
        hash_password("a" * (MAX_PASSWORD_BYTES + 1))


def test_length_is_counted_in_bytes_not_characters() -> None:
    """A 24-character emoji password is 96 bytes. Counting characters would hand it to bcrypt."""
    password = "🔒" * 24
    assert len(password) < MAX_PASSWORD_BYTES
    assert len(password.encode("utf-8")) > MAX_PASSWORD_BYTES
    with pytest.raises(PasswordTooLongError):
        hash_password(password)


def test_over_long_password_verifies_false_rather_than_raising() -> None:
    """At the login boundary an over-long password is just a wrong password."""
    assert not verify_password("a" * 200, hash_password(PASSWORD))


def test_token_round_trips_and_carries_the_creator_id() -> None:
    token, expires_at = create_access_token(1)
    payload = decode_access_token(token)
    assert payload["sub"] == "1"
    assert payload["exp"] == int(expires_at.timestamp())


def test_token_expiry_matches_the_configured_lifetime() -> None:
    """FR-002a: roughly 30 days."""
    _, expires_at = create_access_token(1)
    assert timedelta(days=29, hours=23) < expires_at - datetime.now(UTC) <= timedelta(days=30)


def test_expired_token_is_rejected() -> None:
    settings = get_settings()
    past = datetime.now(UTC) - timedelta(days=1)
    token = jwt.encode(
        {
            "sub": "1",
            "iat": int((past - timedelta(days=30)).timestamp()),
            "exp": int(past.timestamp()),
        },
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_token_signed_with_another_key_is_rejected() -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "1",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(days=1)).timestamp()),
        },
        "a-different-secret-entirely-and-long-enough",
        algorithm=ALGORITHM,
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_unsigned_token_is_rejected() -> None:
    """The alg=none confusion attack. `algorithms` is pinned for exactly this."""
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "1",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(days=1)).timestamp()),
        },
        key="",
        algorithm="none",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_malformed_token_is_rejected() -> None:
    with pytest.raises(InvalidTokenError):
        decode_access_token("not-a-jwt")


def test_token_without_required_claims_is_rejected() -> None:
    """A token with no exp would otherwise be valid forever."""
    token = jwt.encode({"sub": "1"}, get_settings().jwt_secret, algorithm=ALGORITHM)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_fresh_token_is_not_past_half_life() -> None:
    token, _ = create_access_token(1)
    assert not is_past_half_life(decode_access_token(token))


def test_token_past_the_midpoint_triggers_reissue() -> None:
    """Without this being true, X-Access-Token is never sent and sessions die on day 30."""
    now = datetime.now(UTC)
    payload = {
        "sub": "1",
        "iat": int((now - timedelta(days=20)).timestamp()),
        "exp": int((now + timedelta(days=10)).timestamp()),
    }
    assert is_past_half_life(payload)
