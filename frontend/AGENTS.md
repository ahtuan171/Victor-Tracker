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
| A failed **write** rethrows; only a failed **read** sets `state.error` | The capture sheet renders a refused save beside its own field, with the creator's text still on screen. Folding it into the list's error would blank the calendar because one save was refused. |
| Hand-built calendar grid, no library | Every calendar library's value is time-of-day layout, which FR-012a removed. |
| The proxy allowlist forces a **decision per contract operation**, not a copy of the contract | `NOT_PROXIED` exists so the sync test can require every operation to be *either* allowed *or* excluded-with-a-reason. An allowlist that simply mirrors `openapi.yaml` gates nothing the moment the contract grows. `/health` is the one exclusion today — Render's probe, no screen reads it. |
| The proxy **captures the login token out of the response body** | `POST /auth/login` returns `access_token` in its body. Forwarding that to the browser would hand a 30-day credential to JavaScript and undo the whole of R-001, so the proxy moves it into the httpOnly cookie and returns `{expires_at}` alone. The contract still describes the FastAPI origin truthfully — this response comes from the Vercel origin, which is deliberately not transparent about credentials. |
| The proxy **clears the cookie on any 401**, not just on logout | JavaScript cannot delete an httpOnly cookie, so this route is the only thing that can. Without it T024's "clear the session cookie and redirect" would need a second endpoint invented to do it. |
| Cookie `Max-Age` is derived from the token's own `exp`, not from a constant | The alternative is a frontend copy of the backend's `TOKEN_TTL_DAYS` kept equal across two separate deployments with nothing to notice drift. The signature is **not** verified and does not need to be: the value times a cookie, and the backend stays the only authority on validity. |
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

**A misspelled Tailwind class fails silently, and the design tokens made that worse.** Tailwind
generates nothing for a name it does not recognise — no build error, no lint error, no test failure.
`bg-surface-1` and `bg-surface1` are equally "valid" to every check in CI, and the second one renders
a transparent panel. `pnpm build`, `pnpm typecheck`, `pnpm lint`, and the whole Playwright suite all
passed on the login redesign *before* it had ever been looked at. **Screenshot the surface at 375px
after restyling it** — the suite asserts geometry (tap targets, thumb reach, overflow), which is
exactly what survives a dropped colour class.

**A stub that mimics a response body but not its `Set-Cookie` passes until the destination is
guarded.** `login.spec.ts` stubbed `POST /api/auth/login` with a body alone from T025, and the two
tests that follow a successful sign-in were green — because `/calendar` did not exist, and **a 404
leaves the browser at the address it asked for**. T033 created that route behind the session guard,
which would have bounced a correct sign-in back to `/login` and failed on a shortcoming of the stub
rather than of the page. A stub of the proxy has to do everything the proxy does that the test's
assertions depend on; when a route becomes guarded, re-check every stub that navigates to it.

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

**Next's dev server answers a redirect with an HTML body; `next start` answers with an empty one.**
So `expect(body).not.toContain("<html")` on a 3xx is green in CI — which runs the production bundle —
and red on every developer machine. That is this repo's usual trap running backwards, and it is why
`tests/e2e/root-redirect.spec.ts` asserts status and `Location` instead. Anything about response
*bodies* on redirects belongs in a manual quickstart step, not the suite.

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
