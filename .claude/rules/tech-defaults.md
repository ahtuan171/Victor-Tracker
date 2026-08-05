# Tech defaults

Locked for v0.2. Changing any row is a Reflect-stage decision, not an in-flight one.

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI, Python 3.13, `uv` | `uv` is the package manager — never pip or poetry |
| ORM | SQLModel + Alembic | one class for DB model and API schema unless they genuinely diverge |
| DB | PostgreSQL | docker-compose locally, **Neon** managed in prod — amended at T071, reason in `plan.md` |
| Object storage | Cloudflare R2 (S3-compatible) | **Added at the 2.0.0 amendment.** Photographs only. Presigned PUT and presigned GET, both expiring — see [Object storage](#object-storage) |
| Frontend | Next.js App Router, TypeScript, Tailwind, shadcn/ui, `pnpm` | App Router, not Pages |
| Map | MapLibre GL JS + a dark raster basemap | **Added at the 2.0.0 amendment.** The first library in this project that earns its place — see [The map](#the-map) |
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

## The map

**Added at the 2.0.0 amendment**, alongside the pivot to a travel map.

A world map is the first place in this project where a library is worth its weight, and that is not a
reversal of the calendar decision — it is the same test applied to a different problem. The calendar
was hand-built because every calendar library's value is time-of-day layout, which FR-012a removed:
the library scored **zero**, so its cost bought nothing. A world map needs a projection, tiled raster
loading, inertial pan and zoom, and pin placement that survives both; none of that is a weekend's
work, and all of it is what MapLibre already does.

**The basemap MUST be dark.** It is the product's primary direction and it is what makes pins legible
over terrain. Free options that need no API key exist (CARTO's dark basemaps among them); whichever
is chosen, **its attribution requirement is a licence term and MUST be rendered on the map**.

**Tile requests leave the machine, and principle II governs what may ride along.** A tile request
necessarily tells the provider which part of the world is on screen. That is a disclosure and
`plan.md` MUST state it rather than let it pass silently. What MUST NOT happen is anything more: no
place name, pin label, note, photograph, or record identifier may appear in a tile URL, a style URL,
or any header sent with them. Pins are drawn client-side over the tiles; the provider learns the
viewport and nothing else.

## Object storage

**Added at the 2.0.0 amendment.** Photographs, and nothing else — this is not a general file store.

**Presigned PUT, straight from the browser.** The upload MUST NOT pass through FastAPI: Render's
filesystem is ephemeral, and pushing image bytes through a service that may be cold-starting is the
fastest way to rebuild the latency problem T072 measured. The backend's job is to mint a short-lived
upload URL and to record the resulting object key.

**Presigned GET to read, expiring, never a public bucket.** Principle II states this outright and the
reason is that a public bucket converts an entire personal archive into guessable URLs. The database
stores the **key**; a URL is minted per read and dies on its own.

Never store image bytes in Postgres. It is the tempting shortcut because it needs no new credential,
and it makes every backup, every migration and every query pay for data that has no business being in
a row.

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
- **A static SVG world map instead of MapLibre** — considered seriously at the 2.0.0 amendment and
  rejected on one point: it cannot zoom past country outlines, and a memory is attached to a place,
  not to a country. Its advantages were real (no third-party request at all, tiny, trivially themed)
  and are the reason the tile disclosure is written down rather than waved through.
- **Image bytes in Postgres (`bytea` or base64)** — see [Object storage](#object-storage). It taxes
  every backup, migration, and row read to avoid provisioning one bucket.
