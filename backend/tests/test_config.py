"""The settings guarantees that are load-bearing rather than convenient.

`config.py` claims the app refuses to boot without a real signing secret. That claim is worth a
test: it is the kind of thing a later "just give it a default so the tests run" change quietly
removes, and the consequence — a deployment signing sessions with a guessable key — stays invisible
until it is exploited.

Everything here goes through the real environment with `_env_file=None`, because that is how the app
is actually configured. Passing values as constructor kwargs would test a path production never
takes: pydantic-settings matches kwargs by field name, so `Settings(JWT_SECRET=...)` populates
nothing and every assertion would pass for the wrong reason.
"""

import pytest
from pydantic import ValidationError

from app.config import Settings

VALID_ENV = {
    "DATABASE_URL": "postgresql+psycopg://u:p@localhost:5432/db",
    "JWT_SECRET": "x" * 32,
}


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """A clean, valid environment. Individual tests break one thing at a time."""
    for key in ("DATABASE_URL", "JWT_SECRET", "TOKEN_TTL_DAYS", "FRONTEND_ORIGIN"):
        monkeypatch.delenv(key, raising=False)
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)
    return monkeypatch


def build() -> Settings:
    """Construct Settings from the environment alone, ignoring any .env on the machine."""
    return Settings(_env_file=None)


def test_a_valid_environment_produces_the_documented_defaults(env: pytest.MonkeyPatch) -> None:
    settings = build()
    assert settings.database_url == VALID_ENV["DATABASE_URL"]
    # FR-002a: a session lasts ~30 days.
    assert settings.token_ttl_days == 30
    assert settings.frontend_origin == "http://localhost:3000"


def test_missing_jwt_secret_refuses_to_start(env: pytest.MonkeyPatch) -> None:
    env.delenv("JWT_SECRET")
    with pytest.raises(ValidationError, match="jwt_secret"):
        build()


def test_empty_jwt_secret_refuses_to_start(env: pytest.MonkeyPatch) -> None:
    """`.env.example` ships `JWT_SECRET=` empty. An unedited copy must not boot."""
    env.setenv("JWT_SECRET", "")
    with pytest.raises(ValidationError, match="jwt_secret"):
        build()


def test_short_jwt_secret_refuses_to_start(env: pytest.MonkeyPatch) -> None:
    env.setenv("JWT_SECRET", "too-short")
    with pytest.raises(ValidationError, match="jwt_secret"):
        build()


def test_missing_database_url_refuses_to_start(env: pytest.MonkeyPatch) -> None:
    env.delenv("DATABASE_URL")
    with pytest.raises(ValidationError, match="database_url"):
        build()


def test_zero_token_lifetime_is_rejected(env: pytest.MonkeyPatch) -> None:
    """A zero-day token expires the instant it is issued, which reads as "login is broken"."""
    env.setenv("TOKEN_TTL_DAYS", "0")
    with pytest.raises(ValidationError, match="token_ttl_days"):
        build()


def test_token_lifetime_is_overridable(env: pytest.MonkeyPatch) -> None:
    """T018 needs to shorten the lifetime to exercise expiry without waiting 30 days."""
    env.setenv("TOKEN_TTL_DAYS", "1")
    assert build().token_ttl_days == 1
