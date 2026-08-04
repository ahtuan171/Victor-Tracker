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
is active". The obvious mechanism is a refresh token — but `tech-defaults.md`'s Auth row was explicit,
reading at the time *"login + access token only. No register, refresh, reset, or multi-tenant
columns."* Taken naively, the spec and the tech defaults disagree. (**That row has since been amended
at T075** — see the process correction at the end of this section. The quotation above is what it said
when this conflict arose, and is kept because the argument below is about that wording.)

**Decision**: a single access token with a 30-day expiry and **sliding reissue**. There is no second
token type and no refresh endpoint.

**Transport** — this is the part a first draft of this document left unspecified, which made the whole
mechanism unimplementable. R-001 puts cookie handling entirely in the Next.js proxy and none in
FastAPI, so FastAPI cannot "set a cookie". The mechanism is therefore:

1. FastAPI's auth dependency decodes the token. If it is valid and past half-life, it issues a fresh
   one and attaches it to the response as an **`X-Access-Token` header**.
2. The proxy checks every response for that header. When present, it rewrites the session cookie with
   a new `Max-Age` and strips the header before the response reaches the browser.

Without step 1 there is no reissued credential in existence; without step 2 nothing writes it back.
Both are required, and both are now tasks.

**`Max-Age` is mandatory, not incidental.** A cookie with no `Max-Age` is a session cookie, which
mobile Safari discards when it evicts the tab. That alone would have produced a weekly login prompt
regardless of the token's 30-day validity, and it would have looked like a token bug.

**Rationale**: this is not a refresh token — it is the same access token, reissued. It satisfies
"renewing silently while the creator is active" literally, keeps the token count at one, and adds
roughly fifteen lines across a dependency and the proxy. A creator who opens the app at least monthly
never sees the login screen again.

**Accepted weakness, stated rather than hidden**: reissue-on-use means a token that leaks — through a
proxy log or a leaked deployment secret, not only through the XSS that R-001 defends against — grants
indefinite access rather than at most 30 days. v0.1 has no denylist, so there is no revocation. R-001's
security argument covers exfiltration *from the browser*; it does not cover exfiltration from the
server side, and nothing in v0.1 does. Accepted for a single-user tool; it is the first thing to
revisit if this ever serves a second person, and it is recorded under Deferred in `.claude/memory.md`.

Related and equally worth stating: FR-002a says a session "MUST end only on expiry or an explicit
sign-out". Sign-out clears the cookie, which ends the session from the browser's point of view but
leaves the token itself valid until expiry. That is the honest reading of a stateless token without a
denylist, and it is what `POST /auth/logout` does.

**Why this is recorded rather than silently resolved**: constitution principle IV requires that when
spec and implementation constraints disagree, the resolution is stated explicitly rather than coded
around. The apparent conflict was real; this section is the resolution.

**Process correction**: an earlier draft asserted that no amendment to `tech-defaults.md` was needed.
That was the plan grading its own reinterpretation of a locked row — and `tech-defaults.md` says
changing a row is a Reflect-stage decision. The mechanism stands, but the *rule* should be inherited
by later modules rather than re-derived from this argument.

**Discharged at T075 (2026-08-03).** The Auth row now reads *"login + access token only; **sliding
reissue permitted, no refresh token**. No register, reset, or multi-tenant columns"*, and
`tech-defaults.md` carries a **Sliding reissue** section holding the mechanism's two required halves
and the accepted weakness — so a later module inherits the rule from the table it already reads
rather than from this file. The constitution was **not** touched and `/speckit-constitution` was not
needed: it delegates the stack to `tech-defaults.md` and requires a stated reason only for
*substituting* a component, and sliding reissue substitutes none — the stack is still JWT with a
single seeded user.

**Alternatives considered**: a genuine access/refresh pair (rejected — directly contradicts
`tech-defaults.md`, and rotation logic is meaningful only when access tokens are short-lived, which
they are not here); a fixed 30-day token with no reissue (rejected — a creator using the app daily
would still be logged out on day 30 with no warning, which fails the spirit of FR-002a).

---

## R-003: Drag and tap as two triggers for one operation

**Serves**: FR-014, FR-014a, FR-015, FR-015a, FR-015b, SC-011, constitution principles I and V

**Problem**: FR-015b requires the whole `idea → posted` journey to be completable with no drag gesture,
while FR-014a requires a drag path as well. Naively that is two implementations of every mutation.

**Decision**: one mutation function per field change, with two triggers — and **drag applies to
scheduling only**.

- **Drag — dates only**: `@dnd-kit/core`, with a `PointerSensor`. ~~and a `KeyboardSensor`~~ —
  **amended at T054, see the note below.**
  Draggables are item chips; the only droppables are day cells and the backlog drawer.
- **Tap — everything**: tapping a chip opens a shadcn `Sheet` anchored to the bottom of the viewport,
  carrying controls for title, hook, **platform**, date, status, and published link. This is the single
  editing surface, so it satisfies FR-006a as well as the tap half of FR-014a.
- Both paths call the same `updateItem(id, patch)` in `lib/api.ts`, which issues one `PATCH`. The drag
  handler's only job is translating a drop target into `{ scheduled_date }`.

**Why status is not draggable** (spec amendment, recorded in spec.md's post-review clarification): a
status drag needs somewhere to drop. Status lanes cannot coexist with a seven-column month grid at
375px without the horizontal body scroll FR-021 forbids, and a lane-based board is a *second* core
capability, which constitution principle III does not permit this module. Status has three values, so
a tap control resolves it in one interaction where a drag takes several. FR-015a was narrowed to tap
only rather than inventing a surface for a gesture nobody needs.

**Touch activation constraint** — the detail that makes or breaks the drag path on a phone. A
`PointerSensor` with no activation constraint captures a drag the instant a finger moves on a chip, so
a creator swiping up to scroll the month grid would instead lift the chip and drop it on whatever cell
their finger released over, silently rescheduling it. The sensor is therefore configured with a small
distance-and-delay activation constraint, and chips carry `touch-action: manipulation` so vertical
scrolling wins the gesture until the constraint is met. A long-press activation was considered and
rejected: it collides with FR-020's requirement that destructive actions not sit next to a common
gesture, and with the browser's own long-press context menu.

**Amendment (T054, 2026-08-02) — no `KeyboardSensor` is registered.**

This decision collides with one taken later. **T052 made the item chip a `<button>`**, because tapping
it opens the item sheet — and dnd-kit's keyboard activation codes are `Space` and `Enter`, which are a
button's own activation keys. Registering the sensor means `Enter` on a focused chip starts a drag
instead of opening the sheet, so the **primary** editing path becomes unreachable from a keyboard in
order to make the **secondary** one reachable. That is the wrong trade.

The requirements are unaffected, which is why this is an amendment and not a gap:

- **FR-015b** asks that every date and status change be reachable *without a pointer-drag gesture*.
  The item sheet's date input and status radios satisfy it entirely.
- **SC-011** asks that the whole `idea → posted` journey be completable without a single drag. Same.

Neither asks for a *drag* performed by keyboard. This section already designates the tap path the
primary one and the drag an accelerator; the amendment simply stops the accelerator from eating the
primary path's keys. `ItemChip` strips dnd-kit's `onKeyDown` from the listeners it spreads, so the
button's own behaviour is what runs. `tasks.md` T054 is amended in the same merge request.

**Rationale for `@dnd-kit`**: pointer-event based, so touch works without a separate backend; ships a
a `KeyboardSensor`, which this module in the end does not use (see the amendment); and it does not require pulling a DOM
node out of its container — which matters when the container is a 375px grid that scrolls inside itself
per FR-021.

Making the tap path the *primary* one also means the Playwright E2E flow drives taps. Drag automation
is the flakiest thing in a browser suite, and `workflow.md` requires the E2E flow to gate merges — a
flaky gate gets disabled, and a disabled gate violates principle VI. SC-011's drag half is validated
manually via quickstart V4 rather than automated, and that is stated rather than left looking covered.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| HTML5 native drag-and-drop | Does not fire on touch devices. Non-starter for a phone-first product. |
| `react-beautiful-dnd` / `@hello-pangea/dnd` | Optimised for lists rather than a two-dimensional grid, and it wants to control the scroll container that FR-021 requires us to control. |
| Status lanes as drop targets | No 375px layout holds them beside a month grid without violating FR-021, and they constitute a second core capability under principle III. This is what drove the FR-015a amendment. |
| Swipe a chip to advance status | Undiscoverable, fights grid scrolling, and still needs a separate tap path for keyboard — three paths instead of two. |

---

## R-003a: Where the backlog lives

**Serves**: FR-011, FR-014a, US3 acceptance scenario 1, SC-008, constitution principle I

**Problem**: as originally planned, `/calendar` and `/backlog` were separate routes. A DOM node cannot
be dragged from one route to another, so US3 scenario 1 — "given an undated item in the backlog, when
the creator places it on a calendar day" — had no surface on which to occur. FR-014a's drag half was
unsatisfiable for exactly the items that most need scheduling, and SC-008 (five undated ideas onto days
in under 60 seconds) was unreachable rather than merely untested, since every placement cost a route
change, a sheet open, a date pick, and a route change back.

**Decision**: the backlog is a **bottom drawer on the calendar surface**, not a destination. There is
one content route. The drawer has two states: a collapsed peek strip showing a count and the most
recent chips, and an expanded state covering most of the viewport for browsing many ideas. The
`/backlog` route is deleted.

**Rationale**: one DOM tree makes drag-from-backlog-to-day a native `@dnd-kit` interaction with no
cross-route machinery. The peek strip sits directly above the bottom action bar, which is where
FR-022 wants frequent actions. Weekly planning becomes drawer-open, then five short upward drags —
which is what makes SC-008 achievable. FR-011 is unaffected: the backlog remains a list distinct from
the grid, which is all the requirement asks.

**Cost accepted**: the peek strip costs roughly 64px of vertical space that the month grid would
otherwise use, and the expanded drawer covers the grid, so a drag out of the expanded state requires
collapsing first. Both are ordinary mobile-drawer behaviour.

**Alternatives considered**: a persistent horizontal chip strip with no expanded state (rejected —
browsing dozens of accumulated ideas through a horizontally scrolling strip is exactly the experience
the backlog exists to replace); keeping two routes and dropping drag-from-backlog (rejected — would
require amending US3 scenario 1, and would leave SC-008 unreachable).

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

### Addendum: where `today` comes from

Storing dates correctly is only half the problem. "Overdue" is derived by comparing `scheduled_date`
against `today` (data-model.md), and nothing originally said whose clock `today` is.

**Decision**: `today` is read **only in a client component, from the browser's clock**. It is never
computed during server rendering.

**Why this matters**: on Vercel the server clock is UTC. A creator in UTC+7 opening the app at 06:00
on 2026-08-05 is at 2026-08-04 23:00 UTC. An item dated 2026-08-04 would render *not overdue* in
server HTML and *overdue* after hydration — a visible flip plus a React hydration mismatch warning.
`DATE` storage makes the off-by-one unrepresentable *in the data*; this comparison is where it would
have reappeared anyway.

R-007's decision to make the calendar a client component removes the failure mode structurally rather
than by remembering to be careful: there is no server-rendered content markup in which a wrong `today`
could appear. The two decisions reinforce each other, which is worth noting because it means changing
R-007 later reopens this.

---

## R-007: How the frontend fetches and invalidates data

**Serves**: FR-023, FR-023a, SC-001, SC-005, US3 acceptance scenario 3

**Problem**: this is the largest decision in a Next.js App Router application and the original plan
made it nowhere — no artifact mentioned server versus client components, caching, or revalidation.
Left open, T038 and T053 would each have invented an answer in separate merge requests.

**Decision**: **client components holding item state locally, with optimistic updates.**

- `app/page.tsx` and the authenticated layout are server components. They read the session cookie and
  redirect before any content markup exists — that is what makes SC-006 hold for every address.
- The calendar surface and the backlog drawer are client components. The item list is fetched **once,
  unparameterised**, through the proxy and held in React state; every surface narrows that one list
  client-side. **Not once per visible period** — see the amendment below.
- A `PATCH` applies optimistically to local state, then reconciles against the response. On failure the
  optimistic change is rolled back and the error surfaced — which is the path a 409 `platform_required`
  takes.
- The platform filter is **local state**, not a server round trip. Every loaded item is already in
  memory, so filtering is a client-side narrowing. So is period navigation, for the same reason.

**Rationale**: SC-005 gives filtering a one-second budget and US3 scenario 3 requires a status cue to
update "immediately". Both are trivially satisfied by local state and both are at risk through a
server round trip — the proxy hop to Render is one thing, but Render's free tier spins down, so the
first interaction of the day can take tens of seconds. Putting that in the path of every filter toggle
would fail SC-005 and SC-001 in production while passing on localhost, which is the worst kind of
failure to discover at stage 7.

FR-023a helps here: last-write-wins with no live sync means a view is explicitly permitted to show
what it loaded. There is nothing to reconcile against a second device, so local state is not a
correctness compromise.

**Amendment 2026-08-02 (Phase 4 checkpoint `/speckit-analyze`) — "the visible period" was the wrong
unit, and one read is unparameterised.** This section originally said the item list *for the visible
period* is fetched once, which reads as one request per period and a new one behind every arrow tap.
That is not what is built and must not be: `date_from`/`date_to` bound `scheduled_date`, so a ranged
read returns **no undated rows** — and the backlog drawer narrows the very same state (FR-011). A
per-period read would empty the backlog the moment the month grid landed, and no frontend test could
catch it, because every one of them stubs the proxy and a stub returns its fixture whatever query it
is handed.

So the unit is **the whole list, read once on mount**. Period navigation (T044) issues no request at
all — it re-narrows what is already in memory, which is also what keeps Render's spin-down out of the
path of an arrow tap, exactly as the Rationale above demands for the filter. The spec's Volume
assumption (hundreds of items for one creator) is what makes one whole-list read affordable. The
endpoint keeps its parameters — they are contract, and T036/T037 ship them tested — but the calendar
is not one of their callers. `tests/e2e/period-nav.spec.ts` asserts the request count stays at one
across three navigations; `tests/e2e/month-grid.spec.ts` asserts the URL carries no bounds.

The same amendment was applied to `tasks.md` (T042) at the Phase 3 checkpoint and to
`contracts/openapi.yaml` here — this file was the third artifact still carrying the old unit.

**No query library.** One resource, two surfaces, a few hundred items. `tech-defaults.md` does not list
TanStack Query, and `workflow.md` forbids abstraction before a second caller. Plain `useState` plus a
typed fetch wrapper is enough, and adding a cache layer would be speculative infrastructure.

**Cost accepted**: the first paint of the calendar shows a skeleton rather than server-rendered
content. Acceptable under constitution principle V, and it buys a second benefit — see R-006's
addendum on `today`.

**Alternatives considered**: server components with `searchParams` and `router.refresh()` (rejected —
idiomatic, but puts a Render round trip behind every filter toggle and status change, endangering
SC-005 and SC-001); a hybrid server-rendered first paint handing off to client components (rejected
for v0.1 — best UX of the three, but it requires threading initial data through and is precisely where
hydration mismatches breed, including the `today` problem below).

---

## R-008: The proxy is a credential-attaching relay and needs a boundary

**Serves**: constitution principle II

**Problem**: a catch-all proxy route that forwards anything to FastAPI with the creator's token
attached makes every present *and future* backend route browser-reachable with full credentials, by
construction. That is a standing invitation for a later module's endpoint to become publicly reachable
as a side effect — the exact shape principle II warns about ("MUST NOT become reachable as a side
effect of an existing endpoint").

**Decision**: the proxy carries an explicit allowlist of path patterns and methods, derived from
[contracts/openapi.yaml](./contracts/openapi.yaml). Anything not on the list returns 404 without a
request leaving Vercel. The allowlist is asserted against the contract in a test, so adding an endpoint
to the API does not silently expose it.

**Corollary**: FastAPI's CORS configuration is not the security boundary and should not be treated as
one — R-001 guarantees no browser ever contacts the Render origin directly. CORS stays restricted to
the frontend origin as defence in depth for the case where someone later bypasses the proxy, but the
allowlist is what actually gates access.

---

## Open items carried into later stages

**Status swept at T074 (2026-08-04).** Three of the four are discharged and are kept — struck
through — rather than deleted, because an Open item that simply vanishes leaves no record of how it
resolved. **All four are now discharged** — the last one at T072 (2026-08-05), which measured the
cold start and found SC-001 failing cold and holding warm.

- ~~**No git remote exists.**~~ **DISCHARGED at T025 (2026-07-31).** `origin` is
  `gitlab.com/ahtuan1701/creator-hub`, private; `main`'s allowed-to-push is **no one** and
  `only_allow_merge_if_pipeline_succeeds` is `true`, both read back from the GitLab API rather than
  assumed; `glab` 1.110.0 is installed and authenticated. The merge gate constitution principle VI
  requires has held for every change since — **MRs !1 through !52**. The 25 merges that predate it are
  a knowing exception, pinned at `caca814~4` and recorded in `plan.md`'s Constitution Check and in
  `T076`. **There is no second exception**: when the free-tier CI quota ran out on 2026-08-02, the
  answer was a project-owned runner, not a relaxed gate.

- ~~**Design tokens are not yet chosen.**~~ **DISCHARGED at stage 2 (2026-08-01).** The export lives
  in `design/content-calendar/` — eleven surfaces at 375px in dark and light, plus the greyscale
  acceptance test for SC-004. The prediction in this item held exactly: because R-005 fixed the
  shape-and-fill progression independently of colour, only the token layer and `/login` were
  integrated at stage 2 and the cue components re-skinned without rework. The data-shape audit ran
  **clean**, so no `spec.md` amendment was needed and constitution IV was satisfied.

- ~~**`passlib` is likely a trap on Python 3.13.**~~ **DISCHARGED at T002 — it bit, and not in the
  predicted way.** The failure is not the `bcrypt.__about__` read this item anticipated. With bcrypt
  5.0.0 it happens at *first use*, inside passlib's own backend-capability probe (`detect_wrap_bug`),
  which hashes an over-72-byte password expecting bcrypt to truncate; bcrypt 5.0 raises instead. Every
  `CryptContext` with bcrypt is dead on arrival, and passlib 1.7.4 is unmaintained so it will not be
  fixed. **`pwdlib[bcrypt]` is what ships**, verified on Python 3.13 with bcrypt 5.0.0. `plan.md`'s
  Primary Dependencies was corrected at T074 — it had named `passlib[bcrypt]` for the whole build.
  Inherited constraint: bcrypt still refuses passwords over 72 bytes rather than truncating them.

- ~~**Cold-start latency against SC-001 is still unmeasured.**~~ **DISCHARGED at T072 (2026-08-05) —
  measured, and SC-001 fails cold.** Capture costs 3 interactions and **1.89s warm**, inside the 15s
  budget. The first interaction of the day costs **47.27s** — the `/calendar` document alone was
  **44.18s**, so ~43s of it is the two stacked cold starts; the same walk warm is **3.92s**. **SC-001
  therefore holds warm and fails cold by roughly three times the budget.** The interaction count — the
  half of SC-001 the product controls — is 3 either way, so the failure is the hosting tier and not
  the capture path. The fix named below (a paid tier or a keep-warm ping) is confirmed as the only
  remedy and stays out of scope for v0.1; it is carried into `docs/retro-01.md` and
  `.claude/memory.md` under Deferred rather than left here. **Both numbers are recorded, unsoftened,
  as the last line of this item required.** The method below was followed exactly: idle ≥20 minutes,
  time the first request, then a warm second one.

  The original framing, kept because it is what the measurement was designed against — ~~Render
  free-tier spin-down~~ — **amended at T074, because T071 doubled it.** The
  original item named one cold start: a spun-down Render service taking tens of seconds to wake.
  Since T071 the database is **Neon**, reached over the public internet rather than Render's internal
  network, and **Neon's free tier auto-suspends too** — so the first request of the day now crosses
  **two** cold starts, stacked. The substitution and its cost are stated in
  [plan.md](./plan.md#technical-context) as the constitution's Scope Constraints require; this item is
  the other half of that amendment, recorded here so the measurement is not designed against a
  single-cold-start model.

  **What is being measured against what.** SC-001 is *"capture a new idea with only a title in under
  15 seconds and in no more than 3 interactions"* — a whole-journey budget, **not** a page-load
  budget, and the cold start has to fit inside it. (SC-005's one-second budget is the platform filter,
  and R-007's client-side narrowing already keeps every cold start off that path, along with period
  navigation and status changes.) The honest method is to leave the deployment idle ≥20 minutes so
  both tiers actually suspend, time the first request, then time a second warm one for comparison —
  a single number with nothing beside it says nothing about which half is the cold start.

  If it proves real, the fix is a paid tier or a keep-warm ping: a stage-7 operational decision, not
  a design change. **The number is reported as measured, including if SC-001 fails.**
