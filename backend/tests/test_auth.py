"""Login, logout, and the authentication boundary, over HTTP.

`test_auth_core.py` covers the primitives — hashing, encoding, half-life arithmetic. This file
covers what a client actually sees: status codes, bodies, and headers, through the real application
against the real database.

**Why there is a probe route.** Every one of FR-002's refusals lives in `current_creator`, and at
T018 *no shipped endpoint depends on it* — `/health` and `/auth/login` are public, `/auth/logout`
deliberately uses `presented_token` instead, and the content-item routes do not exist until T030.
So this file mounts one throwaway route on the real app that depends on `CurrentCreator` and does
nothing else. It is a test double for the *caller*, not for the thing under test: the dependency,
the app, the session, and the database are all the real ones. Once T030 lands, these assertions
could move onto a content-item endpoint — but they should not, because then a failure would not say
whether authentication or the endpoint broke.

The four assertions in here that are easiest to lose in a refactor, recorded because a previous
verification pass found each of them worth writing down:

* a **fresh** token gets no `X-Access-Token` — reissuing on every request is not sliding reissue,
  it is a token treadmill, and it looks identical to working code;
* a token **past half-life** does get one, because without it sessions die on day 30 silently;
* the reissued token **works** and does **not** immediately reissue again;
* logout answers **204 for an expired token but 401 for no token at all** — the asymmetry is the
  whole reason `presented_token` exists.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import ALGORITHM, REISSUE_HEADER, CurrentCreator
from app.config import get_settings
from app.models import Creator

PROBE_PATH = "/test-only/whoami"
"""Mounted by the `probe_app` fixture and removed again after each test. Namespaced so it cannot
collide with a real route, and so a stray appearance in `openapi.json` would be obvious."""

UNAUTHENTICATED_DETAIL = "Not authenticated."
"""The single body every authentication failure returns. Asserted as one shared constant on purpose:
FR-002 wants absent, malformed, expired, forged, and orphaned tokens to be indistinguishable, and
five separately-written string literals would let them drift apart without a test noticing."""

INVALID_CREDENTIALS_DETAIL = "Email or password is incorrect."
"""Login's 401. Distinct from the above — it answers a different question — but likewise shared
between the unknown-email and wrong-password cases, which must not differ."""


def forge_token(
    secret: str,
    *,
    sub: Any = "1",
    issued_days_ago: float = 0,
    expires_in_days: float = 30,
) -> str:
    """Mint a token with an arbitrary claim set, signed however the caller likes.

    `create_access_token` cannot express an expired token or one that is already past half-life
    without either sleeping or moving the clock, so the forge exists to put `iat` and `exp` exactly
    where a test needs them. Defaults produce a valid, fresh token, so each test states only the one
    thing it is varying.
    """
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": sub,
        "iat": int((now - timedelta(days=issued_days_ago)).timestamp()),
        "exp": int((now + timedelta(days=expires_in_days)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def bearer(token: str) -> dict[str, str]:
    """The header the Next.js proxy sends. Never a cookie — that is the proxy's business (R-001)."""
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def probe_app(app: FastAPI) -> Iterator[FastAPI]:
    """The real application plus one route that depends on `CurrentCreator`.

    Added to the *real* app rather than to a fresh `FastAPI()` so that the request passes through
    the same exception handlers, middleware, and dependency overrides a shipped endpoint would. A
    separate app would still exercise the dependency, but it would stop being evidence about this
    application the moment `main.py` gained anything that touches responses.

    Removed afterwards, and the cached OpenAPI schema invalidated with it, so the route cannot leak
    into T020's assertions about the generated document.
    """

    @app.get(PROBE_PATH)
    def _whoami(creator: CurrentCreator) -> dict[str, int]:
        assert creator.id is not None, "a creator loaded from the database always has an id"
        return {"creator_id": creator.id}

    yield app

    app.router.routes[:] = [
        route for route in app.router.routes if getattr(route, "path", None) != PROBE_PATH
    ]
    app.openapi_schema = None


@pytest.fixture
def probe_client(probe_app: FastAPI) -> Iterator[TestClient]:
    """An anonymous client that can reach the probe route. Callers attach their own credentials."""
    with TestClient(probe_app) as client:
        yield client


# ---------------------------------------------------------------------------
# Login — FR-001
# ---------------------------------------------------------------------------


def test_login_returns_a_token_that_authenticates(
    client: TestClient,
    probe_client: TestClient,
    creator: Creator,
    creator_password: str,
) -> None:
    """The end-to-end claim of FR-001, in one test: credentials in, usable session out."""
    response = client.post(
        "/auth/login", json={"email": creator.email, "password": creator_password}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"

    authenticated = probe_client.get(PROBE_PATH, headers=bearer(body["access_token"]))
    assert authenticated.status_code == 200
    assert authenticated.json() == {"creator_id": creator.id}


def test_login_returns_only_the_contracted_fields(
    client: TestClient, creator: Creator, creator_password: str
) -> None:
    """A password hash reaching the client would be invisible until someone reads a network log.

    `preferences` joined this set at T012 (002-pixel-arcade-skin): declared OPTIONAL in the
    contract, but `login` always sets it — see `test_login_returns_the_creators_preferences` below
    for what it carries.
    """
    response = client.post(
        "/auth/login", json={"email": creator.email, "password": creator_password}
    )

    assert set(response.json()) == {"access_token", "token_type", "expires_at", "preferences"}


def test_login_returns_the_creators_preferences(
    client: TestClient, creator: Creator, creator_password: str
) -> None:
    """002-pixel-arcade-skin T012: the login response rides the account's preferences along so the
    proxy can write the `ch_theme` cookie from this same response, with no extra round trip.

    `creator` never sets `theme` or `sound_enabled`, so this is the default state — the same values
    `GET /preferences` would return a moment later (research R-002's reconciliation).
    """
    response = client.post(
        "/auth/login", json={"email": creator.email, "password": creator_password}
    )

    assert response.json()["preferences"] == {"theme": "dark", "sound_enabled": False}


def test_login_expiry_matches_the_token_and_the_configured_lifetime(
    client: TestClient, creator: Creator, creator_password: str, harness_secret: str
) -> None:
    """`expires_at` is returned by the minting function so it cannot drift from the `exp` claim.

    Asserted against the token itself rather than against a recomputed timestamp: a body that says
    thirty days while the token dies in one is a bug no other test in this file would catch, and the
    frontend has no way to notice it either.
    """
    response = client.post(
        "/auth/login", json={"email": creator.email, "password": creator_password}
    )

    body = response.json()
    claimed = datetime.fromisoformat(body["expires_at"])
    inside_the_token = datetime.fromtimestamp(
        jwt.decode(body["access_token"], harness_secret, algorithms=[ALGORITHM])["exp"], UTC
    )

    assert claimed == inside_the_token
    expected = datetime.now(UTC) + timedelta(days=get_settings().token_ttl_days)
    assert abs((claimed - expected).total_seconds()) < 60


@pytest.mark.parametrize(
    "email",
    ["CREATOR@Example.com", "  creator@example.com  ", "Creator@Example.COM"],
    ids=["uppercase", "surrounding-whitespace", "mixed-case"],
)
def test_login_normalises_the_email(
    client: TestClient, creator: Creator, creator_password: str, email: str
) -> None:
    """The seed script and login normalise through the same function, so these are one account.

    Without it a creator typing their address with a capital letter gets "email or password is
    incorrect" for credentials that are, in every sense they care about, correct.
    """
    response = client.post("/auth/login", json={"email": email, "password": creator_password})

    assert response.status_code == 200


def test_login_with_a_wrong_password_is_refused(
    client: TestClient, creator: Creator, creator_password: str
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": creator.email, "password": creator_password + " not"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID_CREDENTIALS_DETAIL}


def test_login_with_an_unknown_email_is_refused_identically(
    client: TestClient, creator: Creator, creator_password: str
) -> None:
    """FR-002: the response must not reveal whether the address has an account.

    Compared byte for byte against the wrong-password response rather than merely asserted to be a
    401, because "wrong password" and "no such user" as two different strings is exactly how this
    leaks in practice.
    """
    wrong_password = client.post(
        "/auth/login",
        json={"email": creator.email, "password": creator_password + " not"},
    )
    unknown_email = client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": creator_password},
    )

    assert unknown_email.status_code == wrong_password.status_code == 401
    assert unknown_email.json() == wrong_password.json()


def test_login_with_an_over_long_password_is_a_401_not_a_500(
    client: TestClient, creator: Creator
) -> None:
    """bcrypt raises above 72 bytes; `verify_password` swallows that and returns False.

    If it ever propagates, an attacker gets a 500 that distinguishes a reachable code path from an
    unreachable one, and the creator gets a stack trace instead of a login form.
    """
    response = client.post("/auth/login", json={"email": creator.email, "password": "a" * 200})

    assert response.status_code == 401
    assert response.json() == {"detail": INVALID_CREDENTIALS_DETAIL}


def test_login_never_reissues(client: TestClient, creator: Creator, creator_password: str) -> None:
    """Login is public and mints a token in its body; a reissue header here would mean it had
    quietly acquired the `CurrentCreator` dependency, which would make it non-public."""
    response = client.post(
        "/auth/login", json={"email": creator.email, "password": creator_password}
    )

    assert REISSUE_HEADER not in response.headers


# ---------------------------------------------------------------------------
# The authentication boundary — FR-002
# ---------------------------------------------------------------------------


def test_absent_credentials_are_401_and_not_starlette_403(probe_client: TestClient) -> None:
    """`HTTPBearer(auto_error=True)` answers a missing header with **403**, not 401.

    The contract declares 401 everywhere, so this is asserted on its own rather than folded into the
    parametrized case below — the failure it guards against is a one-word change in `app/auth.py`
    that no other test would notice.
    """
    response = probe_client.get(PROBE_PATH)

    assert response.status_code == 401
    assert response.json() == {"detail": UNAUTHENTICATED_DETAIL}
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_a_non_bearer_scheme_is_refused(probe_client: TestClient) -> None:
    """Basic auth does not exist in this API, and must not fall through to "no credentials"."""
    response = probe_client.get(PROBE_PATH, headers={"Authorization": "Basic Y3JlYXRvcjpwdw=="})

    assert response.status_code == 401
    assert response.json() == {"detail": UNAUTHENTICATED_DETAIL}


@pytest.mark.parametrize(
    "make_token",
    [
        pytest.param(lambda secret: "this-is-not-a-jwt", id="malformed"),
        pytest.param(lambda secret: "", id="empty"),
        pytest.param(
            lambda secret: forge_token(secret, issued_days_ago=40, expires_in_days=-10),
            id="expired",
        ),
        pytest.param(lambda secret: forge_token("a-different-secret-" + "y" * 32), id="wrong-key"),
        pytest.param(lambda secret: forge_token(secret, sub="987654321"), id="unknown-creator"),
        pytest.param(
            lambda secret: forge_token(secret, sub="not-an-integer"), id="non-integer-sub"
        ),
    ],
)
def test_unusable_credentials_are_all_refused_the_same_way(
    probe_client: TestClient,
    creator: Creator,
    harness_secret: str,
    make_token: Any,
) -> None:
    """Five different failures, one indistinguishable response — and no reissue on any of them.

    `unknown-creator` is the interesting one: the signature is this deployment's own and the expiry
    is real, so it is the closest thing v0.1 has to revocation (there is no denylist). It must still
    be the same 401, because saying "that account is gone" confirms the token was otherwise good.

    The reissue assertion is here rather than in its own test because the failure it guards against
    is subtle: a `current_creator` that minted the header *before* checking the creator still
    existed would hand a fresh thirty-day token to a request it then refused.
    """
    response = probe_client.get(PROBE_PATH, headers=bearer(make_token(harness_secret)))

    assert response.status_code == 401
    assert response.json() == {"detail": UNAUTHENTICATED_DETAIL}
    assert REISSUE_HEADER not in response.headers


# ---------------------------------------------------------------------------
# Sliding reissue — FR-002a
# ---------------------------------------------------------------------------


def test_a_fresh_token_is_not_reissued(probe_app: FastAPI, auth_client: TestClient) -> None:
    """Half of the reissue contract, and the half that breaks silently.

    A `current_creator` that always sets the header still passes every other test in this file: the
    session works, it just rolls its token on every request. That is not sliding reissue, and it
    would only be noticed as an unexplained header on the wire.
    """
    response = auth_client.get(PROBE_PATH)

    assert response.status_code == 200
    assert REISSUE_HEADER not in response.headers


def test_a_token_just_short_of_half_life_is_not_reissued(
    probe_client: TestClient, creator: Creator, harness_secret: str
) -> None:
    """Issued 10 days into a 30-day life: the midpoint is still five days away."""
    token = forge_token(harness_secret, sub=str(creator.id), issued_days_ago=10, expires_in_days=20)

    response = probe_client.get(PROBE_PATH, headers=bearer(token))

    assert response.status_code == 200
    assert REISSUE_HEADER not in response.headers


def test_a_token_past_half_life_is_reissued(
    probe_client: TestClient, creator: Creator, harness_secret: str
) -> None:
    """Issued 20 days into a 30-day life: five days past the midpoint.

    Without this header the proxy has nothing to rewrite its cookie from, and the creator is signed
    out on day 30 with nothing in any log to explain it.
    """
    token = forge_token(harness_secret, sub=str(creator.id), issued_days_ago=20, expires_in_days=10)

    response = probe_client.get(PROBE_PATH, headers=bearer(token))

    assert response.status_code == 200
    assert response.headers[REISSUE_HEADER] != token


def test_the_reissued_token_works_and_does_not_immediately_reissue(
    probe_client: TestClient, creator: Creator, harness_secret: str
) -> None:
    """The other half: a reissued token must be a *session*, not a coupon.

    Two failures hide here. A header carrying something that does not authenticate leaves the proxy
    replacing a working cookie with a broken one — the creator is logged out by the very mechanism
    meant to keep them in. And a reissued token that is itself past half-life would reissue on every
    subsequent request forever, which is the treadmill `test_a_fresh_token_is_not_reissued` guards
    from the other side.
    """
    stale = forge_token(harness_secret, sub=str(creator.id), issued_days_ago=20, expires_in_days=10)
    reissued = probe_client.get(PROBE_PATH, headers=bearer(stale)).headers[REISSUE_HEADER]

    response = probe_client.get(PROBE_PATH, headers=bearer(reissued))

    assert response.status_code == 200
    assert response.json() == {"creator_id": creator.id}
    assert REISSUE_HEADER not in response.headers


# ---------------------------------------------------------------------------
# Logout — the deliberate asymmetry
# ---------------------------------------------------------------------------


def test_logout_with_a_valid_token_is_an_empty_204(auth_client: TestClient) -> None:
    """204 with a body is malformed, and some proxies reject it — hence the explicit `Response`."""
    response = auth_client.post("/auth/logout")

    assert response.status_code == 204
    assert response.content == b""


@pytest.mark.parametrize(
    "make_token",
    [
        pytest.param(
            lambda secret: forge_token(secret, issued_days_ago=40, expires_in_days=-10),
            id="expired",
        ),
        pytest.param(lambda secret: "this-is-not-a-jwt", id="malformed"),
        pytest.param(lambda secret: forge_token("a-different-secret-" + "y" * 32), id="wrong-key"),
    ],
)
def test_logout_succeeds_for_a_credential_that_would_never_authenticate(
    client: TestClient, harness_secret: str, make_token: Any
) -> None:
    """Sign-out must survive a dead session, or the creator is stuck holding one they cannot clear.

    This is why `presented_token` exists and why logout does not depend on `CurrentCreator`. Each of
    these three tokens is refused with a 401 by the probe route above; all three end a session.
    """
    response = client.post("/auth/logout", headers=bearer(make_token(harness_secret)))

    assert response.status_code == 204


def test_logout_with_no_credentials_at_all_is_401(client: TestClient) -> None:
    """The other side of the asymmetry, and the one the contract declares.

    `presented_token` requires a credential to *exist* without requiring it to be valid. Letting an
    anonymous request return 204 would make logout a public endpoint that lies about having done
    something.
    """
    response = client.post("/auth/logout")

    assert response.status_code == 401
    assert response.json() == {"detail": UNAUTHENTICATED_DETAIL}
