# CreatorHub — backend

FastAPI + SQLModel + Alembic on PostgreSQL, managed with [`uv`](https://docs.astral.sh/uv/). Serves
the Content Calendar API for v0.1: authentication and CRUD over content items.

`uv` is the package manager — **never pip or poetry** (`.claude/rules/tech-defaults.md`).

## Prerequisites

| Tool | Notes |
|---|---|
| Python 3.13 | pinned by `pyproject.toml` |
| `uv` | installs everything else |
| Docker + compose | for PostgreSQL; **start Docker Desktop first**, its daemon does not survive a reboot |

## First run

From the repository root, bring up Postgres — this also creates the `creatorhub_test` database the
suite uses, via `scripts/init-test-db.sql`:

```bash
docker compose up -d db
```

Then from `backend/`:

```bash
uv sync
cp ../.env.example ../.env      # if you have no .env yet — see "Configuration" below
uv run alembic upgrade head     # applies 9483af05dd5b to the dev database
uv run python -m app.scripts.seed_user
uv run uvicorn app.main:app --reload
```

The API is then at `http://localhost:8000`, with interactive docs at `/docs` and a health probe at
`/health`.

Alternatively `docker compose up -d backend` runs the same server in a container. The first start
takes roughly 70 seconds while `uv sync` runs inside it.

## The single creator account

There is **no registration endpoint**. The one account is created by `app.scripts.seed_user` from
`SEED_CREATOR_EMAIL` and `SEED_CREATOR_PASSWORD`, and by nothing else — v0.1 is single-user by
design (constitution principle VII; `content_item` has no owner column).

Re-running the script **resets the password** of the existing account, which is v0.1's only password
recovery. It refuses a *different* email outright: a second creator would silently share every item
with the first.

Two things that cost time if you meet them fresh:

- `email-validator` **rejects `.local`** as a reserved special-use TLD, so `creator@creatorhub.local`
  fails. Any real domain works.
- The suite and the app read `.env` at import — `app/config.py` refuses to import without one, which
  also bites in a git worktree that has no `.env` of its own.

## Configuration

Settings come from `.env` at the repository root (see `.env.example`), read by `app/config.py`.
`JWT_SECRET` has an enforced minimum length — a short one fails at startup rather than at first
login, which is how it once turned a pipeline red.

Sessions are ~30 days with **sliding reissue**: FastAPI attaches a fresh `X-Access-Token` header and
the Next.js proxy rewrites the cookie from it. Both halves are required, or sessions die on day 30.
There is no refresh token.

## Commands

```bash
uv sync
uv run alembic upgrade head                 # applies 9483af05dd5b
uv run alembic check                        # must say "No new upgrade operations detected"
uv run alembic revision --autogenerate -m "..."

uv run uvicorn app.main:app --reload        # http://localhost:8000/docs
uv run python -m app.scripts.seed_user

uv run pytest                               # needs `docker compose up -d db`
uv run pytest tests/test_auth.py::test_login_success
uv run ruff check . && uv run ruff format --check . && uv run mypy .
```

## Tests

`uv run pytest` needs Postgres up, and nothing else: **the harness migrates `creatorhub_test`
itself** with `alembic upgrade head`, so it works against an empty database. That is why
`.gitlab-ci.yml`'s `test:backend` job has no migration step and **must not gain one** — two of them
racing is worse than neither. The `alembic upgrade head` above is for the *dev* database
(`creatorhub`) only.

`ruff`, `mypy` and the suite all run in CI and block the merge, including on your own merge requests.

## Where the rules live

- **[`AGENTS.md`](AGENTS.md)** — backend decisions, traps and conventions. Read it before your first
  edit in this tree; it is not repeated anywhere else.
- **[`../specs/001-content-calendar/`](../specs/001-content-calendar/)** — the source of truth.
  `spec.md` (what and why), `data-model.md` (INV-1…INV-4), `contracts/openapi.yaml` (the eight
  operations), `quickstart.md` (the V1–V9 validation walk).
- **[`../.specify/memory/constitution.md`](../.specify/memory/constitution.md)** — the principles
  every module shares.

When code and `specs/` disagree, one of them is wrong: decide which, fix that one, and say so in the
merge request. Never code around the gap.
