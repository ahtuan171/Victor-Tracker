"""The two tables.

Column-for-column what [data-model.md](../../specs/001-content-calendar/data-model.md) specifies. If
this file and that document disagree, one of them is wrong and the answer is not "adjust the code
quietly" — see the non-negotiables in CLAUDE.md.

Two absences are load-bearing and easy to "fix" by accident:

* **No owner column** on `content_item`. Not `user_id`, not `owner_id`, not `tenant_id`. FR-003 and
  constitution VII: there is one creator, and a foreign key to a single row taxes every query and
  migration in exchange for nothing. INV-4, and T019 asserts it against the live schema.
* **No version or etag column.** FR-023a specifies last-write-wins with no conflict detection. A
  version column that nothing reads is exactly the speculative infrastructure principle VII names.

The `CHECK` constraints for INV-1 and INV-2 are written by hand in the T011 migration rather than
declared here, because autogenerate does not round-trip them reliably. They are enforced at the API
boundary as well — a constraint reached by a request is a 500, and the boundary turns it into the
409 the contract declares.
"""

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Column, Date, DateTime, Identity, Integer, String, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


class Status(StrEnum):
    """FR-007. Exactly three states.

    `StrEnum` rather than data-model.md's `(str, Enum)`: identical values, but `f"{Status.IDEA}"`
    renders as `idea` instead of `Status.IDEA`, which is the difference between a readable log line
    and a confusing one.

    `overdue` is deliberately not here. It is derived at render time from `scheduled_date < today`
    (data-model.md), so it cannot go stale, and keeping it out is what keeps FR-007's three states
    three — and keeps R-005's three distinguishable cues sufficient.
    """

    IDEA = "idea"
    DRAFT = "draft"
    POSTED = "posted"


class Platform(StrEnum):
    """FR-010. A closed set the creator cannot extend, which is why it is not a table."""

    TIKTOK = "tiktok"
    INSTAGRAM = "instagram"
    YOUTUBE = "youtube"


STATUS_ORDER: tuple[Status, ...] = (Status.IDEA, Status.DRAFT, Status.POSTED)
"""Pipeline order, for comparisons like "is this past `idea`".

A module-level tuple rather than integer enum values, per data-model.md: FR-008 makes movement
bidirectional and `idea -> posted` legal directly, so an ordered numeric enum would invite
arithmetic that implies transitions the spec does not require.
"""


def _identity_pk() -> Column[int]:
    """An identity primary key, which is what data-model.md specifies.

    SQLAlchemy's default for an integer primary key is `SERIAL`. Identity columns are the standard
    replacement and avoid `SERIAL`'s separate-sequence ownership quirks — notably a sequence left
    behind, or left un-advanced, by a bulk insert that supplied explicit ids.
    """
    return Column(Integer, Identity(), primary_key=True)


def _pg_enum(enum_type: type[StrEnum], name: str) -> SAEnum:
    """A Postgres enum that stores the member *values*, not their Python names.

    SQLAlchemy's default is to store `IDEA`, while the contract, the frontend, and every fixture use
    `idea`. The mismatch does not surface until the first round trip against a real database.
    """
    return SAEnum(
        enum_type,
        name=name,
        values_callable=lambda e: [member.value for member in e],
    )


class Creator(SQLModel, table=True):
    """The single v0.1 account. Exists only so a password hash has somewhere to live.

    No relationship to `ContentItem`. That is deliberate, and it is INV-4. Rows are created by
    `app.scripts.seed_user` and nowhere else — there is no registration endpoint, no password reset,
    and no email verification.
    """

    __tablename__ = "creator"

    id: int | None = Field(default=None, sa_column=_identity_pk())
    email: str = Field(sa_column=Column(String(320), nullable=False, unique=True))
    password_hash: str = Field(sa_column=Column(String(255), nullable=False))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )


class ContentItem(SQLModel, table=True):
    """One piece of content, somewhere in the `idea -> draft -> posted` pipeline."""

    __tablename__ = "content_item"

    id: int | None = Field(default=None, sa_column=_identity_pk())

    # FR-005: the only field required to create. INV-2 (a non-empty trimmed title) is a CHECK
    # constraint in the migration — NOT NULL alone permits '', and an item titled " " is
    # indistinguishable from a bug in the capture sheet.
    title: str = Field(sa_column=Column(String(200), nullable=False))

    hook: str | None = Field(default=None, sa_column=Column(String(500), nullable=True))

    # FR-010a: at most one platform. Nullable because FR-005 makes capture title-only, and INV-1
    # then requires a platform before the item can leave `idea`.
    platform: Platform | None = Field(
        default=None, sa_column=Column(_pg_enum(Platform, "platform"), nullable=True)
    )

    # DATE, not TIMESTAMP. FR-012a forbids a time component anywhere, and research.md R-006 chooses
    # this type specifically to make the midnight-UTC off-by-one unrepresentable in the data rather
    # than merely avoided. Indexed: every calendar read is a date-range query.
    scheduled_date: date | None = Field(
        default=None, sa_column=Column(Date, nullable=True, index=True)
    )

    status: Status = Field(
        default=Status.IDEA,
        sa_column=Column(
            _pg_enum(Status, "status"),
            nullable=False,
            server_default=Status.IDEA.value,
            index=True,
        ),
    )

    published_url: str | None = Field(default=None, sa_column=Column(String(2048), nullable=True))

    # Backlog ordering is created_at DESC (spec Assumptions); updated_at supports last-write-wins
    # diagnosis under FR-023.
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        )
    )
