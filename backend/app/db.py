"""Database engine and the request-scoped session dependency.

One engine per process, one session per request. Nothing in the app opens a connection any other
way, which is what lets the pytest harness (T017) swap in a transaction that rolls back by
overriding a single dependency.
"""

from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine
from sqlmodel import Session, create_engine

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    """The process-wide engine, created on first use.

    Lazy for the same reason `get_settings` is: importing this module must not require a configured
    environment, or a missing variable becomes an import error in an unrelated module.
    """
    return create_engine(
        get_settings().database_url,
        # Render's managed Postgres and its free tier both drop idle connections. Without this, the
        # first request after a quiet period fails with a stale-connection error that looks like an
        # outage rather than a pool that needs a round trip to notice.
        pool_pre_ping=True,
    )


def get_session() -> Iterator[Session]:
    """Yield a session scoped to one request, closed when the request ends.

    Commits are explicit and belong to the endpoint. A dependency that commits on the way out would
    persist half-finished work whenever an endpoint raised after its first write.
    """
    with Session(get_engine()) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
"""The session type every endpoint annotates, and the single seam the test harness overrides."""
