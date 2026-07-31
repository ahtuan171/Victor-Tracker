# Build log

What happened at each stage and task, in order. **Not loaded into context** — `CLAUDE.md` links here
instead of importing it, because this is a record, not a rule.

**Read it when** you need to know *why* something was done at a specific task, whether a thing was
verified or only assumed, or what a checkpoint actually proved. **Do not read it** to find out the
current state (that is `CLAUDE.md`), the rules (`.claude/rules/`), or a trap you must avoid
(`.claude/memory.md` — every trap below is duplicated there on purpose, because traps must be in
context and narrative need not be).

---

## Stage 1 — plan

1. Ran the full stage-1 chain: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
   `/speckit-tasks` → `/speckit-analyze`, from the hand-written draft.
2. Answered 8 clarification questions across two rounds (3 on entity/pipeline shape during specify,
   5 on security, interaction, and state transitions during clarify).
3. Ran the **`reviewer` agent** on the finished artifacts. It found **six blocking design gaps**;
   all six are now closed. Commit `62e67b8` has the full list.
4. Answered 3 design questions the review exposed — backlog placement, status-drag, data fetching —
   and applied the consequences across all seven artifacts.

**The lesson worth keeping**: `/speckit-analyze` reported **95% requirement coverage** on the version
of `tasks.md` that still contained all six blockers, including one that left every content item
permanently stuck in `idea`. Coverage checks whether a requirement is *cited* by a task, not whether
the tasks *compose into something that works*. Run both `/speckit-analyze` and the `reviewer` agent —
they catch different classes of defect.

---

## Phase 1 — T001–T007, setup

1. **Fast-forwarded `main` to `001-content-calendar`** so the specs are the source of truth
   everything downstream can reference. This was the open question the previous session deliberately
   left; the reasoning is in `CLAUDE.md`'s decisions table and in `.claude/memory.md`.
2. Built T001–T007, one branch per task (`feature/001-<slug>`), each merged `--no-ff` into `main`.
   Seven merge commits, so the history already has the shape a real MR flow will produce.
3. Ticked T001–T007 in `tasks.md` and recorded the checkpoint result there, including the part that
   could not be verified.

**Verified green**: `uv sync`, `uv run pytest`, `ruff check`, `ruff format --check`, `mypy` (strict),
`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm exec playwright test` (1 passed at 375×667).

**Also verified**: `docker compose up -d db`. Postgres 17.10 comes up healthy,
`scripts/init-test-db.sql` creates `creatorhub_test`, and both databases are reachable from the host
over `psycopg` on 5432.

**Not verified at the time**: the `backend` and `frontend` compose services. `backend` was closed at
T016; `frontend` still needs a real `frontend/app/page.tsx` (T026).

---

## Phase 2 backend — T008–T016

Backend foundation, one branch per task, same `--no-ff` flow.

- **T008** `app/config.py` — pydantic-settings, `get_settings()` cached. Tests cover the refusals.
- **T009** `app/db.py` — lazy engine, `SessionDep`, the single seam T017 overrides.
- **T010** `app/models.py` — `Creator`, `ContentItem`, `Status`, `Platform`, `STATUS_ORDER`.
- **T011** `alembic/versions/20260730_9483af05dd5b_*.py` — applied, round-tripped, `alembic check`
  clean.
- **T012** `app/auth.py` — hash/verify, issue/decode, `is_past_half_life`.
- **T013** `app/auth.py` — `current_creator` + `CurrentCreator`, attaching `X-Access-Token` past
  half-life. Also `presented_token`, the lenient dependency **only logout may use**.
- **T014** `app/api/auth.py` — login and logout, `normalise_email`, a timing equaliser so an unknown
  email costs the same as a wrong password.
- **T015** `app/scripts/seed_user.py` — creates the one account, updates its password on re-run,
  refuses a second address.
- **T016** `app/main.py` — the `RequestValidationError` flattener, CORS, `GET /health`.

**Verified against `creatorhub_test`** with a throwaway script: 32 checks, all passing — the flattened
error shape (including through the real uvicorn server, not just `TestClient`), login and its 401
paths, all five `current_creator` refusals, sliding reissue in both directions including that a
reissued token works and does not immediately re-reissue, and logout from valid, expired, garbage,
and absent credentials. The generated `openapi.json` was checked for 422 shape and `format: email`
rather than assumed to match the contract.

**That script has since been deleted.** Its assertion list is the specification for T018, and the
four easiest to forget are restated in `CLAUDE.md`'s next-steps section.

**Verified against the live database**: schema matches data-model.md column for column — named
`platform` and `status` enum types, `TIMESTAMPTZ`, `DATE`, identity PKs, the three indexes. Both
CHECK constraints were exercised by hand and refuse what they should: advancing to `draft` with no
platform (FR-009), clearing the platform of a `draft` (FR-009a), and a whitespace-only title
(FR-005).

**Learned the hard way in this batch**, all now traps in `.claude/memory.md`:

1. `HTTPBearer` with the default `auto_error=True` returns **403**, not the contract's 401.
2. `TestClient` warns that `httpx` is deprecated in favour of `httpx2` — resolved at T017.
3. The Windows console is cp1252, so an em dash in a script's printed output becomes `?`.
4. **`alembic check` is a required step, not a nicety.** The backlog partial index lived only in the
   migration, so metadata and database disagreed and the *next* autogenerated revision would have
   dropped it silently.
5. **The enum downgrade asymmetry only shows up on the second upgrade.** Verified by actually running
   `upgrade → downgrade base → upgrade`.
6. **pydantic-settings matches constructor kwargs by field name, not by env-var name.** A test passing
   `Settings(JWT_SECRET=...)` populates nothing and passes for the wrong reason.

---

## T017 — the pytest harness

`backend/tests/conftest.py`: dedicated test database via `TEST_DATABASE_URL`, transactional rollback,
anonymous client, authenticated client. 33 passing; `ruff`, `ruff format`, `mypy --strict`, and
`alembic check` all clean. `test_placeholder.py` deleted. The full result note is in `tasks.md` under
T017. Three things worth not rediscovering, all also in `.claude/memory.md`:

- **The schema is created by `alembic upgrade head`, not `metadata.create_all`**, and it was verified
  against a genuinely empty database (`drop schema public cascade`, then `pytest`). CI's `test:backend`
  job runs `uv run pytest` with **no migration step of its own**, so a harness that assumed a
  pre-existing schema would pass locally — where `creatorhub_test` was migrated by hand at T011 — and
  fail on the first pipeline with what looks like a fixture bug.
- **`join_transaction_mode="create_savepoint"` is load-bearing**, and not for the reason it appears to
  be. All three modes survive the outer rollback; they differ when an endpoint catches an
  `IntegrityError` and calls `session.rollback()`. Only `create_savepoint` leaves fixture rows intact.
  That is exactly the T030 and T046 409 path.
- **The long-lived test database had leftovers** — a `creator` row committed by T016's throwaway
  script, surfacing as an isolation test that failed as if rollback were broken. The harness now empties
  both tables once per session, behind a guard refusing any `TEST_DATABASE_URL` not named `*_test`.

Also settled: the `starlette.testclient` deprecation is fixed by installing **`httpx2`**, not by
filtering the warning — which is what made `filterwarnings = ["error"]` possible in `pyproject.toml`.

---

## T018 — the auth tests — 2026-07-31

`backend/tests/test_auth.py`, 27 tests, suite at **60 passing**; `ruff`, `ruff format`,
`mypy --strict`, `alembic check` clean. This is the first HTTP-level coverage the project has: T013–T016
had been verified once by hand and then had their verification script deleted.

- **A probe route was necessary, and it is not a shortcut.** Every FR-002 refusal lives in
  `current_creator`, and no shipped endpoint depends on it at T018 — `/health` and `/auth/login` are
  public, `/auth/logout` uses `presented_token` on purpose, content-items arrive at T030. The file
  mounts one throwaway route on the *real* app (real handlers, real session override, real Postgres)
  and strips it afterwards, invalidating the cached OpenAPI schema so it cannot leak into T020.
  The temptation at T030 will be to retarget these assertions at a content-item endpoint; that trades
  a precise failure signal for a vague one.
- **One real defect, found by the test rather than by review.** `create_access_token` returned
  `expires_at` with microseconds while `exp` is integer seconds, so the login body promised an expiry
  ~0.2s later than the token enforced. Sub-second and harmless in effect — but the function's own
  docstring claimed the two values *cannot* drift, and the alternative was writing a test that
  tolerated the gap. Fixed at the source: `now` is truncated to whole seconds. Only application change
  in the task.
- **The refusal cases are parametrized into one test on purpose.** Malformed, empty, expired,
  wrong-key, unknown-creator, and non-integer-`sub` assert an *identical* body, not merely six 401s.
  FR-002 wants them indistinguishable, and six separately written string literals is exactly how that
  property erodes without a test noticing. The same test asserts no `X-Access-Token` on any refusal —
  a `current_creator` that minted the header before checking the creator existed would hand a fresh
  thirty-day token to a request it then refused.
- **Logout's asymmetry is covered from both sides**: 204 for expired, malformed, and wrong-key
  credentials; 401 for no credential at all. That asymmetry is the entire reason `presented_token`
  exists, and it is the part most likely to be "simplified" into `CurrentCreator` by someone who has
  not read why.

---

## T019 — the schema-absence tests — 2026-07-31

`backend/tests/test_schema.py`, 15 tests, suite at **75 passing**; the whole gate clean.

- **The task's own pattern list had a hole, and the spec was amended rather than the test quietly
  widened.** T019 specifies `%user%`, `%owner%`, `%tenant%`, `%version%`. None match `creator_id` —
  and `creator` is what the owner entity is called here, so the one column this project would
  actually add was invisible to the guard meant to stop it. `data-model.md`'s INV-4 now lists
  `%creator%` and states the no-foreign-key assertion it previously only implied in prose. The
  general lesson: a pattern list copied from generic multi-tenancy vocabulary does not know your
  domain's nouns.
- **Absence tests pass trivially when broken**, which is the whole difficulty of this task. Green
  means nothing until you have seen red. Verified by `ALTER TABLE content_item ADD COLUMN creator_id
  INTEGER REFERENCES creator(id)` and `CREATE TABLE organization` inside a rolled-back transaction:
  all four guards fired, and the schema was intact afterwards. Do this again for any future test
  whose assertion is `not X`.
- **Two layers, deliberately overlapping.** The parametrized pattern tests name the broken rule and
  its requirement in the failure message; the allowlist test asserts the exact nine columns and
  catches anything at all. Precise-but-partial plus exhaustive-but-mute. Dropping either leaves a
  real gap, and they look redundant to anyone who has not read this.
- **A meta-test guards the matching itself** — running the same filter with `"date"`, which must hit.
  It also documents that these are substring matches with no word boundaries: `updated_at` contains
  "date" inside "updated", which is why every one of the ten patterns was checked against the nine
  real column names before being committed.

---

## T020 — the error-shape tests — 2026-07-31

`backend/tests/test_errors.py`, 21 tests, suite at **96 passing**. Completes Phase 2's backend half.

- **The task text describes one half of a two-half promise.** "Every 4xx body matches
  `{"detail": "<string>"}`" is true of the runtime body *and* of the generated document, and the two
  fail independently: the flattener in `main.py` fixes the first and does nothing for the second. A
  client is built from the document, so testing only the runtime body would have left the half that
  actually reaches the frontend unchecked.
- **Which is not hypothetical — the document was wrong.** `POST /auth/login` declared its 401 with a
  description and no model; `POST /auth/logout` declared no 401 at all. The generated document
  therefore promised *no body* for the response the login form most needs to render. Fixed by
  declaring `ErrorResponse` on both, which meant lifting it out of `main.py` into a new
  `app/schemas.py` — a router importing `main` would be circular. Done now rather than at T030 so the
  six content-item routes inherit the correct pattern rather than copying the broken one.
- **`/health` advertises a 422 it cannot produce, and that stays.** It is a side effect of declaring
  the 422 model on the `FastAPI()` constructor, which is what keeps `HTTPValidationError` out of the
  components entirely. Per-route declaration would let one forgotten route reintroduce the array
  shape. An impossible response is a smaller lie than a wrong one; a test pins the trade-off so
  nobody "tidies" it.
- **Verified by breaking each guarantee separately, and the failure sets are disjoint** — which is
  the actual evidence that both halves are tested rather than one being asserted twice. Removing the
  flattener failed only runtime tests; removing the global 422 declaration failed only document
  tests; removing login's 401 model failed only the two "a declared 4xx carries a schema" tests.
- **The first attempt at that verification was itself buggy** and worth recording: the patch script
  spliced `s[:start] + ")"`, which discarded everything after the `responses=` block — handler,
  CORS, routers, `/health` — so 18 tests failed for a reason that had nothing to do with the thing
  under test. A "breaking it makes tests fail" check proves nothing unless you also confirm you broke
  only what you meant to. The rerun asserts the app is still assembled before drawing a conclusion.

---

## Stage 2 and stage 3 groundwork — 2026-07-30

A check of the standing claim that *"stage 2 (Design) and stage 3 (Load) run in parallel with Phase 2"*.
**The claim is correct** — verified against `research.md` Open items, `quickstart.md` Outstanding setup,
and the note at the bottom of `tasks.md`; no task from T018 to T070 needs a git remote or a design
export. But "does not block implementation" was hiding a cost that grows, so:

- **`glab` 1.110.0 installed.** Not in `Program Files` — path is in `CLAUDE.local.md`. Not authenticated.
- **Claude Design project created** — `CreatorHub Design System`, through `DesignSync create_project`
  rather than by hand, because project type is immutable at creation. It is empty.
- **`design/content-calendar/BRIEF.md` written** — the constraints the export must respect, the exact
  surface list, and the data-shape audit checklist, derived from `data-model.md`'s "Not present" table.
- **The constitution VI exception was restated** in `.claude/memory.md`, because it had drifted from
  covering one spec fast-forward to covering every merge since, and T076 now records the range rather
  than only the fast-forward.
- **A CI gap was found and written into T017's task text**: `test:backend` never migrates its database.

**Both stages are blocked on account/human work, not on code**: a GitLab account, and the design work
itself. Neither blocks T018.

### The split that produced this file

`CLAUDE.md` plus its five imports were ~55K characters — about 13.7K tokens on **every** session start,
and growing with each task. The narrative above was the bulk of it and the least load-bearing part: a
future session needs to *avoid* the traps, not read the story of finding them, and every trap here is
also in `.claude/memory.md`, which stays imported.

So the rule going forward: **traps and decisions stay in context; chronology comes here.** When you
finish a task, add its narrative to this file and put only the durable rule in `.claude/memory.md`.

---

## T021 — the proxy allowlist — 2026-07-31

First frontend feature code in the project. `lib/proxy-allowlist.ts` plus
`tests/contract/proxy-allowlist.spec.ts`.

**The design decision that matters is `NOT_PROXIED`.** R-008 says the allowlist is "derived from the
contract", and the obvious reading — enumerate every operation `openapi.yaml` declares — produces a
list that gates nothing: it is the contract, restated. The moment a later module adds an endpoint to a
contract, a mirror-shaped allowlist either drifts silently or gets regenerated and exposes it. So the
sync test demands that every contract operation be **either** in `PROXY_ALLOWLIST` **or** in
`NOT_PROXIED` with a written reason, with no third option. That turns adding an endpoint into a
decision someone has to make, which is the whole of what principle II asks for here. `/health` is the
only exclusion today.

**Both directions of the sync are asserted, and both were mutation-checked** before the branch merged:
adding `/growth-metrics` to the allowlist failed "invents nothing the contract does not declare", and
dropping `GET /content-items` failed "either proxied or explicitly excluded". A sync test that only
runs one direction passes happily while the allowlist grows past the contract.

**Path parameters are matched against the contract's declared type, not against "any segment".**
`item_id` is `type: integer`, so `PARAM_PATTERNS.item_id` is `/^[0-9]+$/`. That is faithful to the
contract *and* it is what makes traversal structurally unreachable — every other segment is compared to
a literal, so there is no string path to re-parse and no `..` that can match anything. `compile()`
throws at import for a parameter with no pattern rather than defaulting to permissive.

**Test placement.** `tech-defaults.md` allows Playwright and forbids Jest/RTL, and this is not a
component test, so it runs under Playwright's runner as a second project (`contract`), with
`testDir` moved per-project. The alternative — a separate config file — would not have run in CI,
because `test:e2e` invokes `playwright test` with no `--project` filter. Accepted cost: the global
`webServer` boots Next even for a contract-only run.

**Added `yaml` 2.9.0 as a devDependency.** The test parses the contract properly rather than
regex-scraping it; a fragile reader is the one thing that would make this test lie. `js-yaml` was
present transitively only, which pnpm's strict layout correctly refuses to expose.

Green: `pnpm typecheck`, `pnpm lint`, 13 Playwright tests (12 contract + the 375px viewport check).

---

## T022 — the proxy — 2026-07-31

`app/api/[...path]/route.ts` plus `lib/session.ts`, and 25 tests in a third Playwright project.

**Two responsibilities were added beyond the task text, both because nothing else can do them.**

- **Login's token is captured out of the response body.** The task text says "attach the token from
  the session cookie", which presumes a cookie already exists. Nothing in T021–T028 said who creates
  it, and T025's "setting the session cookie through the proxy" assigns the *page*, not the mechanism.
  Left alone, the proxy would have forwarded `POST /auth/login`'s 200 body — containing
  `access_token` — to browser JavaScript, which is precisely the thing R-001 exists to prevent
  ("JavaScript cannot read the token"). So the proxy moves it into the cookie and returns
  `{expires_at}` alone. This is not a contract violation: `openapi.yaml`'s `servers` are the FastAPI
  origins, and this response comes from Vercel.
- **The cookie is cleared on any 401.** T024 is specified as "clears the session cookie and redirects
  to /login" *in `lib/api.ts`* — but `lib/api.ts` runs in the browser and an httpOnly cookie is
  unreachable from there. Either the proxy does it or T024 invents an endpoint whose only job is to
  delete a cookie. The proxy does it; T024 is now just the redirect.

**`Max-Age` is read from the token's own `exp`.** The obvious implementation is a 30-day constant, but
that is a second copy of the backend's `TOKEN_TTL_DAYS` living in a different deployment with nothing
to notice when the two drift. Decoding `exp` makes cookie and token expire together by construction.
The signature is deliberately not verified — the value decides a cookie lifetime, the backend remains
the only authority on validity, and verifying would mean shipping the signing secret to Vercel to
learn a number we already trust the browser to forget. It also sidesteps the eslint `new Date` ban,
since `exp` is a number and `expires_at` is a string that would have needed `lib/dates.ts` (T028).

**The response is rebuilt, not forwarded.** Only status and `content-type` are copied. Stripping
`X-Access-Token` then needs no code, and `content-encoding`/`content-length` cannot survive to
describe a body `fetch` already decoded. An early draft read the login body twice — once in `relay`
and once in `applyCookie` via `.clone()` — which only works if the clone is taken before the first
read; the token now travels back beside the response instead.

**Smoke-tested against the real FastAPI**, not only the stub, because the stub can agree with a wrong
idea of what the backend sends:

| Through the proxy | Result |
|---|---|
| `GET /api/health` | 404, and **it never appears in the backend access log** — R-008's gate holds |
| `POST /api/auth/login`, wrong password | 401 `{"detail": ...}` passed through, cookie cleared |
| `POST /api/auth/login`, correct | 200 `{"expires_at": ...}`, **no `access_token` in the body**, `Set-Cookie: ch_session=…; Max-Age=2591999; HttpOnly; SameSite=lax` |
| `POST /api/auth/logout` with cookie | 204 — which proves the bearer attach, since T014 needs a credential |
| `POST /api/auth/logout` without | 401, cookie cleared anyway |
| `GET /api/content-items` | forwarded; 404 from FastAPI because T030 has not built it |

**Found while doing it: no creator account has ever been seeded on this machine.** `.env` sets
`SEED_CREATOR_EMAIL=creator@creatorhub.local`, and `email-validator` refuses `.local` as a
special-use reserved TLD, so the seed script has never succeeded. The smoke test used a throwaway
`smoke@example.com` account, deleted afterwards — `creator` is empty again, so a future seed with a
corrected address will not hit the "a different email is refused" branch.

Green: `pnpm typecheck`, `pnpm lint`, 38 Playwright tests across three projects.
