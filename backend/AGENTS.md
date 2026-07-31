# Backend rules and traps

Loaded only when working in `backend/`. Root-level rules still apply — this file adds what is specific
to the FastAPI/SQLModel/Alembic side, and it is the *only* place those live. Cross-cutting rules and
the project's Deferred list stay in `CLAUDE.md` and `.claude/memory.md`.

Stack is fixed for v0.1: FastAPI, Python 3.13, `uv`, SQLModel + Alembic, PostgreSQL. `uv` is the
package manager — never pip, never poetry.

---

## Do not "tidy" these three dependencies

All three look removable and all three break something non-obvious:

- **`pwdlib`, not `passlib`.** Verified at T002: `passlib` is broken on Python 3.13, and not in the
  way the well-known `bcrypt.__about__` note predicts. With `bcrypt` 5.0.0, `CryptContext(schemes=
  ["bcrypt"])` dies at first use inside passlib's own backend probe (`detect_wrap_bug`), which hashes
  an over-72-byte password expecting bcrypt to truncate: `ValueError: password cannot be longer than
  72 bytes`. passlib 1.7.4 is unmaintained, so this will not be fixed.
- **`pydantic[email]`.** Without `email-validator` the login field cannot declare `format: email`, and
  the generated OpenAPI schema stops matching `contracts/openapi.yaml`.
- **`httpx2`.** FastAPI's `TestClient` emits `StarletteDeprecationWarning` about `httpx` on every use.
  Installing `httpx2` is what makes `filterwarnings = ["error"]` possible in `pyproject.toml`.
  Removing it breaks the **entire** suite, not one test. A blanket warning ignore was rejected — it
  would also hide real FastAPI deprecations.

---

## Decisions, and why

| Decision | Why |
|---|---|
| `get_settings()` and `get_engine()` are cached functions, not module-level instances | Importing `app.config` must not be able to fail. A module-level `Settings()` turns a missing variable into an import error from whichever module happened to load first, instead of a startup error naming the variable. |
| `JWT_SECRET` has no default anywhere | An app that boots with a guessable secret is worse than one that refuses to boot. |
| `StrEnum`, not data-model.md's literal `(str, Enum)` | Identical values, but `f"{Status.IDEA}"` renders `idea` rather than `Status.IDEA`. Same schema, more readable logs. |
| `Identity()` PKs, not SQLAlchemy's default `SERIAL` | data-model.md says "identity", and identity columns avoid `SERIAL`'s separate sequence-ownership quirks. |
| CHECKs and the partial index declared in **both** the model and the migration | Not duplication for its own sake — see the Alembic trap below. |
| bcrypt's 72-byte limit handled at the boundary, in **bytes** | `hash_password` raises; `verify_password` returns `False`, because at login an over-long password is just a wrong one and a distinct error leaks the credential's shape. Counted in UTF-8 bytes — a 24-character emoji password is 96 bytes. bcrypt no longer truncates, so silently wrapping would make two different passwords open the same account. |
| One `InvalidTokenError` for absent, malformed, expired, and wrong-key | The API says 401 and nothing more. Distinguishing them tells an attacker which half of the problem to work on. |
| `presented_token` exists alongside `current_creator`, and **only logout uses it** | The contract declares 401 on `/auth/logout` while T014 requires sign-out to survive an expired token. Reconciled by requiring a credential to *exist* without requiring it to be *valid*: 401 for no credential, 204 for any credential. **A second caller of this dependency would be a security bug, not reuse** — it is unauthenticated by design. |
| Login verifies an unknown email against a throwaway hash before refusing | Otherwise an unknown email returns in microseconds and a known one costs a full bcrypt verification, and the timing answers exactly the question the shared 401 message refuses to. |
| Seed credentials live in their own `BaseSettings`, not `app.config.Settings` | Required there, the API refuses to boot on every deployment after the first. Optional there, every API process holds the plaintext password in memory. Still a settings model rather than `os.environ`, because the credentials live in `.env` and a bare environ read would not see them unless exported. |
| Re-running the seed script updates the password; a *different* email is refused | This is v0.1's only password recovery — the alternative is a reset endpoint the tech defaults forbid. A second account is refused because `content_item` has no owner column (INV-4), so two creators would silently share every item. |
| The 422 response model is declared on the `FastAPI()` constructor, not just in the handler | The handler alone fixes the runtime body while the *generated* schema still advertises FastAPI's array-shaped `HTTPValidationError` — so a client generated from the generated document would still be wrong. Verify in `openapi.json`, not by reading the handler. The cost is that `/health` advertises a 422 it can never produce; that is accepted, and `test_errors.py` pins it, because per-route declaration lets one forgotten route reintroduce the array shape. |
| **Every 4xx declares `model=ErrorResponse`**, not just a `description` | A description is for a human reading `/docs`; the generated client is built from the schema. Before T020 login's 401 declared no model and logout declared no 401 at all, so the document promised no body for the response the login form most needs. `ErrorResponse` lives in `app/schemas.py` — importing it from `app.main` would make a router import the application it is mounted on. Add both `401` and any new 4xx to every route you write, and to `REACHABLE_4XX` in `tests/test_errors.py`. |
| `GET /health` does not touch the database | Render recycles an instance whose probe fails. A probe that queries Postgres turns a momentary database blip into an outage. |
| The test database is created by `scripts/init-test-db.sql` at initdb time | The pytest harness then needs no `CREATE DATABASE` privilege and **cannot point at the dev database by accident**. |
| `tests/test_auth.py` mounts its own throwaway route to test `current_creator`, and keeps it after T030 | No shipped endpoint depends on `CurrentCreator` at T018, so there was nothing to aim FR-002's refusals at. The route goes on the **real** app — real handlers, real session override, real Postgres — and is removed after each test. Retargeting these assertions at a content-item endpoint once one exists would mean a failure no longer says whether authentication or the endpoint broke. |
| `create_access_token` truncates `now` to whole seconds | `exp` and `iat` are integer seconds. Without the truncation the returned `expires_at` carries microseconds the claim cannot, so the login body advertises an expiry a fraction of a second later than the token enforces — and that function's docstring promises the two cannot drift. |
| The harness runs `alembic upgrade head`, not `metadata.create_all` | `create_all` builds enum types and CHECK constraints from model metadata, so the migration that actually runs in production would go untested — and the `values_callable` trap below would lose the only place it could resurface. Separately, CI's `test:backend` has no migration step, so the harness is the only thing that can create the schema there. |

---

## Traps

**A SQLAlchemy enum column stores the Python member *names* by default.** `Status.IDEA` persists as
`IDEA` while the contract, the frontend, and every fixture use `idea`. Pass
`values_callable=lambda e: [m.value for m in e]`. It only surfaces on a round trip against a real
database, so an in-memory test suite would never catch it.

**An index declared only in a migration is an index Alembic will delete.** Autogenerate compares
indexes against model metadata, so the backlog partial index — written by hand into the T011 migration
and nowhere else — showed up as "removed index" on the very next `alembic check`, and the next
generated revision would have dropped it. Declare constraints and indexes in `__table_args__` *and*
the migration, and run `alembic check` after every revision. (CHECK constraints are never compared, so
they cannot drift this way; indexes can.)

**Alembic's generated `downgrade` does not drop enum types it implicitly created.** `sa.Enum(...)`
inside `create_table` emits `CREATE TYPE` on upgrade, but the generated downgrade only drops the table.
The type survives and the *second* `upgrade` fails with "type platform already exists". Invisible
unless you actually run `upgrade → downgrade base → upgrade`. Create and drop enum types explicitly
with `postgresql.ENUM(..., create_type=False)`, and run that round trip on every migration that
touches one.

**pydantic-settings matches constructor kwargs by field name, not by environment-variable name.**
`Settings(JWT_SECRET="...")` populates nothing — the field is `jwt_secret` — so a test written that way
passes for the wrong reason, and a "missing variable" assertion passes even when the variable is
present. Test settings through the real environment with `monkeypatch.setenv` and `_env_file=None`.

**A 401 from `HTTPBearer` is a 403 unless you turn `auto_error` off.** With the default
`auto_error=True`, a request with no `Authorization` header gets Starlette's own
`403 {"detail": "Not authenticated"}`, not the 401 the contract declares. `auto_error=False` plus an
explicit `HTTPException` is what makes every unauthenticated case one 401 with one body.

**FastAPI's `RequestValidationError` returns `detail` as an array, not a string.** Any contract or
generated client that types it as a string renders `[object Object]`. `app/main.py` installs the
handler that flattens it, because the API promises a uniform `{"detail": "..."}` shape.

**The pytest session fixture's `join_transaction_mode` decides whether an endpoint's own `rollback()`
destroys the test's fixtures.** All three modes are safe for the *outer* rollback that isolates tests,
so the choice looks arbitrary until an endpoint catches an `IntegrityError` and calls
`session.rollback()` itself. Under SQLAlchemy's default and under `rollback_only`, that inner rollback
unwinds past the fixture rows and the `creator` disappears mid-test; only **`create_savepoint`** unwinds
to the savepoint and leaves them. This is exactly the 409 path T030 and T046 must test, and the failure
presents as application logic being wrong rather than as a fixture problem. Set in `tests/conftest.py`
— do not "simplify" it away.

**A long-lived test database accumulates committed rows, and the symptom looks like broken rollback.**
`creatorhub_test` is created once at initdb and never dropped, so a `creator` row committed by a
throwaway verification script survived into the next task and made an isolation test fail as though the
transactional fixture did not work. The harness truncates both tables once per session, behind a guard
that refuses any `TEST_DATABASE_URL` whose name does not end in `_test`. Any harness talking to a
persistent database needs both halves — the clean-up *and* the guard, because the clean-up is what makes
pointing at the wrong database catastrophic.

**Proving a test works by breaking the code only proves something if you broke *only* that.** T020's
first verification patch spliced the source with `s[:start] + ")"`, silently discarding the exception
handler, the CORS middleware, the routers, and `/health` along with the block it meant to remove. 18
tests went red and the conclusion drawn from them would have been wrong. Assert the app is still
assembled — or diff the patched file — before believing a red run.

**A test that asserts an absence passes trivially when it is broken.** `tests/test_schema.py` exists
to prove `content_item` has no owner column, no foreign key, and no third table beside it — and every
one of those assertions is green against a schema, against an empty database, and against a typo in
the table name. Green is not evidence. Before trusting one, make it fail: `ALTER TABLE ... ADD COLUMN
creator_id` inside a transaction you roll back. That is how T019 was verified, and it is the only
reason its results mean anything. The same applies to any future `assert not ...` about the schema.

**A forbidden-name pattern list does not know this project's nouns.** T019 was specified as
`%user%`, `%owner%`, `%tenant%`, `%version%` — generic multi-tenancy vocabulary, none of which
matches `creator_id`. The owner entity here is `creator`, so the single column this codebase would
plausibly grow was the one the guard could not see. `data-model.md` INV-4 was amended, and the
exact-column allowlist alongside it is what makes the guard exhaustive rather than merely plausible.
Note also that the matches are substrings with no word boundary: `updated_at` contains `date`.

**The Windows console is cp1252, so an em dash in printed output renders as `?`.** Only bites strings
that reach a terminal — `print` in `app/scripts/`, not docstrings or comments. A correct error message
that renders as `bcrypt accepts at most 72 ? note that this counts bytes` reads as a broken tool. Keep
script output ASCII.

---

## Commands

```bash
uv sync
uv run alembic upgrade head                 # applies 9483af05dd5b
uv run alembic check                        # must say "No new upgrade operations detected"
uv run pytest                               # needs docker compose up -d db
uv run pytest tests/test_auth.py::test_login_success
uv run ruff check . && uv run ruff format --check . && uv run mypy .

uv run uvicorn app.main:app --reload        # http://localhost:8000/docs
uv run python -m app.scripts.seed_user      # needs SEED_CREATOR_EMAIL and SEED_CREATOR_PASSWORD
```

The suite needs Postgres up (`docker compose up -d db` from the repo root). The harness migrates
`creatorhub_test` itself; `alembic upgrade head` above is for the dev database `creatorhub`.
