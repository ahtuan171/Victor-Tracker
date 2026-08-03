# Tech defaults

Locked for v0.1. Changing any row is a Reflect-stage decision, not an in-flight one.

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI, Python 3.13, `uv` | `uv` is the package manager — never pip or poetry |
| ORM | SQLModel + Alembic | one class for DB model and API schema unless they genuinely diverge |
| DB | PostgreSQL | docker-compose locally, Render managed in prod |
| Frontend | Next.js App Router, TypeScript, Tailwind, shadcn/ui, `pnpm` | App Router, not Pages |
| Auth | JWT, single user seeded by script | login + access token only; **sliding reissue permitted, no refresh token**. No register, reset, or multi-tenant columns — see [Sliding reissue](#sliding-reissue) |
| Tests | pytest (backend), Playwright (one E2E flow) | no Jest/RTL in v0.1 — UI still moving |
| CI/CD | GitLab CI: build → test → review → deploy | `main` protected, MR required |
| Deploy | Render (backend), Vercel (frontend) | manual approval on deploy at v0.1 |

## Sliding reissue

**Amended at the Reflect stage of 001-content-calendar (T075), which is the only stage this table may
change in.** The Auth row previously read "No register, **refresh**, reset, or multi-tenant columns",
and a spec requirement collided with it: FR-002a asks for a ~30-day session that "renews silently
while the creator is active", whose obvious mechanism is a refresh token.

**The rule now, for this and every later module:** one access token, reissued past its half-life.
There is **no second token type and no refresh endpoint** — which is what the original row was
protecting, and it is still protected.

The mechanism has two halves and **both are required**; with either one missing, sessions die on day
30 and it looks like a token bug:

1. The backend's auth dependency issues a fresh token past half-life and attaches it as an
   **`X-Access-Token`** response header.
2. The Next.js proxy rewrites the session cookie from that header — with a **`Max-Age`**, because a
   cookie without one is a session cookie that mobile Safari discards on tab eviction — and strips
   the header before the response reaches the browser.

Why it is written here rather than left in `research.md` R-002: that section argued the case for one
feature, and a later module inheriting this table would otherwise re-derive the rule from an argument
buried in another feature's research file — or read the un-amended row and build a refresh endpoint.
R-002 itself records the process correction, that an earlier draft asserted no amendment was needed,
which was the plan grading its own reinterpretation of a locked row.

**The accepted weakness, stated rather than hidden**: reissue-on-use means a leaked token grants
indefinite access rather than at most 30 days, because v0.1 has no denylist and so no revocation.
Accepted for a single-user tool, and the first thing to revisit if this ever serves a second person.
Sign-out clears the cookie and ends the session from the browser's point of view; the token itself
stays valid until expiry, which is the honest reading of a stateless token without a denylist.

## Repo layout

```
.specify/       # SpecKit machinery — templates, scripts, and the constitution. Do not hand-edit.
  memory/constitution.md    # project principles, shared across all features
specs/          # SpecKit output per feature — the source of truth
  001-content-calendar/{spec,plan,tasks}.md
design/         # Claude Design exports: screenshots + React component bundles
backend/        # FastAPI app, Alembic migrations, pytest suite
frontend/       # Next.js app, Playwright suite
docs/           # retros
```

## Commands

Target conventions — they become real as each part is scaffolded.

```bash
docker compose up                       # Postgres + FastAPI + Next.js dev servers

# Backend (from backend/)
uv sync
uv run uvicorn app.main:app --reload
uv run alembic revision --autogenerate -m "add content_items"
uv run alembic upgrade head
uv run python -m app.scripts.seed_user  # create the single v0.1 account
uv run pytest
uv run pytest tests/test_content.py::test_create_item   # single test
uv run ruff check . && uv run mypy .

# Frontend (from frontend/)
pnpm dev
pnpm exec playwright test
pnpm exec playwright test -g "create content item"      # single test
pnpm lint && pnpm exec tsc --noEmit
```

## Choices already rejected

Do not re-propose these — they were considered and dropped for stated reasons:

- **Poetry** — `uv` is already required for `specify-cli`; one Python toolchain, not two.
- **Raw SQLAlchemy 2.0** — more boilerplate than an MVP with simple entities needs.
- **Pages Router** — Claude Design exports assume modern React; App Router is the forward path.
- **Jest/RTL component tests at v0.1** — the UI changes faster than the tests would survive.
- **Multi-tenant schema "for later"** — see constitution principle VII.
