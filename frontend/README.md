# CreatorHub — frontend

Next.js **App Router** (not Pages), TypeScript, Tailwind 4, shadcn/ui, `@dnd-kit`, managed with
`pnpm`. This is the Content Calendar surface for v0.1: a mobile-first planning calendar for a single
creator.

**375px is a hard floor, not one entry in a matrix** (constitution principle I). Every screen is
designed and tested at phone width; the page body never scrolls horizontally, tap targets are at
least 44px, and the primary actions sit within thumb reach.

## Prerequisites

| Tool | Notes |
|---|---|
| Node 24 | |
| `pnpm` | |
| Playwright browsers | `pnpm exec playwright install` |
| The backend | for anything past the login form — see [`../backend/README.md`](../backend/README.md) |

## First run

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

`pnpm dev` needs **no `.env.local`**: `lib/session.ts` defaults `API_BASE_URL` to the compose backend
outside production. Start the API alongside it with `docker compose up -d db backend` from the
repository root, or run uvicorn yourself.

### Running a production build locally

Do this whenever you are checking the app by hand rather than by test — a hand-walk of
`quickstart.md` requires it:

```bash
pnpm build
API_BASE_URL=http://127.0.0.1:8000 SESSION_COOKIE_SECURE=false pnpm start
```

Both variables are load-bearing:

- Without `API_BASE_URL` the production build has no upstream to proxy to.
- Without **`SESSION_COOKIE_SECURE=false`** the proxy sets a `Secure` cookie, the browser refuses to
  store it over plain http, and the sign-in *appears to succeed* and then bounces straight back to
  `/login` — which reads as a broken session guard rather than as a cookie that was never saved.

Next's dev overlay also sits exactly over the `MONTH` toggle at 375px and eats the click, so under
`pnpm dev` that control looks broken and is not. This is a local-run artifact only: CI runs the
production bundle.

## Architecture, in one page

- **`app/api/[...path]/route.ts`** is a proxy, and it is the only thing that talks to FastAPI. The
  session lives in an **httpOnly cookie** that JavaScript cannot read; the proxy attaches the bearer
  token, rewrites the cookie when the backend reissues one, and clears it on any 401. The JWT signing
  secret never reaches this deployment.
- **`lib/api.ts`** has exactly **one `fetch`**. Every operation goes through it, which is what gives
  every call the same error type, the same 401 handling and the same credentials. Types are
  hand-written from `contracts/openapi.yaml` — no codegen is installed, so "generate" means "write by
  hand", and a contract test guards the enums.
- **`lib/items.ts`** holds item state for every surface: **one unparameterised read, narrowed
  client-side, with optimistic updates** (research.md R-007). The calendar, the backlog drawer and
  the platform filter all read the same loaded list. Do not add a second data-fetching strategy per
  surface, and do not make the calendar's read pass a date range — that returns no undated rows and
  silently empties the backlog.
- **Pure functions plus a thin hook.** There is no Jest and no React Testing Library at v0.1, so
  there is **no renderer in this project**: anything that decides what the state becomes is an
  exported pure function, tested directly. Add new state transitions that way, not as logic inside
  the hook.

## Commands

```bash
pnpm dev
pnpm build && pnpm typecheck && pnpm lint
pnpm start                                      # needs the two variables above

pnpm exec playwright test                       # all four projects
pnpm exec playwright test --project=client      # lib/* against a stubbed fetch
pnpm exec playwright test --project=contract    # lib/* vs specs/.../openapi.yaml
pnpm exec playwright test --project=proxy       # the route handler, stubbed upstream
pnpm exec playwright test --project=mobile-375  # the browser flow, 375x667
pnpm exec playwright test -g "create content item"
```

`eslint` and `tsc` are the real gate — **prettier is not this repo's formatter**. Both run in CI
alongside the suite and block the merge, including on your own merge requests.

## Tests

Four Playwright projects, one config. The browser project runs at **375×667 written out explicitly**,
because the number *is* the requirement rather than a device preset that an upgrade could change.

Two things worth knowing before trusting a green run:

- **Every frontend test stubs the proxy**, because CI has no FastAPI behind it. A fully green suite
  says nothing about whether browser → proxy → FastAPI → Postgres works. Hand-walk `quickstart.md` at
  every checkpoint.
- **A misspelled Tailwind class fails silently** — no build error, no lint error, no test failure,
  just an unstyled element. The suite asserts geometry, which is exactly what survives a dropped
  colour class. **Screenshot at 375px after any restyle**, on a port other than 3100 (the suite's),
  and kill that server afterwards.

## Where the rules live

- **[`AGENTS.md`](AGENTS.md)** — frontend decisions and traps, and the reason behind each one. Read
  it before your first edit in this tree; none of it is repeated elsewhere, and several entries
  describe defects that shipped green. Never edit inside its `BEGIN/END:nextjs-agent-rules` markers,
  which Next.js tooling rewrites.
- **[`../design/content-calendar/`](../design/content-calendar/)** — the Claude Design export every
  surface is built from, plus the brief and its data-shape audit. Open it before building a screen
  rather than inventing a layout. Where the implementation knowingly departs from it, `AGENTS.md`
  says so and why — all of those are tap-reachability constraints, not taste.
- **[`../specs/001-content-calendar/`](../specs/001-content-calendar/)** — the source of truth.
- **[`../.claude/rules/design.md`](../.claude/rules/design.md)** — the mobile-first constraints.

`app/globals.css` is **the only file allowed to contain a colour**. The tokens there come from the
design export and are shared by all four planned modules, so a hex written into a component is a
project-wide decision taken in the wrong place.

When code and `specs/` disagree, one of them is wrong: decide which, fix that one, and say so in the
merge request. Never code around the gap.
