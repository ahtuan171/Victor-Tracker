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
pnpm exec playwright test                   # 375x667 only
pnpm exec playwright test -g "create content item"
```
