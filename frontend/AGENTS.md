<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- Everything above is managed by Next.js tooling and will be rewritten on upgrade. Add nothing
     inside those markers; project content goes below. -->

# Frontend rules and traps

Loaded only when working in `frontend/`. Root-level rules still apply — in particular
`.claude/rules/design.md`, which carries the mobile-first constraints (375px floor, no horizontal body
scroll, thumb reach, status readable without colour). Those are not repeated here.

Next.js **App Router**, TypeScript, Tailwind 4, shadcn/ui, `pnpm`. Playwright for the one E2E flow.
No Jest/RTL at v0.1 — the UI moves faster than component tests would survive.

## Decisions, and why

| Decision | Why |
|---|---|
| `exactOptionalPropertyTypes` on | FR-023's partial-update semantics distinguish "field omitted → leave it" from "explicit null → clear it". Without this flag `{ platform: undefined }` is assignable to an optional field and the two collapse at the type level — the exact distinction T049 and T051 must keep apart. It caught a real bug within minutes (`workers: undefined` in the Playwright config). |
| `new Date` and `Date.parse` banned by eslint outside `lib/dates.ts` | Turns the UTC-midnight trap below into a build failure instead of a comment nobody reads (research.md R-006). Verified firing before it was committed. |
| Playwright's only project is 375×667, written out explicitly | 375px is a hard floor (constitution I), not one entry in a matrix. A named device preset could change the number under a Playwright upgrade; the number *is* the requirement. |
| shadcn theme tokens hand-written into `globals.css` | `shadcn init` half-succeeded (see traps). The block is explicitly **provisional** — the stage-2 design export replaces it wholesale. Safe to replace wholesale because R-005 encodes status as shape and fill, so FR-017/SC-004 do not depend on any colour in that file. |
| Client components + local state + optimistic updates | SC-005 (<1s filter) and "cue updates immediately" both want local state, and a server round trip per toggle risks Render's free-tier spin-down blowing SC-001. `lib/items.ts` establishes this once (research.md R-007) — do not invent a second data-fetching strategy per surface. |
| `lib/items.ts` is **pure functions plus a thin hook**, not one `useContentItems` | Forced by a real constraint: `tech-defaults.md` rules out Jest and RTL at v0.1, so **there is no renderer in this project** and a hook cannot be exercised in isolation. As one lump, the rollback branch — reachable only when the server refuses a write — would need a browser test that fails a request on purpose, and would never be asserted at the level of "which rows in which order". Split out, those are ordinary unit tests in `tests/client/items.spec.ts`; the hook keeps only what a browser test does cover. Add new state transitions as exported pure functions, not as logic inside the hook. |
| A pending item is a **real `ContentItem` with a negative id** | Postgres identity starts at 1 and never goes negative, so it cannot collide — a stronger guarantee than a `_pending` flag, which a spread or a reconciliation can drop while leaving the row looking saved. Surfaces then render one list and key on `item.id`, which is the point of an optimistic update. **`isPending` is load-bearing beyond rendering**: T049's `PATCH` and T050's `DELETE` name an id that does not exist yet, so every surface offering them must skip pending rows. |
| `useContentItems` takes `params` but depends on a **JSON key** of it | The idiomatic call site `useContentItems({ scheduled: "none" })` builds a new object every render, and an effect depending on it refetches forever. Doing this inside means callers never need `useMemo` — a requirement nobody remembers and nothing enforces. |
| The backlog is a **drawer on `/calendar`**, never a route — do not "tidy" it into a page | R-003a, and the reason is structural: **a DOM node cannot be dragged between routes.** With `/backlog` as its own page, US3 scenario 1 has no surface on which to happen and SC-008 is unreachable rather than untested. One DOM tree makes T054's drag a native `@dnd-kit` interaction. The peek strip costs ~64px the month grid would otherwise have — accepted in R-003a, so do not reclaim it at T042. |
| The calendar's `GET /content-items` stays **unparameterised**, and T042 must not add a date range | Amended into `tasks.md` at the Phase 3 checkpoint, and the reason is a regression waiting to happen: `date_from`/`date_to` bound `scheduled_date`, so a ranged read returns **no undated rows** — and the drawer reads the same state. Send a range and the backlog empties the day the month grid lands. The suite would not catch it: every frontend test stubs the proxy, and a stub returns its fixture whatever parameters it is handed. The grid takes the dated items inside its six-week span client-side; the spec's Volume assumption (hundreds of items) is what makes one whole-list read affordable. T037 still ships the parameters — the contract declares them. |
| The month grid is a **fixed 42-day span**, and the day cell caps at two chips | Six rows in every month, so the drawer and the action band do not move as T044 navigates — a moving thumb target on a 375px screen is worse than a row of adjacent-month days. The cap exists for the same budget: a third chip pushes six rows past a 667px viewport. The remainder is a `+N more` button that **expands the cell in place**, because the spec's edge case asks for *reachable*, and a day sheet would be a second surface competing with T052's item sheet for the same tap. |
| Spans, steps and titles live in **`lib/period.ts`**, not in the components that draw them | Three questions a surface must not answer for itself: which days this period covers, what the adjacent one is, and what it is called. `MonthGrid` and `WeekList` would each derive a span — which is how the grid's first column and the week list's first section come to disagree about where a week begins — and `PeriodNav` and the header would each derive a title. There is also a testing reason, and it is the same one that split `lib/items.ts`: **this project has no renderer**, so anything inside a component can only be reached through a browser. The cases worth covering here are calendar boundaries (a month opening on a Sunday, a week straddling New Year, a DST weekend), and `tests/client/period.spec.ts` enumerates a dozen of them under two timezones in the time one browser test takes. |
| The week view is **seven vertical sections**, and it has **no chip cap** | R-004 and FR-021. Seven columns at 375px is ~53px each — the width at which `DayCell` already has to drop the title — and the week is precisely the view a creator opens to *read* what is planned. So it trades the horizontal axis away and spends the full width per row, which is what makes `full` chips possible. The cap is absent for a matching reason: `DayCell` caps at two because 42 cells share one screen's height, whereas seven sections scroll inside `<main>` and have no budget to protect. Hiding an item behind `+N more` here would be a cost with nothing bought. |
| `CalendarShell` is **`h-dvh`, not `min-h-dvh`** | The difference is the whole of FR-022 on this surface, and it looked like a styling detail for two tasks. With a *minimum*, the column's height is still its content's height, so `flex-1` on `<main>` has nothing to shrink against: six grid rows plus the drawer push the action band below the fold and the page scrolls vertically to reach it. A fixed height gives `<main>` something to be `min-h-0` against, so the grid scrolls inside its own container (`.claude/rules/design.md`) and the band stays under the thumb. Caught by screenshot at T044 — `tests/e2e/calendar.spec.ts` asserted the band was in the bottom *half* of the screen, which a band hanging off the bottom edge satisfies. |
| `today` and `period` are **two values**, and collapsing them is the bug T044 exists to avoid | `today` is the creator's own calendar day, read once from the browser's clock; `period` is whatever month or week is on screen. They are equal until the first arrow tap and never again. The week list marks today's section from `today` and T045's overdue treatment derives from it — both would be wrong against a period the creator has navigated away from. `anchor` (null until they navigate) is what lets `period = anchor ?? today` need no effect to synchronise state against a clock the first render does not have. |
| **Navigating a period issues no request**, so `reload()` still has no caller | The Phase 3 checkpoint predicted T044 would be the first task to wire `reload()`. It is not, and the reason is the same amendment: the calendar keeps one unparameterised read because a ranged one returns no undated rows and empties the backlog. Given that, stepping to another month is pure client-side re-narrowing — and a round trip behind every arrow tap is exactly what R-007 rejects, with Render's free-tier spin-down making the first one of the day tens of seconds. `tests/e2e/period-nav.spec.ts` asserts the request count stays at one across three navigations. |
| `itemsLoaded`'s `savedSince` is a **narrow allowance, not a merge-by-id** | Closes the hole the Phase 3 `reviewer` recorded: a row that reconciled *after* a read was issued is no longer pending and is not in that read's response either, so it was dropped until the next load. The fix keeps only ids **this browser saved during this read**, and only while they are missing from the response. A general merge would be wrong in the other direction — absence from a response is exactly how a deletion arrives (T050), so an upsert would leave a deleted item on screen forever. The hook resets the set at the start of every read, because a row saved *before* a read is already in that read's answer. |
| Overdue is a **dashed left border**, and `today` reaches the chip as a **prop** | FR-007 fixes the pipeline at three statuses, and overdue is *orthogonal* to status rather than a fourth value of it — an `idea` and a `draft` can both be overdue and the creator still has to tell them apart. Dashed rather than solid so it reads as a condition on a chip that already has a border, and so it survives greyscale (a dash pattern is a shape). **`border-l-dashed` is not a Tailwind utility** — border style has no per-side variant — so `ItemChip` carries the project's one arbitrary property, `[border-left-style:dashed]`; `overdue.spec.ts` asserts the *computed* style, because dashing all four sides is how the export draws the drag ghost. The prop is what makes "never during server rendering" true by construction: `isOverdue(item, null)` is false, and null is what every server render has. |
| `countOverdue` counts **every loaded item**, not the visible period's | The export's second header count. An overdue item two months back is exactly the one the creator has lost track of, so a count that emptied itself as they navigated away from the problem would invert what the treatment is for. Zero prints nothing rather than `0 overdue` — a standing line that usually reads zero is one that stops being seen. |
| `groupByScheduledDate` and `selectBacklog` are a **partition**, and that is the invariant to protect | US2 scenario 4 says no item appears in both. They are two pure functions over one loaded list, asserted against each other in `tests/client/items.spec.ts` rather than left to agree by coincidence. Anything that narrows what the calendar loads breaks the drawer, which is the whole of the row below. |
| The drawer **narrows loaded state**; it never issues `scheduled=none` | R-007: the list is loaded **once, unparameterised**, and every surface narrows it — not once per period, which is the wording the Phase 4 checkpoint corrected in `research.md` and the contract. A second fetch alongside the calendar's own doubles the round trips and lets the two disagree. The endpoint's parameter exists for a caller that wants only the backlog — this surface is not one. `selectBacklog` is called inside `BacklogDrawer`, so "what the backlog is" has one definition. |
| `CalendarShell`'s outer div is `relative`, and that is load-bearing | The expanded drawer positions against it. Without it the drawer escapes to the viewport and reads as a second screen, which is precisely what R-003a exists to prevent — the period header staying visible above the scrim is what makes it one surface. |
| The expanded drawer carries **its own `+ CAPTURE`** | It covers the action band, so FR-022 would be broken by omission otherwise — and a creator browsing their backlog is exactly the person about to think of the next idea. It is deliberately **not** a modal dialog (no focus trap): capture must stay reachable, and a trap would fight the capture sheet that opens over it. |
| The capture sheet has **one field and keeps it**, and the item sheet at T052 is not its bigger sibling | FR-005 plus the reason in `.claude/memory.md`: "ideas arrive mid-task, and any required field is enough friction to send the creator back to a notes app". Platform, date, hook and link are set at T052, on an item that already exists. `tests/e2e/capture.spec.ts` asserts the *request body* rather than counting inputs, because a field that defaulted to something and sent it would still be this surface making a decision that belongs to T052. |
| Capture costs exactly **three interactions** and a test counts them | Tap, type, tap — SC-001's budget with no room for a confirmation step or a second screen. `autoFocus` on the field is load-bearing rather than a nicety: without it the count is four, and on a phone it is the difference between the keyboard appearing and the creator hunting for the field. |
| A refused save **keeps the sheet open with the typing intact** | The counterpart to the rethrow rule below, and the reason it exists. Losing the optimistic row *and* the creator's text is the worst outcome of a failed save, and it is exactly what closing the sheet optimistically produces. Cancel also keeps the text — clearing it would make a mis-tap on the scrim destructive. |
| A failed **write** rethrows; only a failed **read** sets `state.error` | The capture sheet renders a refused save beside its own field, with the creator's text still on screen. Folding it into the list's error would blank the calendar because one save was refused. |
| Hand-built calendar grid, no library | Every calendar library's value is time-of-day layout, which FR-012a removed. |
| The proxy allowlist forces a **decision per contract operation**, not a copy of the contract | `NOT_PROXIED` exists so the sync test can require every operation to be *either* allowed *or* excluded-with-a-reason. An allowlist that simply mirrors `openapi.yaml` gates nothing the moment the contract grows. `/health` is the one exclusion today — Render's probe, no screen reads it. |
| The proxy **captures the login token out of the response body** | `POST /auth/login` returns `access_token` in its body. Forwarding that to the browser would hand a 30-day credential to JavaScript and undo the whole of R-001, so the proxy moves it into the httpOnly cookie and returns `{expires_at}` alone. The contract still describes the FastAPI origin truthfully — this response comes from the Vercel origin, which is deliberately not transparent about credentials. |
| The proxy **clears the cookie on any 401**, not just on logout | JavaScript cannot delete an httpOnly cookie, so this route is the only thing that can. Without it T024's "clear the session cookie and redirect" would need a second endpoint invented to do it. |
| Cookie `Max-Age` is derived from the token's own `exp`, not from a constant | The alternative is a frontend copy of the backend's `TOKEN_TTL_DAYS` kept equal across two separate deployments with nothing to notice drift. The signature is **not** verified and does not need to be: the value times a cookie, and the backend stays the only authority on validity. |
| `ContentItemUpdate` spells its nullable fields `?: T \| null`, **never `\| undefined`** | This type is the reason `exactOptionalPropertyTypes` is on, and the reason is on the wire rather than in the type system: the backend reads `model_dump(exclude_unset=True)`, so an **omitted** key means "leave it" and an **explicit null** means "clear it" — and `JSON.stringify` drops `undefined` values, which makes those two intentions two different HTTP requests. Without the flag `{ scheduled_date: undefined }` is assignable to `scheduled_date?: string \| null` and "send this back to the backlog" silently compiles into "leave the date alone". `title` and `status` have no null spelling, matching the contract and the `NOT NULL` columns behind them. |
| `itemWithChanges` merges **field by field**, and `??` is the bug it exists to prevent | `changes.hook ?? item.hook` treats `null` as "no opinion", so every *clear* becomes a no-op — a drag back to the backlog that appears to do nothing, an item that will not let go of its platform. Six explicit `=== undefined` spreads are longer and are the only form that keeps FR-023's two meanings apart on the optimistic side. `id`, `created_at` and `updated_at` are never touched: `updated_at` is the server's, and guessing it puts a timestamp on screen that no row ever had. |
| `itemChanged` is **its own inverse**, and there is deliberately no separate rollback function | Apply the optimistic row, accept the server's row, restore the original — one transition, three callers. A `itemRolledBack` written alongside it would be free to drift from the function that applied the change, and rollback is the branch a browser test reaches least (there is no renderer here, so it is only ever asserted as a pure function). It also leaves an absent row **absent**: a read landing mid-edit may have dropped it, which is how a deletion on another device arrives, and re-inserting would undo that. |
| `updateItem` takes the **row**, not the id | Three things fall out of it that would otherwise need machinery: `isPending(item)` reads as itself instead of an inline `id < 0`; the merge has something to merge onto; and **the argument is the rollback value**, so a refusal restores the row the creator was looking at with no snapshot captured inside a `setState` updater and no index remembered. Under FR-023a's last-write-wins that is also the right answer when something moved underneath. |
| `getContentItem` ships with **no happy-path caller**, and that is not abstraction-ahead-of-need | R-007 holds every item in client state from one list read, so T052's sheet opens on a row it already has — refetching would be a round trip to learn what is already on screen, against a backend whose free tier spins down. It exists because T051 names it, because the contract declares it, and because it is the honest recovery for a surface holding a stale row. Do not add a fetch to the sheet to give it a caller. |
| `reload()` **still has no caller** after T051 | Predicted for T044 (wrong — navigation issues no request) and plausible for T051 (wrong again — an optimistic edit reconciles against the `PATCH` response, so there is nothing left to re-read). Worth knowing before adding one: the first real caller inherits `itemsLoaded`'s overlap semantics, and the trap below says which fix is forbidden. |
| The item sheet **saves on an explicit tap, not on every control tap**, and sends a **diff** | Two reasons, and the second is correctness rather than taste. A `PATCH` carrying every field is a full replacement wearing a partial update's clothes — it rewrites whatever this screen last read over anything changed elsewhere. And per-tap saves make **SC-012 unreachable**: a title-only idea given a platform *and* advanced needs those in **one** request, because the first tap alone would be a guaranteed 409. `check_invariant_1` validates the item as it would be *after* the change precisely so that single request exists. `changesBetween` is the diff, `itemWithChanges` its inverse, and the two are asserted against each other. |
| The sheet's draft is a whole **`ContentItem`**, not a parallel form shape | It is what the sheet renders, what `changesBetween` diffs, and what `itemWithChanges` would produce from that diff — three things that cannot drift apart. A `{title: string, hook: string}` form shape would need `"" ↔ null` conversions at every boundary, and the `null` **is** FR-023's "clear this field": the difference between an omitted key and an explicit null is the whole of the partial-update semantics. Empty text inputs convert to `null` at the `onChange`, once, at the edge. |
| The draft resets on the **id**, and is cleared when the sheet **closes** | Both halves are defects if dropped, and the second was caught by a test rather than by reading. Resetting on object identity discards the creator's typing at the moment their own optimistic save lands (the store replaces the object). Not clearing on close means closing and reopening the *same* item resurrects an abandoned draft, which reads as an edit that was saved. React's "adjust state when a prop changes" pattern, not an effect. |
| `CalendarShell` holds the **id** of the item being edited, never the row | The store replaces an item's object on every optimistic edit and reconciliation, so a captured row is stale the instant the save it is showing lands. Looking it up each render also makes the sheet close itself when the row disappears — a deletion at T056, or a list read that stops returning it — with no extra code. |
| Platform is a **toggle group** (`aria-pressed`), status is a **radio group** (`aria-checked`) | They are genuinely different controls and the ARIA follows the data: FR-007 makes `status` `NOT NULL` with a default, so one of three is always chosen; FR-010a allows **at most** one platform, so `null` must stay reachable — and a radio group has no way back to "none" once one is picked. Clearing the platform is also the **only** path to the `platform_locked` refusal (FR-009a) that T053 renders. |
| The date is a native **`<input type="date">`** with an explicit **CLEAR** beside it | The native control speaks `YYYY-MM-DD` exactly — the format the column, the contract and `lib/dates.ts` all use — so no `Date` is constructed and R-006's UTC-midnight trap has nowhere to occur; it is also keyboard-reachable and gives a phone its own picker (FR-015b). The clear button is **added beyond the export** on purpose: a native date input's own clear affordance is platform-dependent and absent on several mobile browsers, and without it the tap path could schedule but never *un*schedule, leaving T054's drag as the only way back to the backlog — the pointer-only dependency SC-011 forbids. |
| Status and platform options are **`h-11` (44px)**, not the export's 40px | The second place the design is knowingly not followed to the pixel (the first is `text-base` on inputs). `.claude/rules/design.md` makes 44px a hard floor, and these six sit in the densest part of the sheet — exactly where a missed tap is most likely. `item-sheet.spec.ts` asserts the floor so a restyle cannot quietly drop it. |
| `ItemChip.onOpen` and every `onOpenItem` in the chain are **required, not optional** | Not defensive typing — the fix for a bug that shipped green. Passing an optional handler through a JSX **spread** (`{...(x === undefined ? {} : {onOpen: x})}`, needed under `exactOptionalPropertyTypes`) skips excess-property checking, so `onOpen` landing where `onOpenItem` was expected compiled cleanly and silently made three of the four surfaces un-openable. Required props turn the same mistake into a build error. A chip the creator cannot open is a bug now that the sheet exists, so optionality bought nothing. |
| A 409 **marks the control that resolves it and moves focus there**, matched on `code` not on prose | One invariant, two codes, and the codes exist because the *next step* differs: `platform_required` is fixed in the platform column, `platform_locked` in the status column ("move it back to ideas first"). SC-012 asks that neither refusal require leaving the surface — and on a sheet whose body scrolls, **adjacency is not reachability**: the columns are off screen when the creator is on the date field. Moving focus scrolls the fix back and puts the keyboard on it (FR-015b). The message stays the contract's `detail` verbatim, so a reworded backend message changes the sentence and not the behaviour. Any edit clears the refusal, because it described a save attempt that no longer matches the draft. |
| Collision detection is **`pointerWithin`**, not dnd-kit's default | A correctness fix, not a preference, and it shipped a wrong date before it was found. The default intersects the **dragged overlay's rectangle** with the droppables — and the overlay is a `full` chip, far wider than a 53px day cell, so it overlaps three or four days at once and the first intersection wins. A test aiming at the 12th scheduled the 13th. `pointerWithin` makes the answer "the cell under the finger", the only rule a creator can predict, and it returns nothing outside every droppable so a drop into empty space is correctly no change rather than a nearest-neighbour guess. |
| **No `KeyboardSensor`** — an amendment to research.md R-003, applied to all three artifacts | Its activation codes are `Space` and `Enter`, and **T052 made the chip a `<button>`** whose own keys those are. Registering it means `Enter` on a focused chip starts a drag instead of opening the sheet: the *primary* editing path becomes keyboard-unreachable to make the *secondary* one reachable. FR-015b asks for date changes without a **pointer-drag**, and SC-011 for a journey completable without a drag — the sheet's date input satisfies both; neither asks for a drag performed by keyboard. `ItemChip` strips dnd-kit's `onKeyDown` from the listeners it spreads. `research.md` R-003 and `tasks.md` T054 were amended in the same MR. |
| dnd-kit's `attributes` are spread **only on a row that can be dragged** | `useDraggable({disabled: true})` still emits `role="button"`, `tabindex="0"` and `aria-disabled` — so a pending row would become a tab stop announcing itself as a disabled button, the exact thing the `<article>` fallback exists to avoid. A pending row is not disabled; it is **not yet a control**. |
| The drop target's id **is** the date, and the backlog's is one exported constant | `onDragEnd` translates a drop into `{scheduled_date}` with no lookup table that could fall out of step with the grid, and decides between scheduling and unscheduling by comparing against `BACKLOG_DROP_ID` rather than pattern-matching a date. A drop back on the item's own day returns early: a no-op is not an empty `PATCH`, which the backend refuses with a 422. |
| The drag ghost is `DragOverlay` at size `full`, and the source row **stays in place** and dims | A 50px micro chip under a finger is smaller than the finger, so the overlay is always full size whatever was picked up. The source row is dimmed rather than removed because removing it reflows the grid mid-drag and moves the drop target out from under the creator. |
| `lib/api.ts` types are **hand-written from the contract**, with a test guarding the enums | No OpenAPI codegen is installed and none should be: eight operations and four schemas is smaller than the toolchain that would generate them, and R-007 asks for "a typed fetch wrapper". The cost is drift, so `tests/contract/api-types.spec.ts` compares `STATUSES`, `PLATFORMS`, and `INVARIANT_CODES` against `openapi.yaml` on disk. Object shapes are left to `tsc --noEmit` — a TypeScript interface has no runtime form to compare against. |
| The client **normalises** the contract's optional-but-nullable fields to `null` | `ContentItem`'s `required` list is `[id, title, status, created_at, updated_at]`, so a response may omit `hook`, `platform`, `scheduled_date`, and `published_url` rather than send null. Typing them `hook?: string | null` would be faithful and would put a `?? null` on every read site in the calendar and the drawer. `toContentItem` makes the declared type true instead. It is **not** a validator — the backend is trusted; it only stops `undefined` reaching a component typed for `null`. |
| `logout()` swallows a 401, and it is the only swallowed error in the client | The proxy clears the cookie on any 401, so by the time the client sees one the session is genuinely over — which is the state logout was trying to reach. Throwing would leave the UI believing it is signed in while the credential is gone. Every other status still throws. |
| The 401 redirect **exempts `/auth/login` and `/auth/logout`** | A 401 from login is a wrong password, not an expired session — redirecting would reload `/login` and discard the message the form exists to show. A 401 from logout means the session was already over, and its caller owns where to go next. Every other operation redirects. A third guard skips it when already on `/login`. Drop any of the three and the login page either reloads itself on a bad password or loops. |
| The redirect is `window.location.replace`, **not** a Next router push | The T027 session guard is a server component, and App Router layouts are not re-executed on soft navigations — a client-side push could land on `/login` with the server never re-reading the cookie. `lib/api.ts` is not a React module either, so there is no router to reach for. `replace` over `assign` keeps the page that just 401'd out of history, since going back would 401 again. |
| Post-login navigation is `window.location.replace`, not `router.push` | Same reason as the 401 redirect, plus one of its own: Next's Router Cache can replay a previously fetched RSC payload for `/calendar`, and on the common "deep link → bounced to /login → sign in" path that payload **is** the redirect back to login. A soft navigation would bounce a correct sign-in straight back to the form with no error to show. `replace` keeps `/login` out of history. |
| `hasSessionCookie` lives in `lib/session.ts`, and both server-side callers use it | The root route (T026) and the `(app)` guard (T027) ask the same question, and T033's re-assert is the third caller — so it is not abstraction ahead of one. It also gives the guard's *decision* continuous test coverage while the guard's *wiring* cannot be exercised (see below). It checks the **value**: `cookies().has()` is true for an empty cookie, and an empty session cookie is not a session. |
| The cookie is a **routing hint**, never an authorisation decision | The signing secret lives on Render and deliberately never reaches Vercel (R-001), so nothing on this side can tell a live token from a dead one — and it does not need to. Unauthenticated is stopped before any markup exists (SC-006 is about the HTML, not the screen); expired is caught by the backend rejecting the bearer, surfacing as the 401 `lib/api.ts` handles. Guessing wrong costs one redirect and renders no content. Do not "harden" this by verifying a JWT here — that would mean shipping the signing secret to Vercel. |
| The `(app)` guard is checked **twice** — in the group layout and again in `calendar/page.tsx` | App Router layouts are not re-executed on soft navigations, so once the app is open a client-side route change reuses a credential check from when the tab was opened. Page segments *are* re-fetched, which is why the second check is a page and not another layout. Both call `hasSessionCookie`, so there is one definition of "is there a session". **A full page load exercises both at once**, so no e2e test can tell them apart — deleting the page-level check leaves `session-guard.spec.ts` green. This row is the guard. (T027's e2e tests were written-and-skipped through Phase 2 and switched on at T033.) |
| Read the browser clock with `useSyncExternalStore`, not `useEffect` + `useState` | R-006's addendum describes the effect form and it is correct, but it sets state from an effect — which React 19's compiler lint flags — and renders once with the wrong value before correcting itself. `getServerSnapshot` returning `null` gives the same guarantee with neither problem. Pass **module-scope** functions: an inline `() => today()` is a new identity every render, which is the subscription version of the unstable-params bug. Safe to call repeatedly because `today()` returns a string and React compares snapshots with `Object.is`. |
| **`app/globals.css` is the only file allowed to contain a colour**, and its values come from the stage-2 export | The design export in `design/content-calendar/` establishes the tokens for **all four** modules (`.claude/rules/design.md`), so a hex written into a component is a project-wide decision taken in the wrong place. Every surface from T033 on says `bg-surface-1`, `text-ink-mid`, `text-status-draft` — those names exist in `@theme inline` precisely so no one re-derives a hex per component. |
| The app is dark by **`class="dark"` on `<html>`**, not by `prefers-color-scheme` | The export's primary direction is the dark one and v0.1 ships no theme switch, so a media query would make the design a coin flip on the creator's OS setting. The light counterpart is still in `:root`, so turning this into a real preference later is one line, not a re-skin. |
| Form fields keep **`text-base` (16px)** even though the export's body size is 15px | iOS zooms the page in when focusing any input under 16px, which on a 375px-floor product throws away the layout on first tap. This is the one place the design is knowingly not followed to the pixel; it is a platform constraint, not a preference. |
| The corner and texture treatments are **plain CSS classes** (`.notch-card`, `.notch-sheet`, `.web-grain`), not React components | They are token-level decisions — the visual language's corner and grain — rather than anything with behaviour, and a CSS class is the smallest thing that can carry a `clip-path`. Each already had two callers on the login surface alone, so this is not abstraction ahead of need. |
| Contract tests run as a **second Playwright project**, not a second test runner | `tech-defaults.md` names Playwright as the frontend test tool, and `.gitlab-ci.yml`'s `test:e2e` job runs `playwright test` with no `--project` filter — a separate config file would be a merge gate nobody invokes. The project touches no `page` fixture, so no browser starts. |

## Traps

**A bottom sheet measured the instant it becomes *visible* is still 40px below where it lands.**
`SheetContent` enters on a 200ms `translate-y-[2.5rem]` transition, so `toBeVisible()` resolves while
the sheet is still moving and a `boundingBox()` taken straight after reads a position that never
existed at rest. The symptom is an off-by-40 assertion that fails every run and looks like a layout
bug. Use `toBeInViewport()` — it retries — or assert something that is not a coordinate.

**A misspelled Tailwind class fails silently, and the design tokens made that worse.** Tailwind
generates nothing for a name it does not recognise — no build error, no lint error, no test failure.
`bg-surface-1` and `bg-surface1` are equally "valid" to every check in CI, and the second one renders
a transparent panel. `pnpm build`, `pnpm typecheck`, `pnpm lint`, and the whole Playwright suite all
passed on the login redesign *before* it had ever been looked at. **Screenshot the surface at 375px
after restyling it** — the suite asserts geometry (tap targets, thumb reach, overflow), which is
exactly what survives a dropped colour class.

**A pending row is only ever on screen while the drawer is *already* expanded.** The capture sheet
stays open until the save resolves — T034's decision, so a refused save keeps the creator's typing —
so with a create in flight the sheet's scrim covers the drawer toggle and there is no way to open the
drawer. A test that captures and *then* clicks the toggle times out; expand first, then capture. This
also bounds where `isPending` matters: it is a real guard for **T052's tap-to-open and T054's drag**,
both of which name an id the server has not issued, and it is exposed as `aria-busy` on the row for
them to read.

**The screenshot step and the test suite fight over port 3100.** `playwright.config.ts` uses 3100
with `reuseExistingServer: !CI`, so a `next start -p 3100` left running from a manual screenshot is
silently adopted by the next `playwright test` — and if `.next` was rebuilt or deleted in between,
that server serves a stale or empty bundle. The symptom is spectacular and misleading: **22 tests
fail, including ones in files you never touched**, with a 21px-tall login input, because no CSS is
being served at all. `pnpm build` passes throughout. Screenshot on a **different port** and kill the
server afterwards. Since the Tailwind trap above makes screenshotting mandatory after any restyle,
these two steps meet constantly.

**A different port is no longer enough on its own: Next 16 refuses a *second* `next dev` in the same
directory, whatever the port.** `Another next dev server is already running` on stderr, exit code 1,
and Playwright reports it as `Process from config.webServer was not able to start` — which reads like
a Playwright or a build problem rather than a stray screenshot server. **Kill it before running the
suite**; the message names the PID, so `taskkill //PID <n> //F` from the Bash tool. The port advice
above still stands for the opposite failure (silent reuse of a stale bundle) — the two together mean:
screenshot on 3400, then kill it, then test.

**A script run from the scratchpad cannot import `@playwright/test`.** Node resolves from the
script's own directory, so a screenshot script outside the checkout fails with `ERR_MODULE_NOT_FOUND`
before it starts a browser. Copy it into `frontend/` to run it, and delete it before committing.

**Next's dev overlay covers the `MONTH` toggle at 375px and eats the click, so a hand-walk must use a
production build.** The floating "N" button sits bottom-left, which is exactly where `PeriodNav`'s
month/week toggle lands on a 375-wide screen — the control is untappable under `next dev` and *only*
under `next dev`. Found at the Phase 4 checkpoint, where it looked like a broken toggle for several
minutes. Nothing in the suite could ever show it: CI runs the production bundle, which is also the
argument for walking the quickstart that way. **`pnpm build && pnpm start`.**

**A local production build needs two environment variables, and the second one fails in a way that
looks like a login bug.** `API_BASE_URL=http://127.0.0.1:8000` and **`SESSION_COOKIE_SECURE=false`**.
Without the second, the proxy sets a `Secure` cookie, the browser refuses to store it over plain
http, and the sign-in *succeeds* and then bounces straight back to `/login` — which reads as a broken
session guard rather than as a cookie that was never saved. `lib/session.ts` defaults `API_BASE_URL`
outside production, which is why `pnpm dev` needs neither and `pnpm start` needs both.

**A browser test that fixes a clock must also fix a timezone, or it encodes the author's location.**
`page.clock.setFixedTime` pins the *instant*; the zone that turns it into a calendar day still comes
from the machine running the browser. T033's first period test asserted `"May 2026"` from
`2026-04-30T18:00:00Z` — true in UTC+7, where it was written, and false on GitLab's UTC runner, which
read April. **Green locally, red in CI, for the fourth time in this project.** Pin it with
`test.use({ timezoneId })`, and prefer asserting the *same instant in two zones* one either side of
Greenwich: two different answers from one timestamp is the only thing that proves the browser's clock
produced them rather than the server's. `tests/client/dates.spec.ts` does the same for Node via
`process.env.TZ` — the browser needs its own mechanism, and inheriting is not one.

**A stub that mimics a response body but not its `Set-Cookie` passes until the destination is
guarded.** `login.spec.ts` stubbed `POST /api/auth/login` with a body alone from T025, and the two
tests that follow a successful sign-in were green — because `/calendar` did not exist, and **a 404
leaves the browser at the address it asked for**. T033 created that route behind the session guard,
which would have bounced a correct sign-in back to `/login` and failed on a shortcoming of the stub
rather than of the page. A stub of the proxy has to do everything the proxy does that the test's
assertions depend on; when a route becomes guarded, re-check every stub that navigates to it.

**`itemsLoaded` is a replacement plus two narrow allowances, and "just merge on id" is the wrong fix
— it was the *recorded* fix for one release and it is now forbidden.** The Phase 3 `reviewer` found
that a read overlapping an *already-reconciled* create dropped that row, and wrote down "handle it by
merging on id". The Phase 4 checkpoint closed the hole a different way — `savedSince`, ids **this
browser saved during this read**, and only while absent from the response — because by then T050's
`DELETE` had made the other direction real: **absence from a response is how a deletion arrives**, so
an upsert would leave a deleted item on screen forever, on every device except the one that deleted
it. The stale instruction survived here for a release; it is removed rather than annotated so nobody
reads it again. Widen `savedSince` if a new case appears; do not turn the replacement into a merge.

**A list read that lands mid-save deletes the row being saved, unless something stops it.** The
creator taps save and then the already-in-flight list response arrives; replacing `items` wholesale
makes the new row vanish and reappear seconds later, which reads as data loss rather than as latency.
`itemsLoaded` re-prepends pending rows for exactly this reason, and it is a **replacement** for saved
rows rather than a merge-by-id — a merge would leave a deleted item on screen forever. Both halves are
asserted in `tests/client/items.spec.ts`; neither is obvious from reading the function.

**`new Date("2026-08-04")` is parsed as UTC midnight.** Formatting that back in a timezone west of
Greenwich gives the previous day. Never construct a `Date` from a bare `YYYY-MM-DD` string;
`lib/dates.ts` exists to make that unnecessary, and eslint enforces it. Spec FR-012a means dates are
`DATE` end to end, so this only bites at the display boundary.

**`today` must never be read during server rendering.** Vercel's clock is UTC, so a creator in UTC+7
sees "overdue" flip between server HTML and hydration, plus a React mismatch warning. Client components
only — `dates.today()` is for client use.

**dnd-kit `PointerSensor` with no activation constraint eats scroll gestures.** On a vertically
scrolling grid, a swipe starting on a draggable lifts it instead of scrolling, then drops it wherever
the finger lands — silently rescheduling an item. Always set a distance or delay constraint on touch,
plus `touch-action` on chips. Long-press is **not** the fix: it collides with the browser context menu
and with the constitution's rule about destructive actions near common gestures.

**A cookie with no `Max-Age` is a session cookie.** Mobile Safari discards it on tab eviction, so a
30-day token still produces a weekly login prompt — and it looks like a token bug rather than a cookie
bug. The proxy at `app/api/[...path]/route.ts` is what sets `Max-Age`, and it must also rewrite the
cookie whenever the backend returns an `X-Access-Token` header. **Both halves are required**: without
either one, sessions die on day 30.

**Adding an endpoint means editing two files, and the second one is not obvious.** A new operation in
`specs/001-content-calendar/contracts/openapi.yaml` turns `tests/contract/proxy-allowlist.spec.ts` red
until it is added to `PROXY_ALLOWLIST` **or** to `NOT_PROXIED` in `lib/proxy-allowlist.ts`. That is the
test working, not a broken test — do not "fix" it by loosening the assertion. A path parameter also
needs an anchored entry in `PARAM_PATTERNS`; without one the module throws at import rather than
matching anything, because an unconstrained parameter is an unconstrained proxy.

**The proxy rebuilds the upstream response instead of forwarding it, and that is load-bearing.** Only
the status and `content-type` are copied. That is what makes "strip `X-Access-Token`" true by
construction rather than by remembering to delete it, and it is why `content-encoding` and
`content-length` cannot survive to describe a body `fetch` has already decoded. If you ever need
another response header through, add it to the copy list — do not switch to forwarding
`upstream.headers`.

**A `Response` body is a one-shot stream.** `relay()` returns the login token alongside the response
for this reason: reading the body twice needs a clone taken *before* the first read, which works
until someone reorders two lines. Do not reintroduce a second `.json()` on the same response.

**`RouteContext<'/api/[...path]'>` is generated, and CI type-checks without a build.** The
`review:typecheck` job runs `pnpm typecheck` straight after `pnpm install`, so that global helper may
not exist yet. Route handler context is written out longhand as
`{ params: Promise<{ path?: string[] }> }`.

**There must stay exactly one `fetch` in `lib/api.ts`.** Every operation goes through the private
`request()` helper, and T024's 401 redirect lives in the single `if (!response.ok)` branch inside it.
A surface that calls `fetch("/api/...")` directly gets no `ApiError`, no 401 handling, and no
`credentials`/`cache` settings — and nothing will fail loudly to say so. Add an operation by adding an
exported function next to `login`/`logout`/`listContentItems`/`createContentItem`, never by fetching
somewhere else.

**A relative URL is load-bearing in `lib/api.ts`, and it makes the client unrunnable outside a
browser.** `fetch("/api/content-items")` has no origin to resolve against in Node, so importing this
module from a server component and calling it would throw "Failed to parse URL". That is the correct
shape — R-007 puts every content read in a client component — but it means the tests must stub
`globalThis.fetch` rather than let a real one run, which is what `tests/client/` does.

**`expect(...).toEqual<T>(...)` does not compile.** Playwright's `toEqual` takes no type argument
(unlike Vitest's). To keep a type assertion in a test, annotate the expected value —
`const expected: ContentItem = {...}` — which fails the build if the type stops requiring a field.

**`pnpm install` fails in CI and passes locally, and the setting lives in a file pnpm wrote itself.**
pnpm will not run a dependency's install scripts unless allowed, and non-interactively that refusal
is `ERR_PNPM_IGNORED_BUILDS` with exit code 1, not a warning. It turned the **first `build:frontend`
that ever ran** red, twice.

The control is `allowBuilds` in **`frontend/pnpm-workspace.yaml`** — *not* a `pnpm` key in
`package.json`, which pnpm 11 ignores. That was the second failed attempt at this fix; do not repeat
it. pnpm creates the file itself on first meeting an unapproved package and what it writes is a
**placeholder plus a refusal**:

```yaml
allowBuilds:
  sharp: set this to true or false    # literal placeholder text, not a value
ignoredBuiltDependencies: [sharp, unrs-resolver]
```

Left as generated, that is a red pipeline. Correct form is `sharp: true` with no
`ignoredBuiltDependencies`. **A new dependency with a postinstall script needs adding, and the
symptom is CI-only** — a local `pnpm install` passes on an interactive approval cached in pnpm's
state outside the checkout, so never take a clean local install as proof.

**Every shadcn size variant is desktop-scaled, so every tap target needs an explicit height.** The
default `Input` is `h-8` (32px) and even `size="lg"` on `Button` is `h-9` (36px) — all below the 44px
minimum a thumb needs, on a product whose design width is a hard 375px floor (constitution I). Login
uses `h-11` on fields and `h-12` on the submit button, and `tests/e2e/login.spec.ts` asserts the 44px
floor so a refactor cannot quietly drop it. Also keep the primitive's `text-base`: iOS zooms the page
in when focusing any input under 16px.

**A folder whose name starts with `_` is a *private folder* and is excluded from routing.** This cost
real time at T027: a throwaway `app/(app)/__probe/page.tsx` simply 404'd, the layout under test never
ran, and the failure looked like a broken guard. Worse, the "reaches the page" test **passed anyway**
— a 404 leaves the browser at the address it asked for, so a path-only assertion cannot tell "rendered"
from "not found". **Assert the response status too**, not just `page.url()`.

**A server-component `redirect()` answers with an HTML body, in dev *and* in production.** Next
16.2.12 returns a 307 carrying a ~6–7 KB `__next_error__` document: the route's static metadata
(`<title>`, description) plus script preloads. The page component never runs, so no content data is in
it — but `expect(body).not.toContain("<html")` on a 3xx fails everywhere, which is why
`tests/e2e/root-redirect.spec.ts` asserts status and `Location` instead. **This entry previously said
`next start` answers with an empty body and that the assertion was green in CI only** — measured false
at the Phase 3 checkpoint against the real production bundle. Assert on *content data* (no item title
in the body), never on the absence of markup: the second is stricter than FR-002/SC-006 and describes
the framework, not this app.

**`pnpm typecheck` reads generated route types out of `.next/`, so it fails after a branch switch.**
`.next/types/validator.ts` still references pages the new branch does not have, and the error looks
like a missing module in your own code. `rm -rf .next` and re-run. CI never sees this — it checks out
clean — so a red typecheck straight after `git checkout` is almost always this.

**`lib/session.ts` is server-only by convention, not by guard.** It reads non-`NEXT_PUBLIC_` variables,
so a client component importing it would silently get fallbacks. The `server-only` package would catch
that at build time, but its default export throws the moment it is imported outside a React Server
Component — including from the Playwright runner — which would make `maxAgeFromToken` untestable.
Never import it from a `"use client"` module.

**`playwright.config.ts` has a global `webServer`, so `--project=contract` still boots Next.** Costs a
few seconds on a run that never issues a request. Known and accepted (see Decisions) — do not try to
make it conditional.

**`shadcn init` can half-succeed.** On this machine (shadcn 4.16.0, Next 16, Tailwind 4) it wrote
`components.json` and stopped: no `lib/utils.ts`, no theme tokens in `globals.css`. `shadcn add` then
succeeds and produces a component importing a nonexistent `cn` and referencing undefined CSS variables,
so the failure surfaces later as an unstyled component rather than as an init error. Both files are now
checked in by hand — check for them after any future `init`.

## Commands

```bash
pnpm install
pnpm dev
pnpm build && pnpm typecheck && pnpm lint
pnpm exec playwright test                   # all four projects
pnpm exec playwright test --project=client  # lib/api.ts against a stubbed fetch
pnpm exec playwright test --project=contract  # lib/* vs specs/.../openapi.yaml
pnpm exec playwright test --project=proxy   # the route handler, stubbed upstream
pnpm exec playwright test --project=mobile-375  # the browser flow, 375x667
pnpm exec playwright test -g "create content item"
```
