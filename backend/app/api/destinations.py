"""The Destination routes. Stub at T008 — `listDestinations`/`createDestination` land at T012-T013
(User Story 1); `getDestination`/`updateDestination`/`deleteDestination` at T023-T025 (User Story
2); FR-017's containment check at T039 (User Story 3).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/destinations", tags=["destinations"])
