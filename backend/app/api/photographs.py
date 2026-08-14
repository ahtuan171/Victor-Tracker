"""The per-Destination photograph routes: upload-url, confirm, delete. Stub at T008 — implemented
at T026-T028 (User Story 2), calling `app/services/object_storage.py` (T007).

Prefixed `/destinations` rather than its own resource root: every operation here is
`/destinations/{destination_id}/photos...` in `contracts/openapi.yaml` — a photograph has no
identity apart from the Destination it belongs to. Kept in its own module rather than
`destinations.py` because the upload flow (mint a presigned URL, then confirm) is a distinct
concern from Destination CRUD, matching `plan.md`'s Project Structure.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/destinations", tags=["photographs"])
