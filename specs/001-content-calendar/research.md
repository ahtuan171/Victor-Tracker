# Phase 0 Research: Content Calendar

**Feature**: `001-content-calendar` | **Date**: 2026-07-30 | **Plan**: [plan.md](./plan.md)

The technology stack itself is not a research question — it is fixed by
`.claude/rules/tech-defaults.md` and the constitution's Scope Constraints, and the rejected
alternatives are already recorded there. What follows are the decisions that stack does *not* answer,
each of which would otherwise be discovered mid-implementation.

No `NEEDS CLARIFICATION` markers entered the Technical Context, so there are no unknowns to resolve —
these are design choices with real alternatives.

---

## R-001: How the JWT reaches the API

**Serves**: FR-001, FR-002, FR-002a, SC-006, SC-010, constitution principle II

**Problem**: the frontend deploys to Vercel and the backend to Render — two different origins. A
30-day credential is a large prize, and the spec requires that a signed-out visitor hitting any
address directly receives no content data.

**Decision**: the browser never talks to the Render origin. A Next.js catch-all route at
`app/api/[...path]/route.ts` forwards requests server-side to FastAPI, so from the browser's point of
view the API is first-party. The JWT lives in an `httpOnly; Secure; SameSite=Lax` cookie set on the
Vercel origin, and the proxy attaches it as an `Authorization: Bearer` header on the hop to FastAPI.

**Rationale**:

- `httpOnly` means JavaScript cannot read the token, so an XSS bug cannot exfiltrate a 30-day
  credential. This is the single highest-value protection available for the money.
- First-party means `SameSite=Lax`, which neutralises cross-site request forgery for state-changing
  requests without a separate CSRF token and its double-submit plumbing.
- FastAPI keeps a plain bearer-token contract, so the API stays testable with pytest and a header —
  no cookie handling in the backend test suite.
- Server-side rendering in the App Router can read the cookie directly, so a signed-out visitor is
  redirected before any content markup is generated. That is what makes SC-006 hold for *every*
  address rather than only the ones the client happens to guard.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| Token in `localStorage`, sent as a bearer header from the browser | Any XSS anywhere in the app hands over a 30-day credential. Constitution principle II calls this data commercially sensitive; this is the option that most directly contradicts it. |
| Cookie with `SameSite=None; Secure` directly against the Render origin | Works, but re-opens CSRF and so requires a CSRF token, a `credentials: 'include'` policy, and an exact CORS allowlist. More machinery than the proxy, for weaker properties. |
| Session cookie with server-side session storage | Would mean a session table or a Redis instance. `tech-defaults.md` specifies JWT, and adding a store to hold state for one user is exactly the speculative infrastructure principle VII exists to prevent. |

**Cost accepted**: one extra network hop through Vercel. Irrelevant against SC-005's one-second
budget for a filter, and the hop is between two data centres rather than over the creator's mobile
connection.

---

## R-002: Satisfying the 30-day session without a refresh token

**Serves**: FR-002a, SC-010

**Problem**: FR-002a asks for a session valid for ~30 days that "renew[s] silently while the creator
is active". The obvious mechanism is a refresh token — but `tech-defaults.md` is explicit: *"login +
access token only. No register, refresh, reset, or multi-tenant columns."* Taken naively, the spec and
the tech defaults disagree.

**Decision**: a single access token with a 30-day expiry and **sliding reissue**. When a request
arrives carrying a valid token that is more than halfway to expiry, the response sets a freshly issued
cookie with a new 30-day window. There is no second token type and no refresh endpoint.

**Rationale**: this is not a refresh token — it is the same access token, reissued. It satisfies
"renewing silently while the creator is active" literally, keeps the token count at one, and adds
about ten lines to a middleware. A creator who uses the app at least once a month never sees the login
screen again; one who abandons it for 30 days is asked to sign in, which is the intended behaviour.

**Why this is recorded rather than silently resolved**: constitution principle IV requires that when
spec and implementation constraints disagree, the resolution is stated explicitly rather than coded
around. The apparent conflict was real; this paragraph is the resolution. No amendment to `spec.md` or
`tech-defaults.md` is needed, because sliding reissue satisfies both as written.

**Alternatives considered**: a genuine access/refresh pair (rejected — directly contradicts
`tech-defaults.md`, and rotation logic is meaningful only when access tokens are short-lived, which
they are not here); a fixed 30-day token with no reissue (rejected — a creator using the app daily
would still be logged out on day 30 with no warning, which fails the spirit of FR-002a).

---

## R-003: Drag and tap as two triggers for one operation

**Serves**: FR-014, FR-014a, FR-015, FR-015a, FR-015b, SC-011, constitution principles I and V

**Problem**: FR-015b requires the whole `idea → posted` journey to be completable with no drag
gesture, while FR-014a and FR-015a require the drag path to exist too and produce an identical result.
Naively that is two implementations of every mutation.

**Decision**: one mutation function per field change, with two triggers.

- **Drag**: `@dnd-kit/core`, with both `PointerSensor` and `KeyboardSensor` registered. Draggables are
  item chips; droppables are day cells and the status lanes.
- **Tap**: tapping a chip opens a shadcn `Sheet` anchored to the bottom of the viewport containing a
  date picker and a status control. This is the same sheet used for editing, so it is not extra
  surface.
- Both paths call the same `updateItem(id, patch)` in `lib/api.ts`, which issues one `PATCH`. The drag
  handler's only job is translating a drop target into `{ scheduled_date }` or `{ status }`.

**Rationale**: `@dnd-kit` was chosen over the alternatives because it is pointer-event based (so touch
works without a separate touch backend), it ships a `KeyboardSensor` that makes FR-015b achievable on
the drag path *as well*, and it does not require dragging a DOM node out of its container — which
matters when the container is a 375px grid that scrolls inside itself per FR-021.

Making the tap path the *primary* one, with drag layered on, also means the Playwright E2E flow drives
taps. Drag automation is the flakiest thing in a browser test suite, and `workflow.md` requires the E2E
flow to gate merges — a flaky gate gets disabled, and a disabled gate violates principle VI.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| HTML5 native drag-and-drop | Does not fire on touch devices. Non-starter for a phone-first product. |
| `react-beautiful-dnd` / `@hello-pangea/dnd` | Optimised for lists rather than a two-dimensional grid, and it wants to control the scroll container that FR-021 requires us to control. |
| Drag only, per the literal wording of `workflow.md`'s build order | Contradicts FR-015b. `workflow.md` says "drag-and-drop status"; it does not say drag *only*. The spec is the source of truth (principle IV), so the spec's requirement wins and the build order is read as compatible. |

---

## R-004: Calendar grid — build it, do not adopt one

**Serves**: FR-013, FR-017, FR-018, FR-021, SC-003

**Decision**: hand-build the month grid and week view from `date-fns` primitives. No calendar library.
`date-fns` supplies `startOfMonth`, `eachDayOfInterval`, `startOfWeek`, `addMonths`, and formatting;
the grid itself is CSS Grid with seven columns.

**Rationale**: every calendar library's value is in the parts this feature does not want — event
layout by time of day, resource columns, timezone handling, its own drag implementation, its own
theme. FR-012a removed time of day entirely, so a day cell is an unordered list of chips. What remains
is roughly 60 lines of date arithmetic against a fight with a library's opinions about cell rendering,
which is where FR-017's non-colour cue and FR-021's internal-scroll requirement both live.

**Alternatives considered**: FullCalendar (rejected — large, opinionated about DOM and CSS, and its
mobile story assumes a time grid); `react-day-picker` (rejected — a *date picker*, not a container for
per-day content; it is however a good fit for the date control inside the tap sheet, and is adopted
there via shadcn's Calendar primitive); `react-big-calendar` (rejected — time-grid-centric, and heavy
for a 375px baseline).

**Consequence for tasks**: the week view is a vertical list of seven day sections rather than a
horizontal seven-column grid. At 375px a seven-column week with readable chips is not achievable, and
FR-021 forbids solving that with horizontal page scroll. Month view keeps seven columns because its
cells hold compact chips; it scrolls vertically.

---

## R-005: Encoding status and platform so they survive glare and colourblindness

**Serves**: FR-017, FR-018, SC-004

**Decision**: status is encoded by **shape and fill together**, platform by a **letter-marked icon**.
Colour is present but never load-bearing.

| Status | Shape | Fill | Colour |
|---|---|---|---|
| `idea` | circle | outline only | neutral |
| `draft` | circle | half-filled | amber |
| `posted` | circle | solid, with check | green |

The progression outline → half → solid reads as pipeline progress even in greyscale, which is exactly
what SC-004 tests. Overdue items (an `idea` or `draft` whose date has passed) additionally carry a
left border, so overdue-ness is orthogonal to status rather than a fourth status — which keeps
FR-007's three-state pipeline honest.

Platform uses a small monogram badge — T, I, Y — rather than brand logos. Logos are trademarked
assets, vary in legibility at 16px, and would need to be bundled; a monogram is a text node.

**Rationale**: SC-004 is written as a test ("a viewer who cannot distinguish red from green can still
identify every item's status"), so the encoding has to be verifiable by inspection rather than by
taste. Shape plus fill is checkable in a greyscale screenshot.

**Alternatives considered**: colour plus text label (rejected — a text label per chip does not fit a
375px day cell alongside the title); distinct icon per status (rejected — three unrelated icons carry
no ordering, and the pipeline's whole value is that it is ordered).

---

## R-006: Storing a date with no time

**Serves**: FR-012, FR-012a, and the Timekeeping assumption

**Decision**: PostgreSQL `DATE`, mapped to Python `datetime.date`, serialised as `YYYY-MM-DD`. No
`TIMESTAMP`, no `TIMESTAMPTZ`, no timezone column, and no time component anywhere in the stack.

**Rationale**: FR-012a forbids asking for, storing, or displaying a time. A `TIMESTAMP` would invite
one back in through the type system — the first `new Date(value)` in the frontend would introduce a
midnight-UTC value that renders as the previous day for anyone west of Greenwich. Using `DATE` end to
end makes that bug unrepresentable rather than merely avoided.

**Consequence for tasks**: `lib/dates.ts` parses and formats date-only strings without ever
constructing a `Date` from a bare `YYYY-MM-DD` string. This is a known JavaScript footgun and belongs
in the trap list, not in a code comment nobody reads.

**Alternatives considered**: `TIMESTAMPTZ` normalised to midnight (rejected — carries a timezone
that FR-012a says does not exist, and every read has to remember to discard it); storing an ISO string
in a text column (rejected — gives up date comparison and range queries in SQL, which the month and
week views both need).

---

## Open items carried into later stages

- **No git remote exists.** The GitLab project, protected `main`, and the CI pipeline required by
  constitution principle VI do not exist yet. `glab` is not installed either. This blocks stage 3
  (Load) and the merge gate, not implementation. Recorded in [quickstart.md](./quickstart.md).
- **Design tokens are not yet chosen.** Stage 2 exports from Claude Design into
  `design/content-calendar/` establish colour, spacing, and type scale for all four modules. R-005
  fixes the *semantics* of the status cue (shape and fill progression); the palette that dresses it is
  a stage-2 decision.
