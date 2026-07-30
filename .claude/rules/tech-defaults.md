# Tech defaults

Locked for v0.1. Changing any row is a Reflect-stage decision, not an in-flight one.

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI, Python 3.13, `uv` | `uv` is the package manager — never pip or poetry |
| ORM | SQLModel + Alembic | one class for DB model and API schema unless they genuinely diverge |
| DB | PostgreSQL | docker-compose locally, Render managed in prod |
| Frontend | Next.js App Router, TypeScript, Tailwind, shadcn/ui, `pnpm` | App Router, not Pages |
| Auth | JWT, single user seeded by script | login + access token only. No register, refresh, reset, or multi-tenant columns |
| Tests | pytest (backend), Playwright (one E2E flow) | no Jest/RTL in v0.1 — UI still moving |
| CI/CD | GitLab CI: build → test → review → deploy | `main` protected, MR required |
| Deploy | Render (backend), Vercel (frontend) | manual approval on deploy at v0.1 |

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
