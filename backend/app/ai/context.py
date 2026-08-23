"""The owner's travel data, rendered for the model.

This is the module that turns Travel Intelligence from a travel chatbot into something that knows
who is asking. It is also the only place in the product where stored records leave the machine, so
what it may read is narrow and enforced by construction rather than by discipline.

## What is excluded, and how

**`Destination.note`, `Trip.notes`, and every photograph are never read.** Not filtered out after
loading — never selected. Each query below names its columns explicitly, so a note cannot reach a
prompt through a later edit that forgets to strip it, and `Photograph` is not imported at all.

That distinction is the whole design. `select(Destination)` plus a comment saying "do not send the
note" is one careless `model_dump()` away from a leak; naming the columns cannot leak what it never
fetched.

Coordinates are excluded too, for a different and much smaller reason: a language model already
knows where Tokyo is, so latitude and longitude buy nothing and cost tokens.

The owner's decision (2026-08-23) was "everything except photographs and notes".

## The two `type: ignore`s below are a stub limitation, not a code smell

SQLModel's typed `select()` overloads stop at four columns; the destination query needs six, so
mypy reports `No overload variant matches` against perfectly valid SQL.

`sqlalchemy.select` has no such ceiling and was tried first — but reading it back needs
`session.execute`, which SQLModel deprecates, and `pyproject.toml` sets `filterwarnings = ["error"]`
so that deprecation becomes a failing test rather than a log line. Two narrow ignores are the
smaller cost. `warn_unused_ignores` is on, so they will be flagged the day SQLModel widens the
overloads.
"""

from datetime import date

from sqlmodel import Session, select

from app.models import Destination, DestinationStatus, Trip


def _format_dates(start: date | None, end: date | None) -> str:
    """A compact date range, or empty when the place carries no dates."""
    if start is None and end is None:
        return ""
    if start is not None and end is not None:
        return f"{start.isoformat()} to {end.isoformat()}" if start != end else start.isoformat()
    known = start if start is not None else end
    if known is None:  # pragma: no cover - the both-None case returned above
        return ""
    return known.isoformat()


def build_travel_context(session: Session) -> str:
    """Render the owner's destinations and trips as a block for the system prompt.

    Returns an empty string when there is nothing recorded, so the caller can leave the profile out
    entirely rather than telling the model about an empty archive.
    """
    trip_names: dict[int, str] = {
        trip_id: name
        for trip_id, name in session.exec(select(Trip.id, Trip.name)).all()
        if trip_id is not None
    }

    # Columns, not entities. See this module's docstring: `note` is absent from this list, and that
    # absence is the enforcement.
    rows = session.exec(
        select(
            Destination.name,
            Destination.status,
            Destination.start_date,
            Destination.end_date,
            Destination.category,
            Destination.trip_id,  # type: ignore[call-overload]
        ).order_by(Destination.status, Destination.name)
    ).all()

    by_status: dict[DestinationStatus, list[str]] = {
        DestinationStatus.VISITED: [],
        DestinationStatus.PLANNED: [],
        DestinationStatus.WISHLIST: [],
    }

    for name, status, start, end, category, trip_id in rows:
        parts = [name]
        dates = _format_dates(start, end)
        if dates:
            parts.append(dates)
        if category is not None:
            parts.append(str(category))
        if trip_id is not None and trip_id in trip_names:
            parts.append(f"trip: {trip_names[trip_id]}")
        by_status.setdefault(status, []).append("  ".join(parts))

    trips = session.exec(
        select(
            Trip.name,
            Trip.status,
            Trip.start_date,
            Trip.end_date,
            Trip.destination,  # type: ignore[call-overload]
        ).order_by(Trip.start_date)
    ).all()

    sections: list[str] = []
    for status, label in (
        (DestinationStatus.VISITED, "VISITED"),
        (DestinationStatus.PLANNED, "PLANNED"),
        (DestinationStatus.WISHLIST, "WISHLIST"),
    ):
        entries = by_status.get(status) or []
        if entries:
            sections.append(label + "\n" + "\n".join(entries))

    if trips:
        lines = []
        for name, status, start, end, destination in trips:
            row = f"{name}  {status}  {_format_dates(start, end)}"
            if destination:
                row += f"  ({destination})"
            lines.append(row)
        sections.append("TRIPS\n" + "\n".join(lines))

    if not sections:
        return ""

    return "TRAVEL PROFILE\n\n" + "\n\n".join(sections)


__all__ = ["build_travel_context"]
