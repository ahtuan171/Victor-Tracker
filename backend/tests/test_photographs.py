"""Upload-url, confirm, delete — the photograph routes (T034, User Story 2).

Every test stubs `app.services.object_storage` entirely; no real R2 bucket is provisioned in
this environment or in CI, and none of these tests needs one — the object storage boundary is
`create_upload_url`/`read_url`, and this file only proves the routes call the right shape at the
right moment, not that R2 itself works. Patched on the names *bound into `app.api.photographs`*
(`from ... import create_upload_url, read_url`), matching `test_destinations.py`'s own note about
why the defining module is not the patch target.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import Photograph
from app.schemas import PhotoUploadUrl

DESTINATIONS_PATH = "/destinations"


@pytest.fixture(autouse=True)
def _stub_object_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.photographs.create_upload_url",
        lambda destination_id: PhotoUploadUrl(
            upload_url=f"https://stub.example/upload/{destination_id}",
            object_key=f"destinations/{destination_id}/stub-key",
            expires_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
    )
    monkeypatch.setattr(
        "app.api.photographs.read_url", lambda object_key: f"https://stub.example/{object_key}"
    )


@pytest.fixture
def destination_id(auth_client: TestClient) -> int:
    created = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Kyoto", "latitude": 35.0116, "longitude": 135.7681}
    ).json()
    return int(created["id"])


# --- Upload URL (T026) --------------------------------------------------------------------


def test_create_photo_upload_url_returns_the_contracted_shape(
    auth_client: TestClient, destination_id: int
) -> None:
    response = auth_client.post(f"{DESTINATIONS_PATH}/{destination_id}/photos/upload-url")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"upload_url", "object_key", "expires_at"}
    assert body["object_key"] == f"destinations/{destination_id}/stub-key"


def test_create_photo_upload_url_requires_a_credential(
    client: TestClient, destination_id: int
) -> None:
    response = client.post(f"{DESTINATIONS_PATH}/{destination_id}/photos/upload-url")
    assert response.status_code == 401


def test_create_photo_upload_url_404s_on_a_missing_destination(auth_client: TestClient) -> None:
    response = auth_client.post(f"{DESTINATIONS_PATH}/999999/photos/upload-url")
    assert response.status_code == 404


# --- Confirm (T027) ------------------------------------------------------------------------


def test_create_photograph_records_the_object_key(
    auth_client: TestClient, destination_id: int, session: Session
) -> None:
    response = auth_client.post(
        f"{DESTINATIONS_PATH}/{destination_id}/photos",
        json={"object_key": f"destinations/{destination_id}/stub-key"},
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "url", "created_at"}
    assert body["url"] == f"https://stub.example/destinations/{destination_id}/stub-key"

    rows = session.exec(select(Photograph)).all()
    assert len(rows) == 1
    assert rows[0].destination_id == destination_id
    assert rows[0].object_key == f"destinations/{destination_id}/stub-key"


def test_create_photograph_requires_a_credential(client: TestClient, destination_id: int) -> None:
    response = client.post(f"{DESTINATIONS_PATH}/{destination_id}/photos", json={"object_key": "x"})
    assert response.status_code == 401


def test_create_photograph_404s_on_a_missing_destination(auth_client: TestClient) -> None:
    response = auth_client.post(f"{DESTINATIONS_PATH}/999999/photos", json={"object_key": "x"})
    assert response.status_code == 404


def test_create_photograph_422s_on_a_missing_object_key(
    auth_client: TestClient, destination_id: int
) -> None:
    response = auth_client.post(f"{DESTINATIONS_PATH}/{destination_id}/photos", json={})
    assert response.status_code == 422


# --- Delete (T028) --------------------------------------------------------------------------


def test_delete_photograph_removes_the_row(
    auth_client: TestClient, destination_id: int, session: Session
) -> None:
    photograph = Photograph(destination_id=destination_id, object_key="destinations/1/stub-key")
    session.add(photograph)
    session.commit()
    session.refresh(photograph)
    photograph_id = photograph.id

    response = auth_client.delete(f"{DESTINATIONS_PATH}/{destination_id}/photos/{photograph_id}")

    assert response.status_code == 204
    assert session.get(Photograph, photograph_id) is None


def test_delete_photograph_requires_a_credential(client: TestClient, destination_id: int) -> None:
    response = client.delete(f"{DESTINATIONS_PATH}/{destination_id}/photos/1")
    assert response.status_code == 401


def test_delete_photograph_404s_on_a_missing_destination(auth_client: TestClient) -> None:
    response = auth_client.delete(f"{DESTINATIONS_PATH}/999999/photos/1")
    assert response.status_code == 404


def test_delete_photograph_404s_on_a_missing_photograph(
    auth_client: TestClient, destination_id: int
) -> None:
    response = auth_client.delete(f"{DESTINATIONS_PATH}/{destination_id}/photos/999999")
    assert response.status_code == 404


def test_delete_photograph_404s_when_the_photo_belongs_to_a_different_destination(
    auth_client: TestClient, destination_id: int, session: Session
) -> None:
    """A `photo_id` real elsewhere is still "no such photograph" for *this* Destination — the
    path names both, and the delete must honour the pairing, not just the photo's own id.
    """
    other = auth_client.post(
        DESTINATIONS_PATH, json={"name": "Osaka", "latitude": 34.6937, "longitude": 135.5023}
    ).json()
    photograph = Photograph(destination_id=other["id"], object_key="destinations/2/stub-key")
    session.add(photograph)
    session.commit()
    session.refresh(photograph)

    response = auth_client.delete(f"{DESTINATIONS_PATH}/{destination_id}/photos/{photograph.id}")

    assert response.status_code == 404
    assert session.get(Photograph, photograph.id) is not None


# --- The unconfigured-R2 guard (T057) -----------------------------------------------------
#
# These are the only tests in this file that reach the real `app.services.object_storage`
# rather than the stub above, because the guard *is* the boundary the stub replaces. They still
# touch no network: `_require_settings` refuses before any client is constructed.


def test_object_storage_names_the_missing_variables_when_r2_is_unconfigured() -> None:
    """T057. The T056 quickstart walk found all four `r2_*` settings empty and the failure
    surfacing as `ValueError: Invalid endpoint: https://.r2.cloudflarestorage.com` — botocore
    assembling a URL out of an empty account id, in a message naming neither R2 nor a setting.

    The guard's whole value is the message, so the message is what this asserts. Note it fails
    for the *right* reason only because `get_settings` is `lru_cache`d against this process's
    own environment, where R2 is genuinely unconfigured — see the paired test below, which is
    what stops this one passing vacuously if that ever changes.
    """
    from app.services import object_storage

    with pytest.raises(object_storage.ObjectStorageNotConfiguredError) as raised:
        object_storage.create_upload_url(1)

    message = str(raised.value)
    assert "R2_ACCOUNT_ID" in message
    assert "R2_ACCESS_KEY_ID" in message
    assert "R2_SECRET_ACCESS_KEY" in message
    assert "R2_BUCKET_NAME" in message


def test_object_storage_gets_past_the_guard_once_r2_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The control for the test above, and the reason it is not vacuous.

    `assert raises(...)` is green against a guard that refuses unconditionally — the exact
    "a test that asserts an absence passes trivially when it is broken" trap `backend/AGENTS.md`
    records. This proves the guard *stops* refusing when the four settings are present, which is
    the only thing that makes the first test evidence about configuration rather than about a
    function that always throws.
    """
    from app.config import get_settings
    from app.services import object_storage

    settings = get_settings()
    for field in ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket_name"):
        monkeypatch.setattr(settings, field, "configured")

    assert object_storage._require_settings() == (
        "configured",
        "configured",
        "configured",
        "configured",
    )
