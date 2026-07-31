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
| Hand-built calendar grid, no library | Every calendar library's value is time-of-day layout, which FR-012a removed. |
| The proxy allowlist forces a **decision per contract operation**, not a copy of the contract | `NOT_PROXIED` exists so the sync test can require every operation to be *either* allowed *or* excluded-with-a-reason. An allowlist that simply mirrors `openapi.yaml` gates nothing the moment the contract grows. `/health` is the one exclusion today — Render's probe, no screen reads it. |
| The proxy **captures the login token out of the response body** | `POST /auth/login` returns `access_token` in its body. Forwarding that to the browser would hand a 30-day credential to JavaScript and undo the whole of R-001, so the proxy moves it into the httpOnly cookie and returns `{expires_at}` alone. The contract still describes the FastAPI origin truthfully — this response comes from the Vercel origin, which is deliberately not transparent about credentials. |
| The proxy **clears the cookie on any 401**, not just on logout | JavaScript cannot delete an httpOnly cookie, so this route is the only thing that can. Without it T024's "clear the session cookie and redirect" would need a second endpoint invented to do it. |
| Cookie `Max-Age` is derived from the token's own `exp`, not from a constant | The alternative is a frontend copy of the backend's `TOKEN_TTL_DAYS` kept equal across two separate deployments with nothing to notice drift. The signature is **not** verified and does not need to be: the value times a cookie, and the backend stays the only authority on validity. |
| `lib/api.ts` types are **hand-written from the contract**, with a test guarding the enums | No OpenAPI codegen is installed and none should be: eight operations and four schemas is smaller than the toolchain that would generate them, and R-007 asks for "a typed fetch wrapper". The cost is drift, so `tests/contract/api-types.spec.ts` compares `STATUSES`, `PLATFORMS`, and `INVARIANT_CODES` against `openapi.yaml` on disk. Object shapes are left to `tsc --noEmit` — a TypeScript interface has no runtime form to compare against. |
| The client **normalises** the contract's optional-but-nullable fields to `null` | `ContentItem`'s `required` list is `[id, title, status, created_at, updated_at]`, so a response may omit `hook`, `platform`, `scheduled_date`, and `published_url` rather than send null. Typing them `hook?: string | null` would be faithful and would put a `?? null` on every read site in the calendar and the drawer. `toContentItem` makes the declared type true instead. It is **not** a validator — the backend is trusted; it only stops `undefined` reaching a component typed for `null`. |
| `logout()` swallows a 401, and it is the only swallowed error in the client | The proxy clears the cookie on any 401, so by the time the client sees one the session is genuinely over — which is the state logout was trying to reach. Throwing would leave the UI believing it is signed in while the credential is gone. Every other status still throws. |
| Contract tests run as a **second Playwright project**, not a second test runner | `tech-defaults.md` names Playwright as the frontend test tool, and `.gitlab-ci.yml`'s `test:e2e` job runs `playwright test` with no `--project` filter — a separate config file would be a merge gate nobody invokes. The project touches no `page` fixture, so no browser starts. |

## Traps

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
