"""The Trip routes. Stub at T008 — `listTrips`/`createTrip` land at T036, `getTrip`/`updateTrip`/
`deleteTrip` at T036-T037 (User Story 3).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/trips", tags=["trips"])
