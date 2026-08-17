"""Cloudflare R2 — presigned PUT and presigned GET, and nothing else.

`tech-defaults.md`'s Object storage section: photographs only, image bytes never touch this
backend, and every read is a freshly minted presigned URL, never a public bucket. R2 is
S3-compatible, so `boto3`'s S3 client works against it with `endpoint_url` overridden — no
Cloudflare-specific SDK exists or is needed (`plan.md`: "the exact library is a task-level
decision, not a plan-level one").
"""

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import uuid4

import boto3
from botocore.client import Config
from mypy_boto3_s3 import S3Client

from app.config import get_settings
from app.schemas import PhotoUploadUrl

# Short-lived in both directions. A PUT URL that outlived the upload window would be a credential
# an abandoned browser tab could still use; a GET URL is re-minted on every read (FR-024), so
# there is never a reason for one to live long enough to be worth caching or sharing.
UPLOAD_URL_TTL_SECONDS = 300
READ_URL_TTL_SECONDS = 300


class ObjectStorageNotConfiguredError(RuntimeError):
    """Raised when a photograph operation is attempted with no R2 credentials configured.

    Its whole job is to make a misconfiguration say what it is. See `_require_settings`.
    """


def _require_settings() -> tuple[str, str, str, str]:
    """Fail loudly, and by name, when R2 is not configured (T057, 2026-08-17).

    **This is the "empty variable overrides a default" trap firing one layer later than T001
    predicted it.** T001 added these four settings with `default=""` and stated its own purpose as
    preventing exactly that trap — but an empty default is not an absent variable, so nothing here
    ever noticed, and the failure surfaced only when the T056 quickstart walk tried to upload a
    photograph and got `ValueError: Invalid endpoint: https://.r2.cloudflarestorage.com` out of
    botocore: a 500 whose message names neither R2 nor a setting, from a URL string assembled out of
    an empty account id.

    Still a 500 to the caller — a server with no credentials configured is not the client's mistake,
    and the contract declares no status for it. What changes is that the message names the four
    variables, so the next person to hit it reads the cause instead of deriving it.
    """
    settings = get_settings()
    configured = {
        "R2_ACCOUNT_ID": settings.r2_account_id,
        "R2_ACCESS_KEY_ID": settings.r2_access_key_id,
        "R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key,
        "R2_BUCKET_NAME": settings.r2_bucket_name,
    }
    missing = sorted(name for name, value in configured.items() if not value)
    if missing:
        raise ObjectStorageNotConfiguredError(
            "Cloudflare R2 is not configured, so photograph storage is unavailable. "
            f"Empty or unset: {', '.join(missing)}. "
            "No bucket has been provisioned for this product yet — see the T056 walk note in "
            "specs/003-travel-map/tasks.md."
        )
    return (
        settings.r2_account_id,
        settings.r2_access_key_id,
        settings.r2_secret_access_key,
        settings.r2_bucket_name,
    )


@lru_cache
def _client() -> S3Client:
    """The R2 client, built once per process — the same caching reason `get_settings` states:
    constructing a boto3 client is not free, and this backend talks to exactly one bucket.

    `lru_cache` is why `_require_settings` is called by each public function rather than only here:
    a cached client would make the configuration check run once per process instead of once per
    request, and a backend that started before its credentials existed would keep reporting the
    stale answer.
    """
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def create_upload_url(destination_id: int) -> PhotoUploadUrl:
    """Mint a presigned PUT for one new photograph (FR-023).

    The object key is generated **here**, never supplied by the caller: `destination_id` scopes
    it so the bucket's layout mirrors the data model, and the `uuid4` suffix is what makes two
    photographs attached in the same request never collide. The browser `PUT`s image bytes to
    `upload_url` directly — this backend never receives them (`tech-defaults.md`).
    """
    *_, bucket_name = _require_settings()
    object_key = f"destinations/{destination_id}/{uuid4().hex}"

    upload_url = _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name, "Key": object_key},
        ExpiresIn=UPLOAD_URL_TTL_SECONDS,
    )

    return PhotoUploadUrl(
        upload_url=upload_url,
        object_key=object_key,
        expires_at=datetime.now(UTC) + timedelta(seconds=UPLOAD_URL_TTL_SECONDS),
    )


def read_url(object_key: str) -> str:
    """Mint a presigned GET for an existing photograph (FR-024).

    Called fresh on every `GET /destinations/{destination_id}` — never stored, never cached, so a
    URL that leaked (a screenshot, a shared link) stops working on its own rather than needing
    revocation.
    """
    *_, bucket_name = _require_settings()
    url: str = _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket_name, "Key": object_key},
        ExpiresIn=READ_URL_TTL_SECONDS,
    )
    return url
