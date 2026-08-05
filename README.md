# CreatorHub

Run it locally, look at it, and give feedback. That is what this file is for — if you want to
*change* the code, read [`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md) instead, and the agent guidance in
[`CLAUDE.md`](CLAUDE.md).

> **The name does not describe the product any more.** The repository, the GitLab project, both
> deploy targets and the GitHub mirror all still say "CreatorHub". The product is pivoting to a
> personal travel memory map; renaming would mean re-pointing two live deployments and a mirror for
> something purely cosmetic, so it is deliberately deferred.

## What actually exists right now

| | State |
|---|---|
| **Content Calendar** | **Built, tested, deployed.** Everything below walks through it. |
| **Travel map** | **Not built.** Next iteration — there is nothing to look at yet. |

271 backend tests and 432 frontend tests pass on `main`, none skipped.

---

## Before the first run

Three things, and the first one catches almost everybody.

1. **Start Docker Desktop.** Its daemon does not survive a reboot, and without it the app fails in a
   way that looks like a bug in the login page rather than a missing database.
2. **Create `.env` in the repository root** by copying `.env.example`. Two values matter:
   - `JWT_SECRET` — there is a **minimum length**, and a short one stops the backend booting with a
     validation error rather than a helpful message.
   - `SEED_CREATOR_EMAIL` / `SEED_CREATOR_PASSWORD` — the account you will sign in with. **Do not use
     a `.local` address**: it is a reserved TLD and the email validator refuses it outright.
   `.env` is gitignored and never leaves your machine.
3. **Tools**: Docker, `uv`, `pnpm`, Node 24.

---

## Start the backend

```bash
docker compose up -d db backend
```

The first `backend` start takes about **70 seconds** while `uv sync` runs — it is not hung. Wait for
it to answer:

```bash
curl http://127.0.0.1:8000/health
```

Then create your account (once):

```bash
docker compose exec backend uv run python -m app.scripts.seed_user
```

Re-running this **changes the password** of the existing account. A *different* email is refused on
purpose: there is no owner column on content items, so two accounts would silently share every item.

---

## Start the frontend — two ways, and the choice matters

```bash
cd frontend
pnpm install
```

Then pick deliberately:

| | Command | Use it when |
|---|---|---|
| **Dev** | `pnpm dev` | You are changing code and want hot reload. |
| **Production** | `pnpm build`, then `API_BASE_URL=http://127.0.0.1:8000 SESSION_COOKIE_SECURE=false pnpm start` | **You are looking at the product to give feedback.** |

Both serve <http://localhost:3000>.

**Use the production build for reviewing, and here is why it is not a detail.** Next's dev overlay —
the floating "N" button, bottom-left — sits *exactly* over the `MONTH` / `WEEK` toggle at 375px and
swallows the click. Under `pnpm dev` the view toggle looks broken and is not. This has cost real
debugging time more than once.

The two environment variables are both load-bearing. Without `SESSION_COOKIE_SECURE=false` the proxy
sets a `Secure` cookie, the browser refuses to store it over plain `http://`, and a **correct**
sign-in bounces you straight back to the login page — which reads as a broken session guard rather
than as a cookie that was never saved.

---

## Look at it at 375px. This is not a preference

Mobile-first is a hard constraint here, not a nicety: the product is designed at phone width and
desktop is an enhancement. **Feedback given from a maximised desktop window is feedback about a
layout nobody designed.**

In Chrome or Edge: `F12` → the device-toolbar icon (`Ctrl+Shift+M`) → set **375 × 667**, or pick
iPhone SE. Keep it there for the whole walkthrough.

---

## The walkthrough

Go in this order. Each step says what *should* happen, so "this feels wrong" can be pinned to
something specific.

1. **Sign in.** Email and password from your `.env`.
2. **First run.** With no items, the calendar explains itself instead of showing a blank grid — and
   the grid is still visible beneath the message.
3. **Capture an idea.** Tap `+ CAPTURE`, type a title, save. That is **three interactions and no
   more** — it is a measured budget, so if it feels like four, say so. Only a title is asked for; a
   platform or a date at this moment would be friction.
4. **The backlog drawer.** Your new idea is there, at the bottom. It has a collapsed peek strip and
   an expanded state. It is a drawer on the calendar, deliberately not a separate page.
5. **Month and week.** Toggle between them. The month grid is always six rows, so nothing under your
   thumb moves as you navigate. The week view is seven stacked sections, not seven columns.
6. **Navigate periods.** Arrows move a month or a week. Watch the title and the eyebrow.
7. **Read status without reading text.** Status is shape and fill — outline, half, solid with a check
   — never colour alone. **Squint at it, or take a greyscale screenshot.** If you cannot tell the
   three apart, that is a real failure, not a preference.
8. **Drag an item onto a day.** Then drag it back to the backlog. A scroll gesture that starts on an
   item must scroll, never pick it up.
9. **Open an item.** Change title, hook, platform, status, date. One save sends one request.
10. **Try to break a rule.** Move an item past `idea` with no platform — it should refuse and point
    at the control that fixes it, without you leaving the screen.
11. **Filter by platform.** Should feel instant. Filter to a platform with nothing in it — the screen
    should name the filter rather than go blank.
12. **Published link.** Paste a URL on an item, then open it from the calendar. Move the item back to
    `draft` — **the link must survive**, because the post it points at is still live.
13. **Overdue.** Schedule something in the past. It gets a dashed left border and the header counts
    it. Overdue is a condition, not a fourth status.
14. **Delete.** Item → `DELETE ITEM` → `DELETE PERMANENTLY`. Three deliberate taps, and `KEEP ITEM`
    is what `Enter` and `Escape` do.
15. **Tab through everything** with a keyboard. Every control shows a visible focus outline.
16. **Nothing may leave the screen.** No horizontal scrolling, and no control cut off at the right
    edge, on any screen or sheet.
17. **Sign out** from the header.

### Reset between runs

```bash
docker compose exec -T db psql -U creatorhub -d creatorhub -c "delete from content_item;"
```

---

## The deployed version

- Frontend: <https://creator-hub-hazel.vercel.app>
- Backend: <https://creator-hub-1dgs.onrender.com>

**The first visit of the day takes about 45 seconds, and that is known.** The request crosses two
suspended free tiers stacked — Render spins the service down and Neon auto-suspends the database.
Warm, the same page is under two seconds. Please do not report the cold start as a bug; the fix is a
paid tier or a keep-warm ping, and it is a deliberate deferral.

---

## When something looks broken

| Symptom | What it actually is |
|---|---|
| Login page hangs; nothing reaches the API | Docker daemon stopped. Start Docker Desktop, then `docker compose up -d db backend`. |
| `MONTH` / `WEEK` toggle does nothing at 375px | Next's dev overlay covering it. Use the production build. |
| Sign-in succeeds, then bounces back to `/login` | `SESSION_COOKIE_SECURE=false` missing from the `pnpm start` command. |
| Backend will not boot, complains about a setting | `JWT_SECRET` too short, or a variable set to an **empty** string — an empty value overrides a default and then fails its own constraint. |
| `pnpm typecheck` red right after switching branches | Stale generated route types. `rm -rf .next` and re-run. CI never sees this. |
| `playwright test` refuses to start (`EADDRINUSE`) | A server left over on port 3100. Kill it. |
| A panel renders transparent or unstyled | A misspelled Tailwind class. It fails **silently** — no build, lint, or test error. |

---

## Where to read more

- [`CLAUDE.md`](CLAUDE.md) — current state, decisions, and what to do next
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — the principles every change is checked against
- [`specs/001-content-calendar/`](specs/001-content-calendar/) — what Content Calendar was specified to do
- [`CHANGELOG.md`](CHANGELOG.md) — what shipped, including the one acceptance criterion that fails cold
- [`docs/retro-01.md`](docs/retro-01.md) — the first iteration's retrospective
