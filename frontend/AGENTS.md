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
| The platform filter row sits **above the backlog drawer**, not under the period header where the export draws it | The export's `1i` puts it around y=100; at the 375×667 floor the bottom half starts at y=333, and `tasks.md` T061 requires the filter "within thumb reach (FR-022)". `.claude/rules/design.md` calls mobile-first "a hard constraint, not a preference" and the export "the starting point, not a drop-in", so the spec wins. **Third knowing departure from the export** — after the sheet's 44px options and `text-base` on inputs — and, like both, a tap-reachability constraint rather than taste. The export's 26px options are raised to 44px for the same reason. `platform-filter.spec.ts` asserts both the position and the floor, so a restyle cannot quietly return it to the export. |
| The filter is a **radio group** (`aria-checked`), where the item sheet's platform control is a **toggle group** (`aria-pressed`) | Same three platforms, opposite ARIA, and the data decides it. On the sheet an item targets **at most one** platform (FR-010a), so `null` means "none" and must stay reachable — none-may-be-pressed. Here `null` means **all**, which is not the absence of a choice but one of four mutually exclusive ones, exactly one of which is always in effect. So `ALL` is a real option announced as "All, selected, 1 of 4" rather than a state the creator infers from three unpressed buttons. |
| **Both header counts narrow with the filter**, unlike period navigation | `countOverdue` spans every loaded item as the creator navigates, because moving to another month does not change which items exist to them — an overdue item two months back is the one they have lost track of. A filter is the opposite: the creator asking to see fewer. A header reading `12 items` above a grid drawing three is wrong, so `visible` feeds both counts. The two rules sit beside each other in `CalendarShell` so the difference does not read as an inconsistency. |
| The filtered empty state fires on **"the filter hid everything"**, never on "this period is empty" | The spec's edge case is *"All items filtered out"* — the state a creator cannot leave unaided, where every cell and the backlog are empty and nothing says why. An empty *month* is ordinary: the items exist and the period arrows answer it, so drawing the filter's empty state over an empty March while TikTok items sit in April blames the filter for the creator's own navigation. A **third** case is separated again: an account with no items at all keeps the first-run copy, because a filter is not why *that* calendar is empty. All three are asserted in `platform-filter.spec.ts`. |
| `FirstRun` **accompanies** the grid; `FilteredEmpty` **replaces** it | T068, and the export draws the difference — `1i` puts a dashed region where the grid would be, `1k` keeps the six-week grid and centres the message over it. It follows from what each state asks of the creator: the filtered one asks them to clear a filter, so the region *is* the explanation and a grid above it would be a blank screen; this one asks them to capture an idea and then **drag it onto a day**, and a sentence about days with no days on screen explains nothing. A second reason agrees: `month-grid.spec.ts` asserts the 42-cell span and `week-list.spec.ts` the seven sections **against an empty list**, because that is the cleanest fixture for a question about structure — removing the grid would put a decoy item into every one of those tests. |
| There are **three** empty states, and `status === "ready"` is half of the first condition | Nothing captured (`status === "ready" && items.length === 0`) → `FirstRun` plus the grid; the filter hid everything (filter on, `visible` empty, `items` non-empty) → `FilteredEmpty` instead of the grid; this period is empty → **nothing**, because the items exist and the period arrows already answer it. The `status` half is not a nicety: `items` is empty while the first read is in flight too, so `items.length === 0` alone tells every creator they have captured nothing for as long as their calendar takes to load — tens of seconds on Render's free tier. Verified by removing it, which turns exactly one test red. The drawer's half of this state was built at **T035** from the same export panel and is pinned by `first-run.spec.ts` as well as by its own file. |
| `BacklogDrawer` takes the **unfiltered** list plus the filter, and narrows by both itself | The one consumer that does not take `visible`, and T062 forced it. The drawer has two opposite empty states — "nothing captured yet" and "the filter is hiding your backlog" — and the filtered list alone cannot tell them apart, so it told a creator with a full backlog to go and capture something. A browser test caught it, not review. The two narrowings compose in either order (asserted in `tests/client/items.spec.ts`), which is what makes it safe for this component to pick one order and the shell the other. |
| `CalendarShell` holds **two lists**, and each consumer is a decision | *Anything that displays a set takes `visible`; anything that acts on a row takes `items`.* The grid, week list, drawer and header counts are the first kind; the item sheet, delete confirmation and drag overlay the second. Look `editing` up in `visible` and the sheet closes itself the instant the creator gives that item a platform the filter excludes — a normal edit that would read as a crash. |
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
| The published link takes **its own full-width row**, where the export draws it beside the date | **Fourth knowing departure from the export**, after the 44px options, `text-base` on inputs, and the filter row above the drawer — and, like all three, a reachability constraint rather than taste. The export's `1g` puts Date and `Published link` at `flex:1` in one row; that row no longer exists, because T052 added a `CLEAR` button beside the date (SC-011), so the date half is already two controls. Half of 375px less padding is ~165px, and at the `text-base` 16px iOS forces on us that is about **twenty characters** of a value the contract lets run to **2048**. Measured on the production build at 375px: full width shows 41 characters of a real TikTok URL. **T065 added the open control to this row**, so the figure measured today is **35** — the row is still the link's *own* row, which is what the decision was about, and 35 is still most of the way from the ~20 the shared row allowed. |
| The published link is opened by a **sibling `<a>`, never a nested one**, and it exists only where a `full` chip does | T065. `ItemChip` is a `<button>` (T052) and an `<a>` inside a button is invalid HTML — the parser hoists it out and what gets tapped is undefined — so the chip and the control are two children of the row, which also keeps the drag working (the draggable node is the chip alone, so a pointer going down on the link never reaches `useDraggable`). **Where** it appears follows from the 44px floor: the week list and the expanded drawer get it inline; the month grid's `micro` chips sit in a ~53px cell and the collapsed peek strip is one clipped line, so neither can hold a 44px target without breaking `.claude/rules/design.md`. Those two reach it one tap further in — the sheet and the expanded drawer respectively. `published-link.spec.ts` pins **both** the inclusions and the exclusions, so the absences stay decisions rather than oversights. |
| `rel="noopener noreferrer"` is asserted as an **exact string**, and `noreferrer` is the half that matters | Constitution II. Without it the browser sends the calendar's own URL as a `Referer` to TikTok, Instagram or YouTube on every tap — a third party handed the address of a private planning surface as a side effect of an ordinary link. Modern browsers imply `noopener` from `noreferrer`, which is exactly why the test is not a substring match: a `rel` that had lost `noreferrer` would still pass one. |
| The open control's condition is **a link is present**, never `status === "posted"` | T065's task line said "on `posted` items" and was **amended** (see `tasks.md`). FR-008a retains the link when an item leaves `posted` and the post it points at is still live, so a status gate would take a working link off the calendar the moment the creator reversed a status. US5 scenario 3 states the condition without mentioning status. Verified by breaking it: adding the status gate turns exactly the retained-link test red. |
| The link is checked **before the request is built**, and a refusal leaves the draft untouched | T066, and the resolution was written into `tasks.md` before the code existed so it could not be re-derived from the symptom. T052 fixed that one save is **one** `PATCH` carrying a diff (SC-012 needs a title-only idea to gain a platform *and* advance in one request); a malformed `published_url` makes the backend refuse the **whole body** with a 422, so the status change dies with it — exactly what the spec's edge case forbids. One request cannot satisfy both, and the two alternatives were rejected for stated reasons: a second request destroys the one-save-one-request property, and amending the spec trades a satisfiable requirement for a weaker one. So the sheet does not produce the refusal — the same principle T053 applies to the 409. `setDraft` is **not** called on the refusal path: verified by breaking it, which turns the survival test and its two follow-ons red. |
| `linkRefused` is **state set at the save**, never derived from the draft | Deriving it would mark the field on the first keystroke of a URL the creator is halfway through typing. The check belongs at the save, the only moment the value is claimed to be finished — which is also why `type="url"`'s native validity is inert here (row above). `edit()` clears it, because a refusal describes a save attempt that no longer matches the draft. |
| `focusFix` selects `input, button`, not `button` | T066 gave it a third target. The two invariant codes are resolved in the status and platform columns, which hold buttons; a refused link is resolved in a text field. First match in document order is the control in all three cases, and the link row's `<a>` is not matched at all — which is correct, since focusing the *open* control would be the wrong answer to "fix this link". |
| `isValidPublishedUrl` lives in `lib/items.ts` and is the contract's rule **exactly**, in one place | Two callers with opposite failure modes, which is why it is one function. T065 builds an `href` from it, so a wrong *accept* ships a live `javascript:` link — reachable only on the sheet, where the value is the creator's live draft rather than a row the backend has already vetted. T066 gates the save on it, so a wrong *reject* refuses a value the API stores happily, which no backend test can see. `format: uri` is a JSON Schema annotation validators need not enforce, so `^https?://` plus 2048 is the whole promise — and T063 pinned a bare `https://` as **accepted**. Never use `new URL()` here: the browser's parser rejects it, which would make the client the stricter of the two. |
| The link field is **always rendered**; only the *prompt* is conditional | T064's task line says "prompted on the move to `posted`", and reading that as *revealed* on the move to `posted` breaks FR-019a. A link is **retained** when the item leaves `posted` (FR-008a) and is removable **only by the creator editing it directly** — so a field that disappeared below `posted` would strand the retained value with no control able to clear it, which is the requirement made unsatisfiable by hiding its own input. The prompt shows only while `status === "posted"` **and** the link is still null; prompting for something already supplied is noise. `item-sheet.spec.ts` has one test whose whole subject is this, and it is the one that goes red if anyone "tidies" the field behind a status check. |
| `type="url"` on the link input is for the **keyboard**, and its native validity must never become the gate | The contract's only machine-checkable rule is `pattern: "^https?://"`, and T063 pinned that the API **accepts `https://` with nothing after it** — which the browser's own URL validation rejects. Gating on `input.validity` would make the client refuse a value the server accepts: drift, pointing the other way, and the harder direction to notice because it looks like extra safety. Nothing submits here (every button is `type="button"`, there is no `<form>`), so the attribute stays inert. `maxLength={2048}` *is* enforced at the keystroke, because past it the column refuses and `String(2048)` overflowing is a 500 rather than a 422. |
| The date is a native **`<input type="date">`** with an explicit **CLEAR** beside it | The native control speaks `YYYY-MM-DD` exactly — the format the column, the contract and `lib/dates.ts` all use — so no `Date` is constructed and R-006's UTC-midnight trap has nowhere to occur; it is also keyboard-reachable and gives a phone its own picker (FR-015b). The clear button is **added beyond the export** on purpose: a native date input's own clear affordance is platform-dependent and absent on several mobile browsers, and without it the tap path could schedule but never *un*schedule, leaving T054's drag as the only way back to the backlog — the pointer-only dependency SC-011 forbids. |
| Status and platform options are **`h-11` (44px)**, not the export's 40px | The second place the design is knowingly not followed to the pixel (the first is `text-base` on inputs). `.claude/rules/design.md` makes 44px a hard floor, and these six sit in the densest part of the sheet — exactly where a missed tap is most likely. `item-sheet.spec.ts` asserts the floor so a restyle cannot quietly drop it. |
| `ItemChip.onOpen` and every `onOpenItem` in the chain are **required, not optional** | Not defensive typing — the fix for a bug that shipped green. Passing an optional handler through a JSX **spread** (`{...(x === undefined ? {} : {onOpen: x})}`, needed under `exactOptionalPropertyTypes`) skips excess-property checking, so `onOpen` landing where `onOpenItem` was expected compiled cleanly and silently made three of the four surfaces un-openable. Required props turn the same mistake into a build error. A chip the creator cannot open is a bug now that the sheet exists, so optionality bought nothing. |
| A 409 **marks the control that resolves it and moves focus there**, matched on `code` not on prose | One invariant, two codes, and the codes exist because the *next step* differs: `platform_required` is fixed in the platform column, `platform_locked` in the status column ("move it back to ideas first"). SC-012 asks that neither refusal require leaving the surface — and on a sheet whose body scrolls, **adjacency is not reachability**: the columns are off screen when the creator is on the date field. Moving focus scrolls the fix back and puts the keyboard on it (FR-015b). The message stays the contract's `detail` verbatim, so a reworded backend message changes the sentence and not the behaviour. Any edit clears the refusal, because it described a save attempt that no longer matches the draft. |
| Collision detection is **`pointerWithin`**, not dnd-kit's default | A correctness fix, not a preference, and it shipped a wrong date before it was found. The default intersects the **dragged overlay's rectangle** with the droppables — and the overlay is a `full` chip, far wider than a 53px day cell, so it overlaps three or four days at once and the first intersection wins. A test aiming at the 12th scheduled the 13th. `pointerWithin` makes the answer "the cell under the finger", the only rule a creator can predict, and it returns nothing outside every droppable so a drop into empty space is correctly no change rather than a nearest-neighbour guess. |
| **No `KeyboardSensor`** — an amendment to research.md R-003, applied to all three artifacts | Its activation codes are `Space` and `Enter`, and **T052 made the chip a `<button>`** whose own keys those are. Registering it means `Enter` on a focused chip starts a drag instead of opening the sheet: the *primary* editing path becomes keyboard-unreachable to make the *secondary* one reachable. FR-015b asks for date changes without a **pointer-drag**, and SC-011 for a journey completable without a drag — the sheet's date input satisfies both; neither asks for a drag performed by keyboard. `ItemChip` strips dnd-kit's `onKeyDown` from the listeners it spreads. `research.md` R-003 and `tasks.md` T054 were amended in the same MR. |
| dnd-kit's `attributes` are spread **only on a row that can be dragged** | `useDraggable({disabled: true})` still emits `role="button"`, `tabindex="0"` and `aria-disabled` — so a pending row would become a tab stop announcing itself as a disabled button, the exact thing the `<article>` fallback exists to avoid. A pending row is not disabled; it is **not yet a control**. |
| The drop target's id **is** the date, and the backlog's is one exported constant | `onDragEnd` translates a drop into `{scheduled_date}` with no lookup table that could fall out of step with the grid, and decides between scheduling and unscheduling by comparing against `BACKLOG_DROP_ID` rather than pattern-matching a date. A drop back on the item's own day returns early: a no-op is not an empty `PATCH`, which the backend refuses with a 422. |
| The drag ghost is `DragOverlay` at size `full`, and the source row **stays in place** and dims | A 50px micro chip under a finger is smaller than the finger, so the overlay is always full size whatever was picked up. The source row is dimmed rather than removed because removing it reflows the grid mid-drag and moves the drop target out from under the creator. |
| The delete confirmation is an **`AlertDialog`**, not a `Sheet` | FR-020 is three requirements in one sentence and each needs its own mechanism. `role="alertdialog"` plus a focus trap plus **no dismissal by clicking outside** is the first; a sheet can be swiped or scrimmed away, and "dismissed by accident" is the failure this exists to prevent. The second is order — chip → `DELETE ITEM` → `DELETE PERMANENTLY`, three deliberate taps. The third is `KEEP ITEM` being **first in the DOM and focused on open**, so `Enter` (the key a thumb is most likely still holding) keeps the item, and `Escape` does too. The destructive action carries the *lower* visual weight, outlined rather than filled — a red button is the one reached for without reading. |
| `itemRestored` re-inserts by the **list's ordering**, never by a remembered index | An index captured before an optimistic removal is stale the moment anything else lands (a list read, another edit), and restoring to a stale index puts the row somewhere it never was. Re-deriving from `created_at DESC, id DESC` — the server's ordering, which is total, which is why `selectBacklog` can filter without sorting — is correct whatever happened in between and needs nothing captured. Pending rows are skipped: they are ordered by when *this browser* created them. This is also why `updateItem` and `deleteItem` both take the **row** rather than an id. |
| `updateItem` **removes the row on a 404** where every other failure rolls it back, and it still rejects | T070, and the two halves are separate decisions. **Removing**: a rollback calls `itemChanged(previous, item)`, and the row is still in the list — so it *restores* an item the server says is gone, and the sheet stays open on it with every save producing the same 404 forever. That is the spec's "phantom item presented as editable", in those words. **Rejecting** (unlike `deleteItem`'s 404, the row below): the change the creator asked for did not happen, so a silent resolve would be a lie in the other direction. The pair is asymmetric on purpose — a delete got what it wanted, an edit did not — and `stale-item.spec.ts` pins both so a later "tidy the two 404 branches into one" fails. Do **not** widen it past 404: a 409 or a 500 means the item exists and the change was wrong, which is a rollback. |
| The stale notice lives in `CalendarShell`, **not** in the sheet or the store | Three constraints meet. The **store** is out because a failed *write* is the surface's to report and `state.error` is for a failed *read* — folding them together blanks the calendar over one refused save. The **sheet** is out because it cannot survive its own message: removing the row makes `editing` null and the sheet closes before the message it just set is readable, leaving a save that closes the sheet and removes the chip — indistinguishable from success. And the **drag path** has no sheet at all; `onDragEnd` used to discard every rejection because "the row returning to its old day is the feedback", which is false when the row does not return. So the shell holds it, both paths funnel through one `noticeIfGone`, and `saveItem` wraps `updateItem` to rethrow so `ItemSheet` keeps all its own behaviour. It renders **outside `<main>`**: `<main>` scrolls, and the creator who just dragged a chip is the one who has scrolled. |
| `deleteItem` **resolves on a 404**, and that judgement belongs to the store, not the transport | T050 settled that the API answers 404 for a missing id rather than an idempotent 204, which is right for an API. But this call reconciles a **screen**: the creator asked for the item to be gone and it is gone. An error describing success is the worst of both. `lib/api.ts`'s `deleteContentItem` still throws — the decision is made one layer up, where the story is known. |
| `CalendarShell` holds the **row** for delete and the **id** for edit, and the asymmetry is the point | The optimistic delete removes the row from `items` immediately, so an id lookup would go null the instant the request left and close the dialog before it could render a refusal. It is also the exact value `itemRestored` puts back. Edit is the opposite: the store replaces an item's object on every optimistic change, so a captured row there would be stale. |
| `pipeline.spec.ts` stubs a **small mutating server**, not a canned body | Every other e2e file answers one surface with a fixture, which is right for asserting that surface. This flow *mutates* — the item it creates is the one it later schedules and advances — and "the calendar shows a `posted` item" is worth nothing if the stub would say `posted` to anything. The handler keeps rows and applies `PATCH` bodies with the backend's `exclude_unset` semantics, which is what makes "only what changed was sent" observable from the other end. It deliberately does **not** enforce INV-1: the backend's own tests cover that, and a second implementation here would be testing the stub. |
| T058's "no drag gesture" is asserted by **completing the journey with the keyboard**, not by a comment | A keyboard cannot produce a drag, so a journey finished that way is one no drag was needed for — mechanical where a comment would be aspirational. It is also the test that would fail first if anyone re-registered dnd-kit's `KeyboardSensor`, since `Enter` on a chip would start a drag instead of opening the sheet. |
| **The suite runs `pnpm dev` locally and `pnpm start` in CI, so the dev overlay obstructs a *local* run only** | `playwright.config.ts`'s `webServer` command is `` `${process.env.CI ? "pnpm start" : "pnpm dev"}` ``, and Next's overlay sits exactly over the `MONTH` toggle at 375px. **Corrected 2026-08-03**, and the correction matters more than the fact: this row previously read "the obstruction is a CI fact", which contradicted the trap fifty lines below it saying CI runs the production bundle — **one file asserting both halves, believed at whichever line the reader opens.** `pipeline.spec.ts` uses `dispatchEvent("click")` because the suite must pass locally too, with the reason at the call site. What is worth keeping is the coverage lesson, which is environment-independent: no test before T057 ever clicked `MONTH` — `view-week` is clickable and `view-month` is not — so a control can be one restyle from broken with the suite still green, because **the direction that works is the direction every test happens to use.** |
| `DeleteConfirm`'s `today` is **required**, and that is the Phase 5 `reviewer` finding made unrepeatable | `ItemChip` defaults `today` to `null` and `isOverdue(item, null)` is false, so a surface that forgets to pass it drops the overdue border **silently** — no error, no failing test, just a cue that is not drawn. It shipped that way on the delete dialog, whose own stated justification is "check it is the right one before destroying it". The backlog drawer is still allowed to omit it (it holds only undated items, which can never be overdue); every surface that can hold a *dated* item must pass it. |
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

| **Sign-out lives in the header, and T077's task line said the action band** | A measurement, not a preference — the amendment and its numbers are in `tasks.md`. The band holds the view toggle (123px), two arrows (40px each) and `+ CAPTURE` (97px): 300px of content, 24px of gaps, 32px of padding = **356px of the 375px floor, leaving 19px**, where a 44px target plus its gap needs 50px. FR-022 is what permits the move, and it must be quoted rather than paraphrased: it asks thumb reach for the actions performed **frequently** and *names them* — "capture, status change, date change". Sign-out is none of the three, and distance from the thumb is a feature for the one control whose mis-tap ends the session. It sits **above** the counts, not beside them, so the right column is `max(button, counts)` wide rather than their sum and the period title loses ~5px instead of ~91px. |
| A refused sign-out **keeps the creator on the calendar** and says so | Only the proxy can clear an httpOnly cookie, so a logout the server refused leaves the session **alive**. Navigating to `/login` anyway would report an ending that did not happen — FR-002a read backwards — and would strand the creator on a login form while their session was still open. `logout()` already swallows a 401 (the session was over, which is where sign-out was going), so anything reaching the catch is a session that still exists. The message renders **full width under the header row**, never inside the 44px right-hand column, where a sentence would push the period title and break the constraint that put the control there. |

| There is **one focus indicator**, `.focus-ring` in `globals.css`, plus `.focus-ring-inset` for controls that clip | T067. It lives beside `.notch-card` and `.web-grain` for the same stated reason — a token-level decision rather than a per-screen one — and by T067 it had more than twenty callers, so it is not abstraction ahead of need. **`outline`, never a `ring-*` box-shadow**: on the brand-filled controls a ring is painted in the element's own layer, which is red on red. **`outline-offset: 2px` is what actually solves that**, putting the ring on the dark surface outside the control. Use `.focus-ring` by default and `.focus-ring-inset` **only** where something clips the control's box — see the trap below for the two cases, which is the whole of the list. |
| Focus is `:focus-visible`, and the six pre-existing `ring-*` sites were migrated rather than left alone | Two spellings of one decision is how they drift; `ItemChip` had `ring-2` while nothing else on the calendar had anything. `:focus` rather than `:focus-visible` is the other tempting shortcut and it is worse than nothing — a ring on every mouse tap is the noise that gets focus styles deleted. |

## Traps

**Headless Chromium here has WebGL 2 and it genuinely draws — measured 2026-08-05, before any map
code existed.** The spike ran the probe in both modes at 375×667 and read a cleared pixel back:
`[51,102,153,255]` in each, exactly the colour written. That second half is the evidence that
matters, because **a context that reports fine is not a context that paints** — MapLibre would fail
in precisely that way, silently, on a canvas that reports every capability and stays black.

Two things came out of it that will bite later, and neither is about whether the map works:

- **`webgl1: false` in the spike's output was an artefact of the probe, not a finding.** It asked for
  `webgl2` first on the same canvas, and a canvas holds exactly one context type, so the later
  `getContext("webgl")` had to return `null`. Do not repeat the measurement that way, and do not read
  the recorded result as "WebGL 1 is unavailable here".
- **Headless and headed do not use the same renderer**, so a map canvas cannot go into any
  byte-comparison test. Headless is ANGLE over **SwiftShader** (software, `MAX_TEXTURE_SIZE` 8192);
  headed on this machine is ANGLE over an **AMD Radeon 780M** via D3D11 (16384). Same page, different
  pixels, and a CI runner is a third answer. `focus-states.spec.ts` compares screenshot **bytes** —
  which is the only mechanism that has ever caught a focus ring clipped away by `clip-path`, so it is
  worth protecting — and a map anywhere in its frame would make it flake for a reason no one would
  connect to the map. Assert the map through the DOM and through pure functions in `lib/`, never
  through its canvas.

**A focus ring that a computed style calls perfect can be painted and then thrown away, and only
pixels can tell you.** Found twice in T067, after the class was applied and the whole style sweep was
green. **`.notch-card` is a `clip-path`, and a clip-path clips the element's outline** — so
`+ CAPTURE`, the drawer's capture button, both sheet save buttons and the login submit reported
`outline: 2px solid` and drew **nothing at all**. The view toggle's wrapper has `overflow-hidden` (it
clips `MONTH`/`WEEK` to the group's rounded border), which left a 2px sliver on one inner edge.
`.focus-ring-inset` exists for exactly these two shapes and for nothing else.

The general rule, which is the reusable half: **an assertion about a computed style cannot see
clipping, compositing, or contrast.** `focus-states.spec.ts` therefore also screenshots each control
focused and unfocused and compares the bytes — no baseline file, so nothing to re-bless, and
identical bytes are the definition of an invisible focus state. Verified by putting the outset ring
back on `+ CAPTURE`: the style sweep stayed green and the pixel test failed with
`capture-action draws no focus ring`.

**The first version of that spec passed against the very code it was written to fix, and the reason
generalises past focus.** It asked `outlineStyle !== "none" || boxShadow !== "none"` — and **Chromium
draws its own focus ring**, which the base layer's `* { outline-ring/50 }` merely tints. All fourteen
unstyled controls reported `outline: auto 1px oklab(… / 0.5)`: one pixel, half transparent, and red
on the red buttons. `auto` is the UA default and `solid` is ours, so the check is for `solid` at 2px
or more. **When asserting that a style exists, assert the value the design specifies, not that the
property is non-default** — the browser supplies a default for almost everything, and a default is
what you are usually trying to replace.

**`CalendarShell`'s `<main>` is a tab stop, because Chromium makes scrolling containers
keyboard-focusable.** Not a bug and not something to "fix" with `tabindex="-1"` — it is how a keyboard
user scrolls the month grid with the arrow keys, and the grid scrolls in its own container by
design (`.claude/rules/design.md`). It surfaced as a **flaky** `focus-states.spec.ts` run: a tab walk
landed on `main:MTWTFSS2728…` roughly half the time, depending on where focus started. Any test that
enumerates tab stops has to expect it. `focus-states.spec.ts` filters on **what an element is** — a
natively interactive tag or an interactive ARIA role — rather than on a list of testids, so the scroll
region is exempt while a control added next month is still covered on the day it lands. The container
keeps the browser's own faint ring, which is the right treatment for a scroll region; a 2px brand
outline around the whole calendar body would not be.

**`aria-hidden` is the right way to skip a focus trap's sentinels.** `AlertDialog` (base-ui) wraps its
content in `<span data-base-ui-focus-guard aria-hidden="true" tabindex="0">`, clipped to 1px — a real
tab stop that exists to bounce focus back in. A tab-walking test has to skip it, and the criterion is
`aria-hidden="true"`, not the vendor attribute: an element hidden from assistive technology cannot be
a control, so it excludes the machinery and nothing a requirement could hide behind, and it does not
need rewriting when the primitive changes.

**A `scrollWidth > clientWidth` check does not catch content pushed off the side of the screen.** The
whole suite's horizontal-overflow assertion is
`document.documentElement.scrollWidth > document.documentElement.clientWidth`, and it is **weaker than
it reads**. Verified while building T077 by putting the sign-out control in the action band as the
task line originally said: `+ CAPTURE` moved to **x=417 on a 375px viewport — 42px past the right
edge — and the check stayed `false`.** The band is a flex row inside an `h-dvh` column, so it *clips*
rather than extending the document's scroll width; the primary action simply left the screen with
nothing to announce it. FR-021 forbids the body scrolling and SC-003 asks that the views be "fully
usable", and this failure satisfies the first while destroying the second. The assertion that catches
it is the one `period-nav.spec.ts` already had —
`capture.x + capture.width <= viewport.width` — so **assert that the controls are inside the viewport,
not only that the body does not scroll.** T069 closed this by adding
`tests/e2e/viewport-audit.spec.ts`, which sweeps every route and overlay surface and fails on any
visible control whose box leaves the 375px width. **The thirteen scrollWidth assertions are kept**:
they catch the other clause of FR-021, and neither check subsumes the other.

**A `truncate`d title has a min-content width of the whole string, and in a grid that widens the
box.** T069's audit found the delete confirmation **561px wide on a 375px screen**, with `KEEP ITEM`
and `DELETE PERMANENTLY` cut in half at the right edge. `ItemChip`'s title is `truncate`
(`white-space: nowrap`), so the chip's min-content is the entire title; `AlertDialogContent` is a
`grid`, and a grid track's automatic minimum is its items' min-content, so a long title stretched
the track and the two `w-full` buttons stretched with it. **`max-w-xs` on the dialog did nothing** —
content overflows a track rather than being clamped by it. The fix is `min-w-0` on the grid item
**and** `w-full min-w-0` on the chip: a `<button>` is `inline-block`, so it sizes to its content and
shrinking the track alone left the chip at 561px. `BacklogRow` passes `min-w-0 flex-1` for the same
reason one layout mode over. **Any surface that puts an `ItemChip` inside a grid or flex container
has to say how it may shrink**, or the title decides the container's width.

What makes it worth its own entry is that **`delete-item.spec.ts` has a test called "the dialog does
not make the page scroll sideways at 375px" and it passes against the broken dialog** — the dialog is
`position: fixed`, so nothing it does reaches the document's scroll width. Verified by restoring the
defect: old assertion green, new audit red.

**Measured a second time at T068, on a different control, with the same result.** The export's first-run
panel (`1k`) renames the band's button to `+ CAPTURE FIRST IDEA`; swapping the label in the live band
at 375px takes it from **97px wide ending at x=359** to **168px ending at x=411 — 36px past the edge**,
with the overflow check still `false`. Two independent labels, one failure mode: **this band clips, and
nothing about the document announces it.** Any change to the action band's contents needs a viewport
measurement, not an overflow assertion.

**A bottom sheet measured the instant it becomes *visible* is still 40px below where it lands.**
`SheetContent` enters on a 200ms `translate-y-[2.5rem]` transition, so `toBeVisible()` resolves while
the sheet is still moving and a `boundingBox()` taken straight after reads a position that never
existed at rest. The symptom is an off-by-40 assertion that fails every run and looks like a layout
bug. Use `toBeInViewport()` — it retries — or assert something that is not a coordinate.

**A client-side mirror of a backend constraint must mirror *all* of it, and the half that gets
forgotten is the normalisation.** `isValidPublishedUrl` copied the contract's `^https?://` and 2048
faithfully and missed that `PublishedUrl` also carries `strip_whitespace=True` — and Pydantic strips
**before** applying the pattern. So ` https://tiktok.com/…` was a refusal in the browser and an
accepted value at the API, which is the client-stricter-than-the-contract drift that whole function
exists to prevent. Two things made it survive review: `<input type="url">` does **not** sanitise the
whitespace away (Chromium keeps it in `value` — measured, not assumed), and both "not stricter than
the contract" tests only ever exercised the *bare scheme* looseness, so the second looseness had no
test at all. Found by the Phase 7 `reviewer` pass. **When mirroring a constraint, read the whole
annotation, not the part the contract happens to repeat** — and prefer verifying against the running
API over reasoning about the validator.

**A `<form>` with no `method` defaults to GET, and before hydration that is the only thing your
`preventDefault()` is not doing.** Found at **T072**, against the deployed product, on the first
automated sign-in attempt: the browser navigated to `/login?email=...&password=...` and put the
creator's real password in the address bar, in browser history, and in the edge's access logs.
`handleSubmit` calls `preventDefault()` — but React attaches it at hydration, and a `type="submit"`
button inside a `<form>` is fully functional before that. The default no one chose is the one that
shipped.

**The window is a property of the deployment, not of the browser.** On a fast local server hydration
is effectively instant and the window is unobservable — which is exactly why nothing caught it for
77 tasks. On the free tier it is wide: T072 measured the cold document at **~44 seconds** (Render
spins down *and* Neon auto-suspends, stacked), with hydration behind that. A creator who types and
taps during the first load of the day is *inside* it.

The fix is two independent halves, and `login.spec.ts` pins them separately so removing one cannot
be masked by the other: **`method="post"`** so a native submit can never serialise credentials into
a URL, and a **hydration guard** (`useSyncExternalStore`, module-scope callbacks — see the clock
rule above) disabling the submit control until handlers exist. Verified by breaking each half and
confirming the matching test — and only that test — went red.

**The guard changes what a script must wait for, and getting it wrong looks like a wrong password.**
Wait for hydration **before typing**, not merely before clicking. Playwright's `click()` already
auto-waits for an enabled control, so the guard appears to be handled for free — but values typed
into a React-controlled input *before* hydration live only in the DOM, and hydration then resets the
input to React's own empty state. The click submits an **empty** form, the API answers 401, the page
stays on `/login`, and the symptom is a navigation timeout indistinguishable from a dead backend, a
suspended Neon, or a bad credential. It cost two full walks against production at T072, with a
credential that was correct the whole time and returned 200 to `curl` throughout. The shape to
remember: **auto-waiting protects the interaction you can see, not the state you established before
it.** `scripts/t072-walk.mjs` polls the submit control's `disabled` state before filling anything.

The general form, which outlives this component: **every native HTML default is live until
hydration.** Anything whose correctness depends on a React handler running is unprotected in that
window, and `<form>` is the dangerous case because its default action *transmits*. This is also the
sharpest instance yet of the rule in `.claude/memory.md` that a green suite is evidence about the
frontend in isolation and never about the deployed seam.

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
