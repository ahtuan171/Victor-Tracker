"""`app/ai/context.py` — what reaches the model, and more importantly what does not.

This is the only place in the product where stored records leave the machine, so the tests that
matter most here are the ones asserting an **absence**: a note the owner wrote, and a photograph
they uploaded, must never appear in a prompt.

`backend/AGENTS.md` warns that "a test that asserts an absence passes trivially when it is broken" —
green against an empty database, green against a typo in a column name, green against a function
that returns "". Every exclusion test below therefore seeds a note, asserts the *place* is present,
and only then asserts the note is not. If the function stopped working entirely, the first assertion
fails and the second never gets to pass for the wrong reason.
"""

from datetime import date

from sqlmodel import Session

from app.ai.context import build_travel_context
from app.models import Destination, DestinationStatus, Photograph, Trip, TripStatus

NOTE = "Marble Mountains at sunrise, and the coffee place under the bridge."
TRIP_NOTE = "Booked through the agency on Hai Phong street."


def _destination(session: Session, **overrides: object) -> Destination:
    """A visited place with a note, unless a test says otherwise."""
    fields: dict[str, object] = {
        "name": "Da Nang",
        "latitude": 16.0544,
        "longitude": 108.2022,
        "status": DestinationStatus.VISITED,
        "note": NOTE,
    }
    fields.update(overrides)
    destination = Destination(**fields)  # type: ignore[arg-type]
    session.add(destination)
    session.commit()
    session.refresh(destination)
    return destination


# ---------------------------------------------------------------------------
# The exclusions. These are the reason this module is tested at all.
# ---------------------------------------------------------------------------


def test_a_destination_note_never_reaches_the_prompt(session: Session) -> None:
    """The owner's decision (2026-08-23): everything except photographs and notes.

    `context.py` enforces it by selecting named columns, so `note` is never fetched. This test is
    what turns that from a comment into a guarantee: adding `Destination.note` to that select makes
    this fail.
    """
    _destination(session)

    profile = build_travel_context(session)

    # The place is there — so a failure below is about the note, not about the function being dead.
    assert "Da Nang" in profile
    assert NOTE not in profile
    assert "Marble Mountains" not in profile


def test_a_trip_note_never_reaches_the_prompt(session: Session) -> None:
    """`Trip.notes` is the same decision on the other entity, and it has its own column list."""
    trip = Trip(
        name="Da Nang 2026",
        start_date=date(2026, 8, 15),
        end_date=date(2026, 8, 17),
        status=TripStatus.PLANNED,
        notes=TRIP_NOTE,
    )
    session.add(trip)
    session.commit()

    profile = build_travel_context(session)

    assert "Da Nang 2026" in profile
    assert TRIP_NOTE not in profile
    assert "Hai Phong" not in profile


def test_a_photograph_never_reaches_the_prompt(session: Session) -> None:
    """Photographs are excluded by `Photograph` not being imported at all.

    An object key is not secret in the way a note is, but it names a file in the owner's archive and
    the decision covers it. This test fails the moment someone joins the table in.
    """
    destination = _destination(session, note=None)
    assert destination.id is not None
    session.add(
        Photograph(destination_id=destination.id, object_key="destinations/1/sunrise-0421.jpg")
    )
    session.commit()

    profile = build_travel_context(session)

    assert "Da Nang" in profile
    assert "sunrise-0421" not in profile
    assert ".jpg" not in profile


def test_coordinates_never_reach_the_prompt(session: Session) -> None:
    """Excluded for a smaller reason than the notes: a model already knows where Da Nang is, so
    latitude and longitude cost tokens and buy nothing. Asserted so a later edit has to mean it."""
    _destination(session, note=None)

    profile = build_travel_context(session)

    assert "16.05" not in profile
    assert "108.20" not in profile


# ---------------------------------------------------------------------------
# What the profile does contain
# ---------------------------------------------------------------------------


def test_no_records_produces_an_empty_string(session: Session) -> None:
    """Empty rather than a "TRAVEL PROFILE" heading over nothing.

    `compose_system_prompt` leaves the block out entirely on an empty string, which is what lets the
    system prompt tell the model the archive is empty instead of showing it an empty table.
    """
    assert build_travel_context(session) == ""


def test_places_are_grouped_under_their_status(session: Session) -> None:
    """Three statuses, three headings — and a status with no places prints no heading at all."""
    _destination(session, name="Ha Long Bay", note=None)
    _destination(session, name="Reykjavik", status=DestinationStatus.WISHLIST, note=None)

    profile = build_travel_context(session)

    assert "VISITED" in profile
    assert "WISHLIST" in profile
    assert "PLANNED" not in profile

    # Order matters: the heading a place sits under is the whole point of the grouping.
    visited_at = profile.index("VISITED")
    wishlist_at = profile.index("WISHLIST")
    assert visited_at < profile.index("Ha Long Bay") < wishlist_at
    assert wishlist_at < profile.index("Reykjavik")


def test_a_dated_place_carries_its_range(session: Session) -> None:
    _destination(
        session,
        name="Tokyo",
        status=DestinationStatus.PLANNED,
        start_date=date(2026, 9, 7),
        end_date=date(2026, 9, 11),
        note=None,
    )

    profile = build_travel_context(session)

    assert "2026-09-07 to 2026-09-11" in profile


def test_a_single_day_place_prints_one_date_not_a_range(session: Session) -> None:
    """`2026-09-07 to 2026-09-07` is noise. The formatter collapses it."""
    _destination(
        session,
        name="Nara",
        start_date=date(2026, 9, 7),
        end_date=date(2026, 9, 7),
        note=None,
    )

    profile = build_travel_context(session)

    assert "2026-09-07" in profile
    assert "to 2026-09-07" not in profile


def test_a_place_with_one_bound_prints_that_bound(session: Session) -> None:
    """A half-dated place is ordinary — a visited place often has a start and no end."""
    _destination(session, name="Hoi An", start_date=date(2026, 3, 2), note=None)

    profile = build_travel_context(session)

    assert "2026-03-02" in profile


def test_an_undated_place_prints_no_date(session: Session) -> None:
    _destination(session, name="Patagonia", status=DestinationStatus.WISHLIST, note=None)

    profile = build_travel_context(session)

    assert "Patagonia" in profile
    assert "2026" not in profile


def test_a_place_names_its_trip(session: Session) -> None:
    """The link is what lets the model say "before your December trip" rather than listing rows."""
    trip = Trip(
        name="Japan 2026",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 15),
        status=TripStatus.PLANNED,
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)

    _destination(session, name="Tokyo", status=DestinationStatus.PLANNED, trip_id=trip.id, note=None)

    profile = build_travel_context(session)

    assert "trip: Japan 2026" in profile


def test_trips_are_listed_with_their_status_and_dates(session: Session) -> None:
    session.add(
        Trip(
            name="Japan 2026",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 15),
            status=TripStatus.PLANNED,
        )
    )
    session.commit()

    profile = build_travel_context(session)

    assert "TRIPS" in profile
    assert "Japan 2026" in profile
    assert "planned" in profile
    assert "2026-09-01 to 2026-09-15" in profile
