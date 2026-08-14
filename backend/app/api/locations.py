"""`GET /locations/search`. Stub at T008 — implemented at T038 (User Story 3), calling
`app/services/geocoding.py` (T006).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/locations", tags=["locations"])
