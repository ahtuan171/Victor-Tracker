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

---

## T023 — the typed API client (2026-07-31)

`frontend/lib/api.ts`, plus a fourth Playwright project. Green: `pnpm typecheck`, `pnpm lint`,
**58 tests across four projects** (was 38 across three).

**"Generate the typed API client" was carried out by hand, deliberately.** No OpenAPI codegen is
installed and the task line reads as if one were. Adding one would mean a generator, a config, a
generated-file convention, and a CI step to prove the checked-in output is current — against a
contract of eight operations and four schemas. R-007 asks for "plain `useState` plus a typed fetch
wrapper", and a generated SDK is not that. The debt this takes on is drift between the contract and
the client, so `tests/contract/api-types.spec.ts` reads `openapi.yaml` off disk and asserts the three
closed enums still match. Object shapes are left to `tsc --noEmit` in the same CI stage — a
TypeScript interface has no runtime representation to compare, and the enums are the part that would
otherwise accept an unknown value silently at runtime.

**Only four operations exist here.** GET-one, PATCH, and DELETE are absent, not forgotten: the task
scopes the client to login, logout, list, and create, and `workflow.md` forbids abstraction before a
second caller. They arrive with T033/T052/T056.

**The contract does not require the four nullable fields on `ContentItem`.** Its `required` list is
`[id, title, status, created_at, updated_at]`, so a conforming response may omit `hook`, `platform`,
`scheduled_date`, and `published_url` rather than send null. Three options were on the table:

1. Type them `hook?: string | null` — faithful, and puts a `?? null` on every read site in the
   calendar grid, the day cell, the drawer, and the item sheet.
2. Amend the contract to require them — a spec change to make the frontend's life easier, for a
   reading of JSON Schema that is not actually wrong.
3. Declare them present-and-nullable and make that true at the boundary.

Took 3. `toContentItem` fills absent with `null` and is explicitly **not** a validator — the backend
is the only writer of these rows and is tested against the same contract. Its whole job is stopping
`undefined` reaching a component typed for `null`.

**`logout()` swallows a 401, and nothing else does.** The proxy clears the cookie on any 401, so by
the time the client sees one the credential is already gone — which is the state logout is trying to
reach. Throwing would leave the UI believing it is signed in with no session behind it, and the Phase
2 checkpoint specifically requires sign-out to work from an expired session. Every other status still
throws.

**One `fetch`, on purpose.** All four operations route through a private `request()`, so there is
exactly one `if (!response.ok)` branch — which is the seam T024 needs. Two fetch paths would mean two
places to add a 401 redirect and one of them getting missed.

**A network failure becomes `ApiError(0, …)` rather than a raw `TypeError`.** Otherwise every surface
writes two catch arms, one for HTTP failures and one for the offline case, and the second one gets
forgotten. `status: 0` is the "no HTTP response happened" marker.

Two smaller things found while building:

- `expect(...).toEqual<ContentItem>({...})` does not compile — Playwright's `toEqual` takes no type
  argument, unlike Vitest's. The type assertion was kept by annotating the expected value instead.
- The relative URL in `request()` makes the module unrunnable outside a browser: Node cannot resolve
  `/api/content-items` without an origin. That is the right shape (R-007 puts content reads in client
  components) but it is why `tests/client/` stubs `globalThis.fetch` rather than letting a real one
  run. The stub replaces a worker global, so the project is pinned to `workers: 1` like `proxy`.

---

## T024 — the single 401 handler (2026-07-31)

One branch inside `request()` in `frontend/lib/api.ts`. Green: `pnpm typecheck`, `pnpm lint`,
**65 tests across four projects**.

**The T022 amendment held.** T024's original wording had it clearing the session cookie; an
`httpOnly` cookie is unreachable from browser JavaScript by design, so the proxy does that on every
401 and this task kept only the redirect. No cookie write was added here — one would have been a
no-op that reads like a safeguard.

**Two exemptions the task line does not mention, and the handler is wrong without them.**

- `POST /auth/login` — a 401 is a wrong password, not a dead session. Redirecting would reload
  `/login` and throw away the message the form exists to render. Found by asking what T025's error
  state would actually do, not by a test failing.
- `POST /auth/logout` — a 401 means the session was already over, which is where logout was going.
  `logout()` already swallows it and resolves; letting the redirect fire too would preempt the
  caller's own navigation with a second one to the same place.

A third guard skips the redirect when `location.pathname` is already `/login`.

**Full navigation, not a router push.** `window.location.replace(LOGIN_PATH)`. The T027 guard is a
server component and App Router layouts are not re-executed on soft navigations, so a client-side
push could reach `/login` without the server ever re-reading the cookie — the guard would be
bypassed by the very thing meant to trigger it. `lib/api.ts` is not a React module, so there is no
router available anyway. `replace` over `assign` so the page that just 401'd is not in history,
where going back would 401 and bounce straight back.

**The error is still thrown after the redirect is queued.** Navigation is not instantaneous, so a
caller that swallowed the error would keep rendering content for a beat — which is the FR-002
violation this exists to prevent, just briefer.

**Testing it needed a fake `window`.** The handler guards on `typeof window === "undefined"` so it
is inert on the server and in the Playwright runner, which also makes it invisible to a test that
does nothing. `tests/client/` defines the two members it touches — `location.pathname` and
`location.replace` — and deletes the global in `afterEach`, since a leftover `window` would give the
next file a wrong answer to "am I in a browser".

**Considered and not built: preserving the intended destination as `?next=`.** Better UX, and
nothing in `spec.md` asks for it — non-negotiable 3. Cheap to add later at the same one call site.

One test was written and then deleted rather than committed: an assertion that the client never
touches `document.cookie`, which as written only proved `document` is undefined in the runner. A
vacuous test is worse than none; the rule lives in the code comment and `frontend/AGENTS.md`.

---

## The first pipeline that actually ran (2026-07-31, after T024)

Worth recording because two conclusions written earlier the same session were wrong.

**Pipeline #1 was not a broken runner.** It failed with zero jobs created and `yaml_errors: null`,
which was read as "no runner accepted the job" — plausibly GitLab.com's shared-runner account
validation. The T023–T024 push then produced **pipeline #2 with all 10 jobs created and executing**.
A zero-job pipeline at project creation is a one-off. **One failed pipeline is not evidence that CI
does not work; push again before diagnosing a runner.**

**Pipeline #2 was red, and the cause was real.** `build:backend` passed; `build:frontend` failed and
the other eight jobs skipped, so the merge gate has still never evaluated a test. The failure was
`ERR_PNPM_IGNORED_BUILDS` on `sharp` and `unrs-resolver`: pnpm 10 will not run a dependency's install
scripts unless `package.json` names it under `pnpm.onlyBuiltDependencies`, and non-interactively that
is exit code 1 rather than a warning.

This is the CI-only failure class in its purest form — it cannot reproduce locally, because pnpm
caches the approval in its own state outside the checkout, so `pnpm install` here had been silently
succeeding on an approval that exists on this machine and nowhere else. Fixed by listing both
packages, which is the mechanism that makes the two environments agree. Both are load-bearing:
`sharp` is Next's image optimiser, `unrs-resolver` is `eslint-config-next`'s module resolver.

Still unknown after this: whether `test:backend` survives an empty Postgres service container. The
job runs `uv run pytest` with no `alembic upgrade head` and the T017 harness is supposed to migrate
the schema itself — that compensation has never been exercised, because no pipeline has reached the
test stage yet. It is the next thing to watch, and the standing warning against adding a migration
step to CI still applies (see `.claude/memory.md`).

### The pnpm fix took two attempts, and the first one was wrong

`pnpm.onlyBuiltDependencies` in `package.json` — the documented answer for pnpm 10 — is **ignored by
pnpm 11**, which reads install settings from `pnpm-workspace.yaml`. Pipeline #3 failed identically to
#2 with that change in place.

The real cause was already sitting in the repo: `frontend/pnpm-workspace.yaml`, written by pnpm
itself at some earlier install, containing a placeholder it expects a human to fill —

```yaml
allowBuilds:
  sharp: set this to true or false
ignoredBuiltDependencies: [sharp, unrs-resolver]
```

That is not a default awaiting a decision; `ignoredBuiltDependencies` is a refusal, and the file
reads like configuration that has already been done. Corrected to `sharp: true` /
`unrs-resolver: true` with the ignore list removed.

**Neither attempt could be judged locally.** `pnpm install --frozen-lockfile` exits 0 here in both
states, because the approval is cached in pnpm's own state directory outside the checkout — the same
property that made the original failure CI-only. The only real verification is the pipeline.

### Pipeline #4: the frontend gate went green, the backend one failed on its own config

`build:frontend` passed, and **`test:e2e` passed — all 65 Playwright tests, in CI, against the
production bundle**. That is the first time any test in this project has been a merge gate rather
than a local claim.

`test:backend` failed, and **not** on the migration hazard everyone was watching for. The job's own
`JWT_SECRET` was `"ci-only-not-a-real-secret"` — 25 characters, against the 32-character minimum
`Settings.jwt_secret` enforces. `app.main` therefore failed to import, `conftest.py` died at
collection, and all 96 tests errored before a single query ran.

Worth noting how that survived: the value has sat in `.gitlab-ci.yml` since Phase 1 and was
"verified" only as parseable YAML with all ten jobs resolving. Neither check can evaluate a variable
against a validator in application code. Padded to 41 characters.

**The migration question is still open.** `test:backend` has still never reached a database, so
whether the T017 harness migrates an empty service container on its own remains unexercised. The
standing warning against adding `alembic upgrade head` to CI without reading the harness first still
applies.

### Pipeline #5: green, and what the three red ones actually taught

All 8 non-manual jobs pass — `build:backend`, `build:frontend`, `test:backend` (96), `test:e2e` (65),
`review:ruff`, `review:mypy`, `review:eslint`, `review:tsc` — with both deploys sitting `manual` as
designed. The merge gate exists for real now.

**None of the three failures was in application code.** A pnpm approval file pnpm itself generated as
a placeholder; the correct fix applied to the wrong file, because `package.json` is where pnpm 10
reads that setting and pnpm 11 reads `pnpm-workspace.yaml`; and a `JWT_SECRET` seven characters short
of the minimum `Settings` enforces. Every one had been "verified" as parseable YAML with all ten jobs
resolving, and every one had never run. **Parseable is not verified** — the check that matters is
execution, and Phase 1 could not have caught any of these.

**The migration hazard is closed by evidence.** `test:backend` passed against an empty
`postgres:17-alpine` service container with no `alembic upgrade head` anywhere in the job, so the
T017 harness really does migrate the schema itself. It has moved from a prediction to a verified
property — and the rule it protects is unchanged: do not add a migration step to CI.

---

## T025–T028: Phase 2 closes, and the gate becomes real

The four remaining Phase 2 tasks, all frontend. What makes them different from T001–T024 is not the
code — it is that **they are the first tasks in this project's history to pass through a gate that
could have stopped them.**

### The gate, closed before the first line of T025

`only_allow_merge_if_pipeline_succeeds` was set to `true` and `main`'s allowed-to-push dropped from
Maintainers to **no one**. Both were then read back from the GitLab API rather than believed:
`push_access_levels[0].access_level` is `0` ("No one"), and the project flag is `true`. That check
cost one command and is the same discipline the three red pipelines taught — a setting someone says
is on is not a setting that is on.

So **T025 is the task number where the constitution VI exception ends.** MRs !1 through !4, one per
task, each merged only after a green pipeline. The exception still covers everything from the
stage-1 fast-forward through T024, and `T076` records that range rather than the single act.

### T025 — the login page

A server `page.tsx` exporting metadata plus a `"use client"` form. Splitting them is not ceremony:
it keeps the route's own file on the server, where it cannot reach `lib/session.ts`.

Three behaviours all follow from T022–T024 and read as omissions without the reason, which is why
they are commented where they live: success **stores nothing** (the cookie was set by the proxy on
that same response, and it is httpOnly); the form **renders `ApiError.detail` itself** (because
`lib/api.ts` deliberately exempts `/auth/login` from the 401 redirect); and navigation is
**`window.location.replace`, not `router.push`** (Next's Router Cache can replay a previously
fetched `/calendar` payload, and on the "deep link → bounced to /login → sign in" path that payload
*is* the redirect back to login — a soft navigation would bounce a correct sign-in straight back to
the form).

Mobile-first got assertions rather than a code review: the button must sit below the viewport
midpoint, both fields must clear 44px, and the body must not scroll horizontally at 375px. That
third one exposed something worth knowing — **every shadcn size variant is desktop-scaled**, `lg` is
36px and the default input is 32px, so every tap target in this app needs an explicit height
override. It is now in `frontend/AGENTS.md`.

### T026 — the root route, and a trap that runs backwards

`app/page.tsx` stops being the create-next-app scaffold and becomes a server-side redirect. The
cookie's presence is a **routing hint, not an authorisation decision**: the signing secret never
leaves Render, so this side cannot tell a live token from a dead one, and it does not need to — a
stale cookie costs one redirect and renders no content.

One test was written, failed, and was worth the detour. It asserted the redirect response carried no
HTML body. **Next's dev server answers a redirect with a full HTML debug page; `next start` answers
with an empty one.** CI runs the production server and local runs `pnpm dev`, so that assertion was
green in CI and red on every developer machine — this project's "verified locally, red in CI" trap
running exactly backwards. The assertion is now on status and `Location`, which agree in both.

### T027 — the seam, closed three ways instead of noted

A route group's layout does not execute when no page exists inside the group, and nothing lives in
`(app)` until T033. Written naively the guard would ship unexercisable. The approach was decided
before any code:

1. **Extract the decision.** `hasSessionCookie()` moved into `lib/session.ts` as a pure predicate
   with its own unit tests, so the part that can be silently wrong is covered continuously. T026's
   page now calls it too — which removed the duplication that task had just introduced — and T033's
   re-assert is the third caller, so this is not abstraction ahead of one.
2. **Write the e2e tests and skip them.** Fully written, `test.describe.skip`, `GUARDED_PATH`
   already `/calendar`. T033 deletes four characters.
3. **Prove the wiring once.** A throwaway page went into `(app)`, the tests ran un-skipped, the page
   was removed.

**Step 3 paid for itself immediately, twice.** The probe was first named `__probe` — App Router
treats a leading underscore as a *private folder* and excludes it from routing, so it 404'd and the
layout never ran. And the "reaches the page" test **passed anyway**, because a 404 leaves the browser
at the address it asked for. That test now asserts a `200` as well. A path-only assertion would have
shipped into T033 as a test incapable of failing, and nothing else in the suite would have noticed.

That is the argument for one-time evidence over a written note, recorded here because
`tests/e2e/session-guard.spec.ts` points at this section for exactly that reason.

### T028 — dates, tested in two timezones

`lib/dates.ts`, the one module eslint lets touch `Date`. Two rules hold throughout: a `Date` it
produces is at **local** midnight, and a `DateOnly` it produces is read from **local** calendar
parts. Those are the two directions of the same off-by-one.

Comparison turned out to need no `Date` at all — `YYYY-MM-DD` is fixed-width and big-endian, so
lexicographic order is chronological order, which makes the overdue check at T045 the safest
operation in the module rather than the riskiest.

`today()` **throws outside the browser**, deliberately. A `"use client"` component is still
server-rendered for its first paint, so this forces the pattern R-006's addendum actually requires —
read it in a `useEffect`, hold it in state — instead of leaving it to a comment.

The tests run every assertion under `Asia/Ho_Chi_Minh` and `America/Los_Angeles`. **In UTC, which is
what the runner uses, both regressions this module exists to prevent are invisible.** One timezone
each side of Greenwich is what makes them fail.

### Where Phase 2 actually stands

90 passing, 4 skipped; typecheck, lint, and build clean; four green pipelines. The checkpoint's
automated coverage is complete.

**The by-hand half is not, and it is blocked on a thing found at T022**: `SEED_CREATOR_EMAIL` uses
the reserved `.local` TLD, `email-validator` rejects it, and the `creator` table is still empty. No
account exists, so quickstart V1 cannot be walked by a human. Nothing in Phase 2 depended on it —
every test stubs the proxy, because CI has no FastAPI behind it — but T033 builds the first surface
that assumes a real session, so the first hand-verified sign-in has to happen before then.

## Stage 2 — the design export lands, and the audit runs

**2026-08-01.** The export arrived as a shared link to a claude.ai *design canvas*, and the first
useful discovery was that it is **not in the `CreatorHub Design System` project** created at stage 2
groundwork (`756a66ad-…`, still empty). It lives in a regular project, `32445b82-…`
("Thiết kế v0.1 hoàn thành"). `DesignSync` read it anyway — `get_file` does not require a
design-system project type; only pushing a component library back would. Nothing was lost, but the
project-type decision recorded in `CLAUDE.md`'s Decisions table turned out to protect a workflow this
export never used.

One file, `CreatorHub-Content-Calendar.dc.html`, 203KB, carrying **both** turns: dark at panels
`1a`–`1l` and a light counterpart at `2a`–`2l`. All eleven surfaces the brief asked for are present,
each drawn at 375px.

### The screenshot could not be fetched, so it was regenerated

`get_file` caps at 256 KiB, and the uploaded PNG is 1200×3608. What came back was exactly 262144
base64 characters — a byte-perfect prefix with **no `IEND` chunk**. It decodes to a file that looks
plausible in a directory listing and is not a valid PNG. It was deleted rather than committed.

The replacement is better anyway: the `.dc.html` renders offline in Chromium, so the screenshots were
taken from the export itself with Playwright. Two notes for anyone repeating this — the canvas
runtime (`support.js`) needs `window.React`, which the file never loads, so it throws on load and the
`{{ accent }}` placeholders survive in a couple of style attributes; everything else is plain HTML and
renders correctly. And panel ids start with a digit, so `#1c` is an invalid CSS selector — use
`[id="1c"]`.

### The audit was mechanical, which was the whole point of writing it first

Result: **clean, no `spec.md` amendment required.** Full findings are in
`design/content-calendar/BRIEF.md`; the short version is that the item sheet carries exactly the six
editable fields and no surface invents a seventh.

Three pattern matches had to be read in context before they could be dismissed, and all three are
false positives worth recording because a future grep will hit them again:

- **"trash" and "undo"** appear in the delete-confirm *copy* — "There is no trash and no undo" — which
  asserts FR-004's hard delete rather than implying a soft one.
- **"label"** is the type-scale token `Label 13/600` and the canvas's own `data-screen-label`.
- **"metric"** is the word *geometric*.

The one genuine judgement call: the month grid header shows `14 items · 3 overdue` and the drawer
shows `Backlog 6`. Those are **derived counts over the list already fetched** — no new column, no new
endpoint — so they are not the "performance metrics" the DO NOT INVENT list refuses. Cleared and
written down, so the question does not get re-opened at T042.

The acceptance test passes on inspection: in
`screenshot-month-grid-375-greyscale.png` the outline → half → solid+check progression stays separable
and the dashed overdue border still reads. The export carries that greyscale panel as a first-class
surface (`1d`/`2d`) rather than as a one-off screenshot, so SC-004 stays checkable.

### What was integrated, and what deliberately was not

**Integrated:** the token layer in `frontend/app/globals.css` — surfaces, ink, brand, the status ramp,
overdue, elevation, focus — plus the Oswald/Barlow pairing in `app/layout.tsx`, and the one surface
that already exists, `/login`, rebuilt from panel `1l`.

**Not integrated:** the other ten surfaces. Each belongs to a task from T033 onward and gets built
there, from this export. Building the month grid now because a picture of it exists is exactly the
drift `specs/` outranks code exists to prevent — and `/calendar` still cannot be reached, because the
seed account still does not exist.

The suite is unchanged at **90 passing, 4 skipped**, with build, typecheck, and lint clean. That the
login tests passed untouched is the useful signal: they assert the 44px tap target, the thumb-reach
position, and the absence of horizontal overflow at 375px — the three things a visual redesign is most
likely to break — and the redesign moved every pixel on the screen without moving those.

## The seed blocker closes, and quickstart V1 is walked

**2026-08-01.** The oldest open item in the project — open since T022, referenced by five separate
documents as blocking — was one character class in an email address. `SEED_CREATOR_EMAIL` used
`creator@creatorhub.local`, and `email-validator` refuses `.local` because it is a reserved
special-use TLD rather than a deliverable domain. `app.scripts.seed_user` had therefore never once
succeeded and the `creator` table was empty.

Changing the address to a real domain fixed it in one run. `creator` now holds exactly one row.

**The part worth recording is not the fix.** It is what the hand-walk demonstrated afterwards. V1 was
walked in a real browser — sign-in through the Next.js proxy to FastAPI to Postgres — and it was the
**first time in this project's history** that path had executed end to end outside a test. Up to that
point Phase 2 was 90 green frontend tests, and every one of them stubs the proxy, because CI has no
FastAPI behind it. The suite could not have distinguished a working seam from a broken one.

So the rule that came out of this is not "seed earlier". It is: **a green frontend suite is evidence
about the frontend in isolation and about nothing else**, and each phase checkpoint gets a hand-walk
of its quickstart section regardless of what the suite says. That is now in `.claude/memory.md`; the
diagnosis itself is in `CLAUDE.local.md`, where a fresh machine would look.

Re-seeding is not a recovery path: `seed_user` updates the password of the existing account, but a
*different* email is refused outright, because `content_item` has no owner column (INV-4) and two
creator rows would silently share every item.

Five documents claimed this was outstanding — `CLAUDE.md`, `CLAUDE.local.md`, `.claude/memory.md`,
`quickstart.md`, and `tasks.md` in two places. All were corrected before T029 began, in their own
merge request, so the Phase 3 branches carry code and nothing else.

## Phase 3 opens — T029–T031, create and list

**2026-08-01.** The first content-item routes. `POST /content-items` and `GET /content-items`, plus
the test file every later story extends. Backend suite **96 → 142 passing**.

### One merge request carried three tasks, deliberately

`tasks.md` says two things that cannot both hold here: "tests are written before the implementation
they cover, and must fail first", and "one merge request per task". T029 is a test task whose subject
is *both* T030 and T031 — one file covering create and list — so an MR containing T029 alone is an MR
with a red pipeline, and the gate that became real at T025 refuses it. Splitting the test file by
endpoint would have made the ordering assertions homeless: they need a create path to produce rows and
a list path to read them.

So the fail-first requirement was satisfied where its value actually is — **in the doing, not in the
merging**. T029 was written and run against a codebase with no `content_items.py` at all: **41 tests,
41 failures, zero passes.** That number is the evidence the rule exists to produce, and it is the
reason the green run afterwards means something. One failure was inspected by hand rather than
counted, to confirm it was a missing route (a 404 body being indexed as a list) and not a broken test
helper.

The three tasks then landed together. The deviation is stated here and in the MR rather than smoothed
over; the alternative was a knowingly red pipeline, which is worse.

### `created_at DESC` is not an order inside the harness

The sharpest thing this task turned up. `func.now()` is `CURRENT_TIMESTAMP`, which in Postgres is
**transaction** time, not statement time. Every test runs in one transaction, so three items created
over HTTP inside a test share a `created_at` to the microsecond — and the obvious ordering test
therefore cannot tell `DESC` from `ASC`. It passes on whatever order the planner returns. In
production every request is its own transaction, so this is invisible outside the suite, which is
exactly what makes it dangerous: the test would have been vacuous and green.

Two things came out of it. The ordering assertions write rows **through the session** with explicit
distinct timestamps, so they test the documented order rather than an accident. And the endpoint
orders by `created_at DESC, id DESC`. The tiebreaker is not test scaffolding: a creator emptying their
head into the capture sheet produces several items a second, and a backlog that reshuffles between two
reads of the same rows reads as data loss. `id` is monotonic with insertion, so it never contradicts
`created_at` — it only decides what `created_at` leaves open. There is a test asserting two reads
agree.

### The 409 seam closed the way `backend/AGENTS.md` said it would

The contract won. `InvariantErrorResponse` carries `{code, detail}`; `ErrorResponse` stays exactly one
key everywhere else. The mechanism is a raised `InvariantViolationError` and a handler in `main.py`,
because `HTTPException(detail={...})` can only nest a dict under `detail` — there is no argument that
produces a sibling key.

`test_errors.py`'s "exactly one key, not at least" rule was **narrowed rather than relaxed**:
`expected_keys_for(status_code)` gives each code one legal shape, so a 401 that grew a `code` still
fails and a 409 that lost one fails too. The document-level assertion was rewritten the same way —
per status code, not "allow two schemas anywhere" — which is what keeps it able to catch the mistake
in both directions.

**The strongest confirmation came from the frontend, which was written first.** `lib/api.ts` at T023
already declares `INVARIANT_CODES`, already types `ApiError.code` as present only on a 409, and
already declares `scheduled?: "none"`. It was written from the contract months before an endpoint
could return any of it, and the backend built from the same contract met it exactly with no
adjustment on either side. That is the argument for contract-first stated better than prose can.

### Two smaller decisions worth not re-litigating

**A blank title is 422, not 409.** INV-2 is as real an invariant as INV-1, but `InvariantError.code`
has exactly two members and neither describes a blank title; a 409 would need a third code the
contract does not declare. So a title that trims to nothing is a *validation* failure. The 409 is
reserved for the one rule that cannot be expressed as a field constraint because it spans two fields.
Note that `min_length=1` alone does not implement this — `"   "` is three characters and passes it.
`strip_whitespace=True` is what makes the length check mean what INV-2 means.

**`published_url` is bounded now, not at T063.** T063 writes the `javascript:`/`data:` tests, but the
constraint has to exist from the moment the field is first writable, which is this task — `POST`
accepts it today and an unbounded value is a 500 from `String(2048)`, one of the six defects the
post-review pass already caught. The pattern is an allowlist of two schemes rather than a denial list,
because this value is rendered as an `href`.

The two query parameters this endpoint does *not* implement — `date_from`/`date_to` at T037,
`platform` at T060 — were left out on purpose. The contract describes the finished module; a parameter
appearing before its task is the speculative build principle VII forbids.

## T032 — the data-fetching pattern, established once

**2026-08-01.** `lib/items.ts`, the module R-007 exists to make necessary. Frontend suite **90 → 110
passing**, 4 still skipped.

The task is small in code and load-bearing in shape: T033's calendar, T034's capture sheet, T035's
drawer, and T061's filter all read from here, and the post-review pass in `tasks.md` recorded that
without it T038 and T061 would each have invented a data-fetching strategy in separate merge requests.

### The module is split in two because this project has no renderer

`tech-defaults.md` rules out Jest and React Testing Library at v0.1, so a hook cannot be exercised in
isolation — there is nothing to render it into. Left as one `useContentItems`, the branches that
matter most would have been the least reachable: the rollback path only runs when the server refuses
a write, and the overlap path only when a reload lands mid-save. Through a browser both need a request
failed or delayed deliberately, and neither would ever be asserted at the level of *which rows end up
in which order*.

So every decision about what the state becomes is an exported pure function, and the hook is a shell
holding the effect, the fetch, and the temporary-id counter. Twenty unit tests cover the transitions;
the hook's wiring is covered by the browser tests at T033 and T034. **This is a testing constraint
producing a better design, not a workaround** — and it is the pattern to follow when the module grows
`PATCH` at T049.

### A pending row is a real item with a negative id

Postgres identity columns start at 1 and never go negative, so a negative id cannot collide with a
real one — a stronger guarantee than a `_pending` flag, which a spread or a reconciliation can drop
while leaving the row looking saved. Surfaces therefore render one list and key on `item.id`, which is
what an optimistic update is for.

`isPending` matters beyond rendering, and this is the part a later task will trip over: **a pending
row cannot be the target of a `PATCH` or a `DELETE`**, because the id it names does not exist. T049
and T050 have to skip those rows rather than let a control appear that produces a 404.

### Two failure modes that are invisible when you read the code

**A read that lands mid-save deletes the row being saved.** The creator taps save; the list request
that was already in flight returns; replacing `items` wholesale makes the new row vanish and reappear
seconds later. `itemsLoaded` re-prepends pending rows to prevent it. In the same breath it is a
*replacement* for saved rows rather than a merge-by-id — a merge would leave a deleted item on screen
forever. Both are asserted, because neither is visible in the function's five lines.

**A failed write must not blank the calendar.** A refused save rethrows to the capture sheet, which
renders it beside its own field with the creator's text intact; only a failed *read* sets
`state.error`. Collapsing the two is the obvious simplification and it loses the whole list because
one item was refused.

### One addition to `lib/dates.ts`

`nowInstant()`. An optimistic row needs `created_at` and `updated_at` shaped like the server's, and
eslint forbids `new Date` outside that module — correctly, since that ban is what keeps R-006's
off-by-one out of the codebase. It sits beside `today()` because both are `Date` access, not because
they are interchangeable: one is an instant on the UTC timeline, the other a calendar date, and
`parseDateOnly` rejects the former by design.

Unlike `today()` it does **not** refuse to run outside the browser. It is called from an event
handler on a user action, never during render, so there is no hydration flip to prevent — and the
reducer that consumes it takes the timestamp as an argument, which is what keeps that reducer testable
in a Node runner.

## T033 — the calendar shell, and two debts from Phase 2 paid

**2026-08-01.** `/calendar` exists. Frontend suite **110 → 120 passing, and 4 skipped → 0** — the
first time this project has had no skipped tests since T027.

The surface itself is the frame from the export's `Month grid 375` panel: header band (eyebrow,
period, derived count), content region, bottom action band. What goes *inside* it is deliberately
absent — month grid T042, week list T043, period nav T044, backlog drawer T035, platform filter T061.
Each has a reserved place and a task. Building one because the export draws it is letting a picture
reorder the task board.

### T027's deferred half, and why it is a page rather than a layout

The re-assert landed in `app/(app)/calendar/page.tsx`. The reasoning is a property of App Router that
is easy to state and easy to forget: **layouts are not re-executed on soft navigations, page segments
are.** So once the app is open, a client-side route change within `(app)` reuses the layout's
credential check from whenever the tab was opened; a second layout would inherit the same problem,
and only a page segment re-runs.

Both checks call `hasSessionCookie`, so "is there a session" has one definition. Worth being blunt
about the limit: **a full page load exercises both at once**, so no e2e test can distinguish them —
delete the page-level check and `session-guard.spec.ts` stays green. That is recorded in
`frontend/AGENTS.md` as the guard, because a comment in the file it protects is not one.

### The four skipped tests are on, and one stub had been passing for the wrong reason

Deleting `.skip` was the one-line change T027 promised. What was *not* anticipated: two tests in
`login.spec.ts` had been green only because `/calendar` returned a 404, and **a 404 leaves the
browser at the address it asked for**. `stubLogin` reproduced the proxy's response body but not its
`Set-Cookie`, so the moment the destination became guarded a correct sign-in would have bounced
straight back to `/login` — a failure caused entirely by the stub.

Fixed by making the stub set the cookie on a 2xx, which is what the proxy does. The general rule,
now in `frontend/AGENTS.md`: a stub has to do everything the real thing does that the assertions
depend on, and **when a route becomes guarded, re-check every stub that navigates to it**. This is
the same family as the `__probe` trap at T027 — a path-only assertion cannot tell "rendered" from
"not found".

### `useSyncExternalStore`, not `useEffect` + `useState`

R-006's addendum prescribes reading `today()` in an effect and holding it in state, and that is
correct — but React 19's compiler lint flags setting state from an effect, and the form renders once
with the wrong value before correcting itself. `useSyncExternalStore` with `getServerSnapshot`
returning `null` gives the identical guarantee — the server never reads a clock — with neither
problem. The three arguments are module-scope functions, because an inline `() => today()` is a new
identity every render.

The lint rule was right and the fix was better than a suppression, which is worth recording: the
addendum's advice was written before this codebase had a compiler lint, not wrong.

### Screenshotted, because the suite cannot see this class of bug

Per the trap in `frontend/AGENTS.md`: a misspelled Tailwind class generates nothing and fails no
check. `/calendar` was built, served from the production bundle, and captured at 375px with a stubbed
list — eyebrow in brand red, skewed uppercase Oswald period, hairline borders, the notched capture
button in the bottom band. Every token resolved. `pnpm typecheck`, `pnpm lint` and 120 green tests
would all have passed had they not.

**Postscript: the first pipeline for T033 was red, and the test was at fault rather than the code.**
`the visible period comes from the browser clock, not the server` asserted `"May 2026"` from the
instant `2026-04-30T18:00:00Z`. That is true in UTC+7, where it was written; GitLab's runner is UTC
and read April. **Green locally, red in CI — the fourth time in this project**, and the first time
the cause was a test rather than a config file.

`page.clock.setFixedTime` pins the *instant*. The zone that turns an instant into a calendar day
still comes from the machine, and nothing had pinned that. The fix made the test stronger rather than
merely correct: `test.use({ timezoneId })` for two zones one either side of Greenwich, asserting the
*same* timestamp renders `May 2026` in UTC+7 and `April 2026` in UTC-7. Two different answers from one
instant can only happen if the browser's clock produced them — a period read during server rendering
would be identical in both. Verified by running the suite under `TZ=UTC` *and* `TZ=Asia/Ho_Chi_Minh`
before pushing again.

`tests/client/dates.spec.ts` already ran its assertions under two timezones for exactly this reason,
via `process.env.TZ`. That mechanism does not reach the browser, so the lesson did not transfer on its
own — which is why it is now in `frontend/AGENTS.md` in browser terms.

## T034 — the capture sheet, and US1 becomes usable

**2026-08-01.** The flow the whole of User Story 1 exists for now works end to end in the browser:
tap `+ CAPTURE`, type a title, tap `SAVE TO BACKLOG`. Frontend suite **121 → 131 passing**, still
none skipped.

Built from the export's `Capture sheet 375` panel (`1f`/`2f`) on shadcn's `Sheet`, which
`.claude/rules/design.md` asks for ahead of hand-rolling a modal. `shadcn add sheet` **fully
succeeded this time** — worth recording, because the trap in `frontend/AGENTS.md` says it can
half-succeed. The reason it did not: it generates against `@base-ui/react`, which was already a
dependency, so nothing new had to be installed and the pnpm `allowBuilds` hazard never arose.

### One field, and the test asserts the request rather than the form

FR-005 makes title the only required field and `.claude/memory.md` records why in a sentence worth
re-reading before adding a second: *"ideas arrive mid-task, and any required field is enough friction
to send the creator back to a notes app."* The item sheet at T052 is where platform, date, hook and
link get set — on an item that already exists. **This sheet is not a smaller version of that one.**

`capture.spec.ts` asserts the *request body* is exactly `{title}` rather than counting inputs on
screen, because a field that quietly defaulted to something and sent it would still be this surface
making a decision that belongs to T052.

It also counts the interactions: tap, type, tap. `autoFocus` on the field turns out to be
load-bearing rather than a nicety — without it the count is four, and on a phone it is the difference
between the keyboard appearing and the creator hunting for the field.

### The failure path is where the design actually shows

Three tests cover one refused save, because it has three separate ways to go wrong and only one of
them is visible in a screenshot: the error must be readable, **the typing must survive**, and the
optimistic row must roll back off the count. That is why `lib/items.ts` rethrows write failures
instead of folding them into the list's error state — a decision made at T032 that had no consumer
until now, and this is the consumer.

Cancel also keeps the text. Clearing it would make a mis-tap on the scrim destructive, which
`.claude/rules/design.md` reserves for confirmed actions.

### Twenty-two tests failed on a port collision, and none of them were broken

Between the T033 screenshot and this task's test run, a `next start -p 3100` was left running.
`playwright.config.ts` uses **3100** with `reuseExistingServer` outside CI, so Playwright silently
adopted it — serving from a `.next` that had since been deleted. The symptom was 22 failures spread
across files this task never touched, with a 21px login input, because **no CSS was being served at
all**. `pnpm build` passed the whole time.

The lesson is not "kill your servers". It is that the mandatory screenshot step (forced by the
silent-Tailwind-class trap) and the test suite were using the same port by default, so the two
required parts of the workflow collide by construction. Recorded in `frontend/AGENTS.md`: screenshot
on a different port.

### Screenshotted at 375px

Sheet bottom-anchored with the notched corner, grip bar, `CAPTURE IDEA` in letterspaced Oswald, the
52px field with the brand focus ring, the helper line, and `CANCEL` / `SAVE TO BACKLOG` with the
notch on the primary. Every token resolved against panel `1f`.

## T035 — the backlog drawer, and Phase 3's implementation closes

**2026-08-01.** `components/backlog/BacklogDrawer.tsx`. Frontend suite **131 → 143 passing**, none
skipped. **This is the task that makes User Story 1 demonstrable**: its goal is "capture an idea with
only a title and *find it in the backlog later*", and until now nothing on any surface displayed a
captured item — the header count was the entire feedback loop.

Built from the export's `Backlog expanded 375` panel (`1h`) plus the peek strip drawn along the bottom
of `Month grid 375` (`1c`), with the empty copy from `First run 375` (`1k`).

### It reads state; it does not fetch

`selectBacklog` narrows what the calendar already loaded, and the call lives *inside* the drawer so
"what the backlog is" has one definition. The endpoint's `scheduled=none` parameter — built at T031
and tested — is deliberately **not** used by this surface: R-007 says the period is loaded once and
every surface reads the same state, and a second request alongside the calendar's own would double the
round trips and let the two disagree. The parameter exists for a caller that wants only the backlog.
This is not one.

### Two pieces of copy were changed from the export, both deliberately

The expanded header's line in the export is *"Undated ideas, newest first. Drag one onto a day to
schedule it."* **Only the first half is true today** — there is no month grid until T042 and no drag
until T054 — so the second half would instruct the creator to do something the product cannot do.
Phase 3 is a deployable checkpoint, so that is a defect and not a nicety. **T054 restores the full
sentence.**

The empty state names the capture action rather than saying "Empty" alone, because T035 asks it to
point somewhere and because a bare "empty" reads as something being broken.

### The finding: a pending row is only visible if the drawer is *already* open

A test that captured an item and then clicked the drawer toggle timed out, and the cause is a decision
from T034 rather than a bug. **The capture sheet stays open until the save resolves** — that is what
keeps a creator's typing when a save is refused — so with a create left hanging the sheet's scrim
covers the toggle and the drawer cannot be opened at all. Expanding first is not a workaround; it is
the only state in which an optimistic row is on screen.

That also bounds where `isPending` is load-bearing, which had been vague since T032. It is not
decoration on this surface: it is the guard **T052's tap-to-open and T054's drag** must read, because
both name an id the server has not issued. The row exposes it as `aria-busy`, and there are now two
tests — one that a pending row is marked, one that a reconciled row is not, since a row stuck
`aria-busy` would leave every id-bearing control permanently disabled.

### What was left out

Rows show a title and nothing else. The status cue and platform monogram the export draws are
**T038–T040**, and **T041 is the task that puts `ItemChip` in this drawer** — it has its own line in
`tasks.md` because FR-017 covers the backlog explicitly, and because a `posted` item with no date
legitimately lives here, so "the drawer only holds ideas" is not a shortcut available to it. Drag is
T054; opening an item is T052. Each has a seam marked in the source rather than a partial build.

Screenshotted at 375px in both states, on port 3311 rather than 3100 — see the collision recorded at
T034. The peek strip clips its chips horizontally without moving the body; the expanded panel leaves
the period header visible above the scrim, which is what keeps R-003a's "one surface" true rather than
merely asserted.

## The Phase 3 checkpoint — three gates, and the one that found something

Implementation through T035 was already green when this ran. The checkpoint is the part the suite
cannot do, and it was run in the order `.claude/memory.md` prescribes: hand-walk first, then the
`reviewer` agent, then `/speckit-analyze`.

### The walk

`docker compose up -d db backend` plus `next dev`, and a real Chromium at 375×667 with `timezoneId`
pinned to `Asia/Bangkok`, driving the actual product with **no route stubbing at all** — browser to
Next proxy to FastAPI to Postgres, against the one seeded account. 24 checks, all passing, and the
`content_item` table was truncated first so "exactly three items exist" meant something.

The numbers worth keeping: capture took **3 interactions and 360–594ms** against SC-001's budget of 3
and 15 seconds, and the whole of V2 — including the reload — held. Sign-out from a forged, expired
token returned 204 with the cookie gone, which is T014's lenient `presented_token` proving itself over
HTTP rather than in a unit test.

### What the walk corrected

V1's "Expected" claimed the redirect carries no markup because "the redirect happens before markup is
generated". Measured, that is wrong about the envelope in both `next dev` **and** `next start`: Next
16.2.12 answers a server-component `redirect()` with a 307 carrying a ~6–7 KB `__next_error__`
document holding the route's static metadata and its script preloads. What it does *not* hold is any
content data — re-checked with three items in the database, none of their titles appears. So the
requirement (FR-002, SC-006) holds and the quickstart's reasoning did not; quickstart.md now asserts
on content data, and `frontend/AGENTS.md`'s claim that `next start` returns an empty body is corrected
there, because it was a trap note pointing the wrong way.

Two ordinary environment notes, both costing minutes: Docker Desktop does not survive a reboot, and
**port 3100 was still held by a server from a previous session**, which is exactly the collision that
file warns about — `playwright test` refused to start with `EADDRINUSE` until it was killed. The
screenshots for this checkpoint were taken on 3000, and the production check on 3200.

### The reviewer pass

Clean. No correctness defects, no drift against spec.md, data-model.md or the contract, nothing built
that belongs to a later task, and no assertion weaker than the requirement it cites — the agent
re-derived the AGENTS.md decisions from the code rather than trusting the prose.

It left one **latent** item, which is the useful output of a clean review: `itemsLoaded` re-prepends
only rows that are still `isPending`, so a list read that overlaps a create which has *already*
reconciled would drop the reconciled row. It is unreachable today — nothing calls `reload()`, and the
fetch effect runs once on mount because `stableParams` never changes for `CalendarShell`'s no-arg call
— so it was recorded, not fixed. **T044 is the first task likely to wire `reload()` to a control.**

### The analyze pass, and the finding that paid for it

No constitution conflicts; 44 of 46 requirements cited by at least one task. The finding that mattered
came from reading `contracts/openapi.yaml` against research.md R-007, not from counting citations:
**T042 said the month grid "queries the full six-week span"**, `date_from`/`date_to` are bounds on
`scheduled_date`, and the backlog drawer is specified to narrow already-loaded state rather than fetch
for itself. Built literally, the first month grid would have emptied the backlog drawer — a US1
regression shipped by a US2 task, invisible to the frontend suite because every test there stubs the
proxy and a stub ignores query parameters.

T042 was the artifact that was wrong and it is amended in `tasks.md`: one unparameterised read,
narrowed client-side, with T036/T037 still building the parameters because the contract declares them.
That is the second time in this project a coverage number and a real gap have disagreed, and the same
lesson as the stage-1 reviewer pass: the two checks find different things, so both get run.

## T036–T037 — the date-range filter, and what a green filter test can be green about

**2026-08-01.** `GET /content-items` grows `date_from` and `date_to`. Backend suite **142 → 170
passing**, none skipped. **One merge request for both tasks**, the same stated deviation as T029–T031:
T036's whole subject is T037, so an MR carrying the tests alone would be red and the gate refuses a
red pipeline. Fail-first therefore happened in the doing rather than in the history — **27 tests
written, 23 red** against a `list_content_items` that had never heard of a date parameter.

### The fail-first run is where the interesting part was

All 23 failed the same way, and it is worth naming because it is not "the feature is missing": FastAPI
**ignores an undeclared query parameter**, so every request returned the unfiltered list with a 200.
That is the shape of every parameter failure from here — a filter that silently does nothing, which on
a calendar looks like the grid working while showing the wrong month.

Which makes the four tests that were **green before any implementation existed** the finding. Three
were controls and known to be trivial. The fourth was not: an inclusivity check written as
`assert "First day" in titles_in(client, date_from=RANGE_FROM)` passes against an endpoint with no
filter at all, because an unfiltered list contains everything. It is a perfectly good test of "the
lower bound is inclusive, not exclusive" and it is *worthless* as a test of "the lower bound exists".
Both bounds are now pinned twice — once with `in`, once as an exact set — and the exact set is the one
that fails when the filter is too wide. Written up in `backend/AGENTS.md`, because T060's `platform`
parameter has exactly the same shape.

### One assumption the implementation refuted

The malformed-bound parametrisation was written with `2026-09-01T00:00:00Z` in it, on the assumption
that `format: date` means `YYYY-MM-DD` and everything else is a 422. It is not. Pydantic coerces an
RFC 3339 datetime whose time is exactly zero and refuses one with any real time — probed directly
rather than inferred, because the first run only showed that the ignored parameter returned a 200.

Kept as a characterisation test rather than tightened away with a bespoke validator, for two reasons:
the only extra spellings accepted already name the whole day, so nothing can be silently truncated;
and `frontend/lib/dates.ts` emits `YYYY-MM-DD` and nothing else, so there is no caller to protect. The
half that is load-bearing is the *pair* — midnight accepted, `T12:00:00Z` refused — which is what
would notice if either bound were ever retyped `datetime` and FR-012a's "no time of day" quietly
stopped being true.

### Two empty arrays that are decisions, not gaps

`scheduled=none` with a date bound, and `date_from > date_to`. Both compose to a `WHERE` clause
nothing satisfies, and both are left that way. The contract declares these as independent filters and
says nothing about them interacting, so a 422 would be a response it does not carry — and it would
need a `REACHABLE_4XX` case for a request no surface can produce, since the drawer sends
`scheduled=none` and period navigation always builds `from <= to`. Asserted, so the choice is visible
in the suite rather than inferred from an absence.

The dated/undated split is the same class of thing from the other direction: nothing in the endpoint
implements it. `NULL >= '2026-09-01'` is `NULL`, so SQL excludes undated items from any bounded query
for free — which is precisely why it is asserted across all three bound combinations with a control
proving the undated row exists. A rewrite that filtered in Python would pass everything else in the
file.

### What was left out

`platform` is **T060** and `GET`/`PATCH`/`DELETE` by id are **T049–T050**; the module docstring
already said so and still does. `ix_content_item_scheduled_date` exists from T011 and needed nothing —
`alembic check` clean, no migration in this MR. The generated `openapi.json` was read back to confirm
both parameters land as optional `format: date` in query, rather than trusting the annotation.

And left out on the other side of the wire: **nothing calls these parameters yet, on purpose.** The
Phase 3 checkpoint's `/speckit-analyze` pass amended T042 the day before — the calendar keeps one
unparameterised read and narrows client-side, because a ranged read returns no undated rows and would
have emptied the backlog drawer. That amendment is the reason the second bullet above can say no
surface produces the empty-array combinations: it is a fact about the frontend as it will be built,
not an accident of it being unbuilt. `contracts/openapi.yaml` declares both parameters, so they ship
tested with a caller that does not yet need them — an endpoint ignoring its own contract is the drift
this project exists to avoid.

## T038–T042 — the cues, the chip, and the grid

Phase 4's frontend half, five merge requests in a straight line: !15, !16, !18, !19, !20. The chain is
linear because each task is the previous one's only consumer — the mapping has no shape until the cues
render it, the cues have no home until the chip composes them, and the chip has no surface until the
drawer and the grid draw it. The backend half (T036–T037) ran alongside it in a worktree and merged as
!17; the two touched disjoint trees and never met.

### Two sizes became three, because the export drew three

T038 and T040 were written for a `micro` chip and a `full` one. Opening the export's `1c` panel to
build T041's peek strip showed a third: 12px cue, bounded title, 18px monogram, one clipped row. The
strip is the backlog view that is on screen whenever the calendar is, so FR-017's "in both calendar
and backlog views" applies to it — it is not a summary of the drawer, it *is* the drawer, collapsed.
`CueSize` in `lib/status.ts` now names all three, which is what stops the chip and the two cues from
each having their own opinion about how many there are.

### The half-filled disc

`draft` is a circle filled to its vertical midline. Three ways to draw it: an absolutely-positioned
inner element (two nodes per chip, on a surface that renders up to eight), an SVG path (a path where a
`border-radius` does), or a hard-stopped linear gradient (one node, one declaration). The gradient
also greys out correctly, which is the only property SC-004 is actually about. It reads
`var(--color-status-draft)` rather than a hex, because `app/globals.css` is the only file in this
project allowed to contain a colour and these tokens are shared by all four modules.

### T039 and T040 shipped with no tests, on purpose

There is no renderer in this project — `tech-defaults.md` rules out Jest and RTL at v0.1 — so a
component cannot be exercised in isolation, and a component's first test is the first surface that
renders it. T041 is that surface, and its four DOM assertions cover both. The alternative was adding
`@playwright/experimental-ct-react` for two components, which is a testing toolchain arriving for the
smallest thing in the phase. The seam was stated in both MRs rather than left for a reviewer to find,
in the same shape as T027's guard tests waiting for T033.

### The grid, and the test that guards the amendment

T042 built `MonthGrid` and `DayCell`: a seven-column CSS Grid over a **fixed 42-day span** from the
Monday on or before the 1st. Fixed, not the month's own length, because a grid that is five rows in
one month and six in the next moves the backlog drawer and the action band up and down as T044
navigates — on a phone that is the difference between a thumb target that stays put and one that does
not. The cost is a row of adjacent-month days at each end, which are drawn dimmer and hold real items:
an item on the 27th of last month is genuinely in the week on screen.

The Phase 3 checkpoint's amendment — no `date_from`/`date_to` on the calendar's read — is now a
**test** rather than a paragraph: `month-grid.spec.ts` asserts the request URL carries neither
parameter. That form was chosen deliberately. A stub answers a ranged request with its entire fixture,
so an assertion on the rendered grid would have stayed green through exactly the regression the
amendment exists to prevent, and the empty backlog would have shown up in a browser weeks later.

The day-cell overflow expands **in place**. The spec's edge case asks for the remainder to be
reachable; a day sheet would be a second surface competing with T052's item sheet for the same tap,
and a route change would break SC-002. Two chips before the count, because a third takes six rows past
a 667px screen.

### What the screenshots showed

375px, port 3400, against a live stack with real fixtures — including a day carrying four items so the
overflow was on screen. The grid fits without scrolling: header, six rows, peek strip, action band.
The greyscale pass is the one that matters — outline, half, solid-with-check stay separable with every
colour removed, which is V3's assertion made at the surface it is about rather than on a design panel.

One environment note, twice in one session: **Docker Desktop's daemon does not survive whatever
stopped it**, and the symptom mid-task is a screenshot script timing out on a login page that cannot
reach FastAPI. Starting Docker Desktop and re-running `docker compose up -d db backend` is the fix; it
costs about ninety seconds and is the first thing to check when a real-stack script hangs.

---

## Phase 4 closing: T043–T045, and the checkpoint that found a live spec violation

### T043 and T044 shared a merge request, and the reason is structural

The week view is seven **vertical sections**, not seven columns. Seven columns at 375px is about 53px
each — the width at which `DayCell` already drops its title — and the week is precisely the view a
creator opens to *read* what is planned rather than to scan density. So it trades the horizontal axis
away and spends the full width per row, which is what makes `full` chips with titles possible. It also
has no chip cap, and that is not an oversight: `DayCell` caps at two because 42 cells share one
screen's height, whereas seven sections scroll inside `<main>` and have no height budget to protect.
Hiding an item behind `+N more` there would be a cost with nothing bought.

`WeekList` shipped with `PeriodNav` in **!22** because a week view with no way to reach another week
is half a feature — the same "the task's subject is the next task" deviation as T029–T031 and
T036–T037, and `tasks.md` records it as one rather than leaving it to look like a slip.

The durable decision from T044 is `lib/period.ts`. Three questions a surface must not answer for
itself: which days this period covers, what the adjacent one is, and what it is called. Left in the
components, `MonthGrid` and `WeekList` would each derive a span — which is how a grid's first column
and a week list's first section come to disagree about where a week begins — and `PeriodNav` and the
header would each derive a title. The testing reason is the same one that split `lib/items.ts`: **this
project has no renderer**, so anything inside a component is reachable only through a browser.
`tests/client/period.spec.ts` enumerates a dozen calendar boundaries — a month opening on a Sunday, a
week straddling New Year, a DST weekend — under two timezones, in the time one browser test takes.

### The prediction about `reload()` was wrong, and being wrong was informative

The Phase 3 `reviewer` pass recorded a latent hole in `itemsLoaded` and predicted **T044** would be
the first task to expose it, by wiring `reload()` to the period arrows. T044 does not call `reload()`
at all. Navigating a period issues **no request**: the calendar holds one unparameterised read and
every surface narrows it client-side, so stepping to another month is pure client-side re-narrowing.
Putting a round trip behind an arrow tap is exactly what R-007 rejects for the filter, and Render's
free-tier spin-down makes the first one of the day tens of seconds. `tests/e2e/period-nav.spec.ts`
asserts the request count stays at **one** across three navigations — the prediction's real value was
turning into a test of the opposite claim.

The hole itself was closed anyway, by `savedSince`: a **narrow allowance**, not a merge-by-id. It
keeps only ids this browser saved during this read, and only while they are missing from the response.
A general merge would be wrong in the other direction — absence from a response is exactly how a
deletion arrives at T050, so an upsert would leave a deleted item on screen forever.

### `h-dvh`, and a test that was green against a band hanging off the screen

T044's screenshot caught what two tasks of assertions had not. `CalendarShell` was `min-h-dvh`, so the
column's height was its content's height and `flex-1` on `<main>` had nothing to shrink against: six
grid rows plus the drawer pushed the action band below the fold and the page scrolled vertically to
reach it. `calendar.spec.ts` asserted the band sat in the bottom **half** of the screen — which a band
hanging off the bottom edge satisfies perfectly. A fixed height gives `<main>` something to be
`min-h-0` against, so the grid scrolls inside its own container and the band stays under the thumb.
Do not change it back.

### T045: overdue is a condition, not a fourth status

FR-007 fixes the pipeline at three states, and overdue is **orthogonal** to status rather than a
fourth value of it — an `idea` and a `draft` can both be overdue and the creator still has to tell
them apart. Hence a dashed **left** border: a condition on a chip that already has a border, and a
dash pattern is a shape, so it survives greyscale the way R-005's cues do. `border-l-dashed` is not a
Tailwind utility — border style has no per-side variant — so `ItemChip` carries the project's one
arbitrary property, `[border-left-style:dashed]`, and the test asserts the **computed** style. It also
asserts the top border is still solid, because dashing all four sides is how the export draws T054's
drag ghost and the two treatments must not collapse into each other.

`today` reaches the chip as a **prop**, which makes "never during server rendering" true by
construction rather than by discipline: `isOverdue(item, null)` is false, and `null` is what every
server render has. The pair of tests at the bottom of `overdue.spec.ts` proves the value came from the
browser — the same instant and the same fixture in UTC+7 and UTC-7 give two different answers, which
only a client-side clock can produce.

`countOverdue` counts **every loaded item**, not the visible period's. An overdue item two months back
is precisely the one the creator has lost track of, so a count that emptied itself as they navigated
away from the problem would invert what the treatment is for. Zero prints nothing rather than
`0 overdue` — a standing line that usually reads zero is one that stops being seen.

### The checkpoint: three gates, and the one that mattered was the cheapest

V3 and V6 were walked at 375px against a live stack, 21 checks, 21 passing. The greyscale pass is
V3's whole point and it held at both chip sizes. But the walk's finding was about **how** it had to be
run: Next's dev overlay — the "N" button, bottom-left — sits over the `MONTH` toggle at 375px and
swallows the click. The toggle is untappable under `next dev` and *only* under `next dev`. CI runs the
production bundle, so no suite was ever going to show this; the walk had to move to `pnpm build` plus
`pnpm start`, which needs `API_BASE_URL` and `SESSION_COOKIE_SECURE=false` (without the second, the
Secure cookie is not stored over http and a correct sign-in bounces straight back to `/login`).

The `reviewer` pass over T036–T045 came back clean, with one coverage gap.

**`/speckit-analyze` found a live constitution IV violation, and it is the entry worth remembering.**
`contracts/openapi.yaml` still carried the sentence *"Calendar reads pass a date range; the backlog
read passes scheduled=none"* — the exact claim the Phase 3 amendment overturned. The code was right;
the contract was wrong. Three things about it:

- **The resolution had been applied to `tasks.md` only.** One artifact was corrected and the other two
  carrying the same claim — the contract and `research.md` R-007 — were left. An amendment recorded in
  one place is a fix; recorded in one place while two others still assert the opposite is a trap with
  a paper trail.
- **The contract contradicted itself four lines apart.** The `scheduled` parameter's own description
  already said "Omitted returns both dated and undated, which is what the calendar surface loads". A
  document that disagrees with itself will be believed at whichever line the next reader opens.
- **It had a named victim.** T061's platform filter reads that same paragraph. The amendment would
  have been undone by a task doing exactly as it was told, and `specs/` outranks code — so the next
  agent would have been *right* to send a date range, and the backlog would have emptied.

That is the class of defect a coverage count cannot produce: analyze did not find it by counting
citations, it found it by reading the contract against R-007. The same pass counted 46 requirements
and 76 tasks and reported 8 requirements uncited by id — all 8 already built, which is why they were
fixed as **citation** work and each placed at the requirement's real home rather than swept into T052.
A citation added where the requirement is not implemented makes the next coverage count lie.

The reviewer's gap was `REACHABLE_4XX` missing the `date_from`/`date_to` 422. `backend/AGENTS.md`
requires every 4xx in **both** the route's own test and that registry, and only the first existed —
so the status was asserted and the `{detail}` shape never was. These are the first 4xx reachable
through a **query parameter** rather than a body, which matters because they go through the same
`RequestValidationError` handler that flattens `detail` from an array to a string. Backend suite
170 → 172.

## T051 — the by-id client operations, and a stale instruction that had become dangerous

Phase 5's frontend opens here. `lib/api.ts` gained `getContentItem`, `updateContentItem` and
`deleteContentItem`; `lib/items.ts` gained `itemWithChanges`, `itemChanged`, and `updateItem` on the
store. 24 new tests, all written and run red first: **234 → 258 frontend tests, none skipped.**

**Phase 5's backend (T046–T050) has no entry in this log.** MRs !25 and !26 landed without one. Not
reconstructed here — an account written after the fact by someone who did not do the work is worse
than the gap it fills. `tasks.md` and the two AGENTS.md files carry the durable half.

### One transition, three callers, and no snapshot

The interesting design question was rollback. An optimistic edit needs the row as it was, and the
obvious ways to get it are all machinery: capture it inside a `setState` updater (a side effect in a
function React may invoke twice), keep a `stateRef` mirroring state (an assignment during render, or
an effect that lags), or remember an index and splice it back (wrong the moment a read lands in
between).

None of that is needed if `updateItem` takes the **row** rather than the id. The argument *is* the
rollback value. That collapses the whole thing into one pure transition — `itemChanged(state, next)`,
replace-by-id in place — with three callers: show the optimistic row, accept the server's row, put the
original back. There is deliberately **no** `itemRolledBack`: a second function would be free to drift
from the one that applied the change, and rollback is precisely the branch that is never exercised by
a browser test.

It also fixed the `isPending` guard's ergonomics for free. `if (isPending(item))` reads as the rule;
`if (id < 0)` is the inline the predicate was exported to prevent.

### The merge that `??` would have broken

`itemWithChanges` is six explicit `=== undefined` spreads rather than six `??`. This is the same
distinction `exactOptionalPropertyTypes` was switched on for, one layer up: `changes.hook ?? item.hook`
treats `null` as "no opinion", so **every clear becomes a no-op**. A drag back to the backlog would
appear to do nothing; an item would never let go of its platform. Nothing would fail — not the build,
not the types, not a test that only ever sets values.

The wire half is asserted directly: an omitted field is absent from the request body, an explicit null
is present *as null*. Those are two different requests to a backend reading `model_dump(exclude_unset=True)`.

### `reload()` still has no caller, for the second time in a row

Phase 3 predicted T044. Phase 4 recorded that prediction as wrong and offered T051. Wrong again — an
optimistic edit reconciles against the `PATCH` response, so there is nothing left to re-read. Both
predictions failed the same way: they assumed a write implies a refetch, which is exactly what R-007
rejects.

### The find: a rules file telling the next agent to reintroduce a bug

`frontend/AGENTS.md` carried, in its Traps section, the Phase 3 `reviewer`'s recorded fix for
`itemsLoaded` — "handle it by merging on id rather than widening the pending check". The Phase 4
checkpoint closed that hole with `savedSince` and wrote, in the **Decisions table of the same file**,
that a merge-by-id is forbidden because absence from a response is how a deletion arrives.

So the file disagreed with itself, ~100 lines apart, and the stale half was the one phrased as an
instruction. T050 landed `DELETE` two days later and T056 will call it, which is the moment the
instruction stops being merely stale and starts costing a deleted item that never leaves the screen on
any device but the one that deleted it.

This is the Phase 4 CRITICAL's pattern exactly — an amendment applied to one artifact — with two
differences worth recording. It was in a **rules** file rather than a spec, so no `/speckit-analyze`
pass would read it. And the amendment that superseded it landed *in the same file*, which is the case
the "grep the claim, not the file you happened to open" rule is weakest against: the file **was** open.

Fixed in this MR: removed from AGENTS.md rather than annotated, so nobody reads it again, and the
Phase 3 record in `tasks.md` — a log, so it keeps its history — gained a superseded-by pointer at the
paragraph itself rather than only at the Phase 4 entry that overturns it.

## T052 — the item sheet, and a bug that compiled, tested green, and did nothing

The surface whose absence would have left every item stuck in `idea` forever. `ItemSheet.tsx` carries
title, hook, status, platform and date; chips became buttons on all four surfaces; `CalendarShell`
owns which item is open. 27 new tests — **258 → 285 frontend, none skipped.**

### The save model was the one real design decision

The export draws `SAVE CHANGES`, so an explicit save was the starting assumption — but the reason to
keep it is in the *backend*. `check_invariant_1`'s docstring says both callers pass the item as it
would be **after** the change, "never as stored", because validating an incoming status against the
stored platform would refuse `{"status": "draft", "platform": "tiktok"}` on a title-only idea and
leave no single request that can advance it.

That sentence only pays off if the frontend actually sends both fields together. Per-tap saves — which
"optimistic updates" and "the cue updates immediately" both gently suggest — would make the first tap
a guaranteed 409, and **SC-012 asks precisely that the creator not meet a refusal they cannot resolve
from the surface they are on.** The cheapest way to honour it is to not produce the refusal. So: one
tap, one `PATCH`, carrying a diff.

The optimism is not lost. It moved one layer down: `updateItem` applies the change to the store the
moment save is tapped, so the chip's cue updates before the request returns. A test asserts that
against a route that is **never fulfilled**, because against a real answer it could not tell optimism
from a fast round trip.

### The draft is a `ContentItem`, and that removed a whole class of conversion

The obvious form shape is `{title: string, hook: string, ...}` with `"" ↔ null` conversions on the way
in and out. Holding a whole `ContentItem` instead means the sheet renders the same shape it diffs, the
diff's inverse (`itemWithChanges`) reproduces it, and the null — which **is** FR-023's "clear this
field" — is only converted once, at the `onChange` of each text input.

Two draft-lifecycle bugs fell out of it, one caught by reasoning and one by a test:

- Reset on the **id**, not the object. The store replaces an item's object on every optimistic edit,
  so identity-keyed reset would discard the creator's typing at the moment their own save landed.
- Reset to null **on close**. Missed on the first pass: closing and reopening the same item kept the
  abandoned draft, so an edit explicitly walked away from reappeared looking saved.

### The find: an optional prop passed through a JSX spread

`exactOptionalPropertyTypes` forbids passing an explicit `undefined`, so an optional handler has to be
threaded as `{...(x === undefined ? {} : { onOpen: x })}`. Three of those went to components whose prop
is named `onOpenItem`, not `onOpen`.

**It compiled.** JSX spread expressions skip excess-property checking, so the wrong key was neither an
error nor a warning. `pnpm build`, `typecheck` and `lint` were all clean. The month grid and the week
list simply did not open anything, and the peek strip — the one site that happened to be right — did,
which is why five e2e tests failed and fifteen passed.

The fix was not to correct three names. It was to make **`onOpen` and every `onOpenItem` required**,
which deletes all six spreads and turns the same mistake into a build error. Optionality had bought
nothing anyway: a chip the creator cannot open is a bug now that the sheet exists.

Worth generalising, because `exactOptionalPropertyTypes` is switched on across this project and the
spread is its standard workaround: **a conditional spread is a hole in prop typing.** Prefer making
the prop required where every call site has a value.

### Two places the export is knowingly not followed

Both are `.claude/rules/design.md` overriding the picture, and both now have assertions:

- **44px, not 40px**, on the six status and platform options. They sit in the densest part of the
  sheet, which is exactly where a missed tap is most likely.
- **A CLEAR button beside the date**, which the export does not draw. A native date input's own clear
  affordance is platform-dependent and absent on several mobile browsers, and without it the tap path
  could schedule but never *un*schedule — leaving T054's drag as the only way back to the backlog,
  which is the pointer-only dependency SC-011 forbids.

### Screenshotted at 375px, and the first one was a lie

The Tailwind trap makes a screenshot mandatory after any restyle. The first pair was taken against a
`pnpm start` serving a bundle built **before** the last edit — the change under inspection was not in
the artifact being inspected. Rebuild between the edit and the shot, or the step verifies the previous
commit. The real shots show the sheet correct: the status/platform columns, the overdue dashed **left**
border on the date field with its note, and the DATE label peeking above the fold, which is a decent
accident — it signals the body scrolls.

One measurement trap recorded in `frontend/AGENTS.md`: the sheet enters on a 200ms `translate-y`, so a
`boundingBox()` taken the instant `toBeVisible()` resolves is 40px off. `toBeInViewport()` retries.

## T053 — a 409 is an instruction, and the interesting word is "reachable"

Four tests, written red first. **285 → 289 frontend, none skipped.**

T052 already rendered the backend's sentence and already put the platform control one column from the
status control, which is the layout half of FR-009a. What was missing is smaller than it sounds and
matters more: **which control resolves this refusal**, said in something other than prose.

The two codes are not decoration. `check_invariant_1` raises one condition under two names precisely
because the creator's next step differs — `platform_required` is fixed in the platform column,
`platform_locked` in the status column, because the instruction is literally "move this back to ideas
first". So the sheet marks the group that resolves it and moves focus there, matching on `code` rather
than on the message text, which keeps a reworded backend sentence from changing behaviour.

**The word that made this more than a colour change is "reachable".** SC-012 says a refusal must be
resolvable from the surface the creator is already on, and T052's sheet scrolls its body at 667px —
so when the refusal arrives while they are on the date field, the platform column is *adjacent* and
*off screen*. Moving focus scrolls it back and puts the keyboard on the answer, which is also the
FR-015b path. Adjacency alone would have satisfied a reading of the task and not the requirement.

Two smaller decisions:

- **Any edit clears the refusal.** It described a save attempt that no longer matches the draft;
  leaving it up has the sheet arguing with a change the creator has already made.
- **A non-409 marks nothing.** A 502 is not an instruction, and marking a control would tell the
  creator to change something that was never the problem. Asserted, because "highlight on error" is
  the natural way to write this and it is wrong.

Colour does carry the label's emphasis, and that is safe here rather than an SC-004 problem: the
message says which control and why in words, and focus has already moved there. Screenshotted at
375px — PLATFORM in brand red, the instruction beneath, the fix one column right.

## T054 + T055 — the drag path, and a spec that had been overtaken by a later decision

One merge request for two tasks, and it is the recorded exception rather than a slip: a drag whose
sensor has no activation constraint **silently reschedules items a creator was only trying to scroll
past**, so shipping T054 alone would put a data-loss hazard on `main` for the length of one MR. Same
shape as T043–T044 — the second task is the first one's safety, not a follow-up.

9 new tests. **289 → 298 frontend, none skipped.**

### What is automated, and what is deliberately not

R-003 says outright that the E2E flow drives **taps**, because drag automation is the flakiest thing
in a browser suite and a flaky gate gets disabled — which would violate principle VI. So the *journey*
is not dragged. What is asserted is what a hand-walk cannot check cheaply: the wiring, the activation
constraint (invisible to a walkthrough that happens not to swipe over a chip), and **one** deliberate
drag, because it is the only way to assert that a drop and a tap produce the *same request*. Quickstart
V4 stays the gate for how it feels on a finger.

### The default collision detection scheduled the wrong day

dnd-kit intersects the **dragged overlay's rectangle** with the droppables. The overlay is a `full`
chip; a day cell is 53px wide. So the ghost overlaps three or four days at once and the first
intersection wins — a drag aimed at the 12th scheduled the 13th, and the test caught it on the first
run.

`pointerWithin` is the fix and it is the right rule anyway: the drop target is the cell **under the
finger**, which is the only rule a creator can predict. It also returns nothing outside every
droppable, so a drop into empty space is correctly no change rather than a nearest-neighbour guess.

Worth keeping: this is a case where the *bigger* affordance (a readable full-size ghost) made the
*smaller* target ambiguous. Rectangle-based collision is fine when the dragged thing is the size of
what it lands on, and wrong the moment it is not.

### The find: R-003 asked for something T052 had already made impossible

R-003 says register `PointerSensor` **and `KeyboardSensor`**. dnd-kit's keyboard activation codes are
`Space` and `Enter` — verified in `node_modules`, not assumed. And **T052 made the item chip a
`<button>`**, because tapping it opens the sheet.

So registering the sensor makes `Enter` on a focused chip start a drag instead of opening the sheet:
the **primary** editing path becomes unreachable from a keyboard in order to make the **secondary**
one reachable. That is exactly backwards, and R-003 itself designates the tap path the primary one.

Checked against the requirements rather than settled on taste, because `specs/` outranks code:

- **FR-015b** — every date and status change reachable *without a pointer-drag gesture*. Satisfied by
  the sheet's date input.
- **SC-011** — the whole `idea → posted` journey completable without a single drag. Same.

Neither asks for a *drag performed by keyboard*. So the spec is what is wrong, and it was amended:
`research.md` R-003 carries the amendment with its reasoning, `tasks.md` T054's line carries it too,
and `ItemChip` strips dnd-kit's `onKeyDown` from the listeners it spreads so the button's own
behaviour is what runs. A test asserts `Enter` opens the sheet, which is the whole amendment in one
line.

**Three artifacts in one merge request, deliberately** — this is the Phase 4 CRITICAL's lesson applied
before it could bite rather than nine tasks later.

### Smaller things

- `useDraggable({disabled})` still emits `role="button"`, `tabindex="0"` and `aria-disabled`, so the
  attributes are spread **only** on a row that can be dragged. A pending row is not a disabled button;
  it is not yet a control.
- A drop back on the item's own day returns early. A no-op is not an empty `PATCH`, which the backend
  refuses with a 422 — a creator who picks a chip up and changes their mind must not see an error.
- The drawer's copy is restored to the export's full line now that the drag it promises exists.

Screenshotted at 375px mid-drag: the ghost dashed on **all four** sides, the target cell in a solid
ring, the source row dimmed in place. The four-versus-left distinction is what `overdue.spec.ts`
guards with `borderTopStyle === "solid"`.

## T056 — the delete confirmation, and where a 404 stops being an error

20 new tests (9 pure, 11 browser). **298 → 318 frontend, none skipped.** `shadcn add alert-dialog`
succeeded cleanly this time — the half-succeeding `init` recorded in `frontend/AGENTS.md` did not
recur.

### FR-020 is three requirements wearing one sentence

*"Deleting an item MUST require an explicit confirmation and MUST NOT be reachable by a single tap or
by a gesture used for common navigation."* A dialog that merely exists satisfies the first and neither
of the others, so each got its own mechanism and its own assertion:

1. **Explicit** — an `AlertDialog`, not a `Sheet`. Focus trap, `role="alertdialog"`, no dismissal by
   clicking outside. A sheet can be swiped or scrimmed away, which is the failure being prevented.
2. **Not one tap** — chip, `DELETE ITEM`, `DELETE PERMANENTLY`. Three deliberate taps from the
   calendar, and a test counts them.
3. **Not next to a common gesture** — `KEEP ITEM` first in the DOM and focused on open, so `Enter`
   keeps the item; `Escape` too. The destructive action sits *below*, outlined rather than filled.

The export's own footnote said all of this in one line — *"Keep is focused by default. Delete is the
lower, unstyled-weight action — no swipe or back gesture reaches it."* Worth noticing that the design
had already done the requirements analysis.

### The restore question, deferred at T051 and answered here

A refused delete has to put the row back, and the obvious way is a remembered index. That is wrong in
a way that only shows up under load: an index captured before the removal is stale the moment anything
else lands, and restoring to a stale index puts the row somewhere it never was. It also needs the index
captured *inside* a `setState` updater, which is a side effect in a function React may invoke twice.

`itemRestored` re-derives the position from the list's own ordering instead — `created_at DESC, id
DESC`, the server's, which is total, which is the same fact that lets `selectBacklog` filter without
sorting. Nothing is captured, it is correct whatever happened in between, and it is a pure function
with eight tests including the two boundaries and the tie-break.

This is also the second payoff of `updateItem`/`deleteItem` taking the **row** rather than an id: the
argument is the restore value.

### A 404 stops being an error one layer above the transport

T050 settled that the backend answers 404 for a missing id rather than an idempotent 204 — right for
an API, and `lib/api.ts` still throws. But `deleteItem` in the store **resolves** on it, because this
call is reconciling a *screen* rather than committing a transaction: the creator asked for the item to
be gone, and it is gone. An error message describing success is the worst of both.

The general shape is worth keeping: the transport reports what happened; the layer that knows the
story decides what it means.

### One asymmetry that looks like an inconsistency

`CalendarShell` holds the **id** of the item being edited and the **row** of the item being deleted.
Both are forced, in opposite directions. The store replaces an item's object on every optimistic edit,
so a captured row would be stale for the sheet. The optimistic *delete* removes the row from `items`
immediately, so an id lookup would go null the instant the request left — closing the dialog before it
could render a refusal.

Screenshotted at 375px. Both buttons clear 44px, the chip in the dialog carries its status cue and
platform monogram, and the page does not scroll sideways.

## T057 + T058 — the one E2E flow, and a control no test can click

One merge request: T058 is literally "add two assertions to the file T057 creates". 3 tests.
**318 → 321 frontend, none skipped.** Phase 5's implementation is complete.

`tech-defaults.md` budgets exactly one E2E flow for v0.1 and this is it. Every other file in
`tests/e2e/` asserts one surface; this is the only thing that asserts they **compose**.

### The stub had to become a small server

Every other e2e file answers with a canned body, which is right when the subject is one surface. This
flow *mutates*: the item it captures is the one it later schedules and advances, and "the calendar
shows a `posted` item on the 12th" is worth nothing if the stub would have said `posted` to anything.

So the route handler keeps rows and applies `PATCH` bodies with the backend's `exclude_unset`
semantics — `Object.assign` does exactly that, because `JSON.parse` yields only the keys that were
sent. That makes "only what changed was sent" observable from the *other end* rather than by
inspecting the request. It deliberately does **not** enforce INV-1: the backend's tests cover the
invariant in both directions, and a second implementation here would be testing the stub.

### T058's second assertion is a test, not a comment

"The journey completes with no drag gesture" is easy to write as a comment above a list of clicks. It
is worth more as **the same journey performed entirely with the keyboard** — a keyboard cannot produce
a drag, so a journey finished that way is one no drag was needed for.

It also has a second job: it is the test that fails first if anyone re-registers dnd-kit's
`KeyboardSensor`, because `Enter` on a chip would start a drag instead of opening the sheet. The T054
amendment to R-003 now has a guard rather than only a paragraph.

The first assertion — the URL never changes — is SC-002 read literally. "Zero navigations to a
separate detail page" is a claim about the address bar, so it is asserted as one: a sheet is not a
page; a route would be.

### The find: `MONTH` is a control no automated test can click

The third test switches month → week → month, and the second `view-month` click timed out with
`<nextjs-portal> … intercepts pointer events`.

This is the dev-overlay trap already recorded at the Phase 4 checkpoint — but recorded as a *hand-walk*
problem, with the fix "use a production build". What T057 shows is that it is **also a CI fact**:
`playwright.config.ts`'s `webServer` runs `next dev`, so the overlay is over the `MONTH` toggle in
every pipeline too.

> **[Correction, 2026-08-03] The paragraph above is wrong, and Phase 4 was right.**
> `playwright.config.ts` runs `` `${process.env.CI ? "pnpm start" : "pnpm dev"}` ``: CI has always
> served the production bundle, so no pipeline has ever had the overlay. T057 widened a local trap
> into a CI one without reading the config, and the wrong version propagated to `CLAUDE.md`,
> `frontend/AGENTS.md`, `tasks.md` and the `pipeline.spec.ts` call-site comment — four artifacts —
> while the correct Phase 4 wording sat untouched in `tasks.md` the whole time. Left in place rather
> than rewritten because this file is a record of what was believed when; the rule now lives in
> `frontend/AGENTS.md`.

It went unnoticed for a reason worth remembering: **no test before this one had ever clicked `MONTH`**.
`view-week` is clickable, so `period-nav.spec.ts` exercises the toggle in one direction and stops.
The gap was invisible because the half that works is the half every test happened to use.

`dispatchEvent("click")` is the workaround here, with the reason at the call site — the obstruction is
a development artifact no creator will ever have, and the subject under test is what the toggle
*does*. But the general problem stands and belongs in the Phase 5 checkpoint: **a control that no
automated test can click is one restyle away from being broken with the suite still green.** The real
fix is running the suite against `pnpm start`, which is a `playwright.config.ts` change with a cost
(every run rebuilds) and is not T057's to make.

## The Phase 5 checkpoint — three gates, and the contract was stale again

**Three findings across three gates, all fixed in the checkpoint's own merge request.** 322 frontend
and 238 backend tests, nothing skipped.

### The hand-walk was the cheapest gate and the most convincing

21 checks at 375px on a production build against a live stack — browser → proxy → FastAPI → Postgres,
nothing stubbed, signed in as the seeded creator. All 21 passed. The whole of V4 works end to end, the
drag half produced the same scheduled date as the tap half, changes survived a reload *and* a fresh
sign-in, and **V9 placed five ideas onto five days in 4.9s** against SC-008's 60-second budget.

Worth stating plainly because the suite cannot say it: every frontend test stubs the proxy, so a green
run is evidence about the frontend in isolation. This walk is the only thing in the project that
exercises the seam.

### F1: the contract cited a requirement as authority for a claim that requirement denies

`contracts/openapi.yaml`'s `PATCH` description: *"A drag and a tap produce the identical request with
one field set (FR-014a, **FR-015a**)."* True for a **date**. False for a **status** — FR-015a was
amended in the post-review clarification to read *"Status is not draggable"*, because a status drag has
nowhere to drop at 375px without the horizontal scroll FR-021 forbids, and lanes are a second core
capability constitution principle III does not permit.

So the sentence conflated the two axes *and* cited as its authority the very requirement that
contradicts it. This is the Phase 4 CRITICAL's pattern for the second time in two phases: **the
contract is where an overturned decision survives longest.** It is the artifact least often opened
while building a surface, and the one that outranks code when someone does open it.

The rule earns its keep: grep the claim, not the file. `"drag and a tap"` and `"identical request"`
across `specs/` and both `AGENTS.md` found exactly one occurrence, which is why the fix is a single
paragraph rather than a sweep.

### F2: the reviewer found a cue that was missing rather than wrong

`DeleteConfirm` rendered its `ItemChip` without `today`. `ItemChip` defaults `today` to `null` and
`isOverdue(item, null)` is false — so an overdue item in the delete dialog quietly lost its dashed
border. Nothing failed. No test covered it. The dialog's own justification, written one task earlier,
is *"the status cue and platform monogram are how they check it is the right one"* — and overdue is
part of that context, on exactly the item a creator is most likely to be deleting.

Two things about the fix are worth more than the fix. `today` is now **required** rather than
defaulted on this component, so the next surface cannot omit it the same way. And the test was
**verified red before the fix** by reverting one line — a test written after a fix that was never
observed failing is a test of nothing.

This is also a good example of what the `reviewer` gate is *for*: an omission, in a default, on a path
no assertion reached. `/speckit-analyze` reads artifacts against each other and could never see it.

### F3: a checkpoint gate that could not be run at its own checkpoint

Quickstart V4 step 2 asked the creator to paste a published link. The link field is **T064 — US5,
Phase 7** — and `tasks.md` makes V4 a **Phase 5** gate. The step was also absent from V4's own *Proves*
list (no FR-019), so it was over-specified rather than load-bearing.

Small, but it is a *gate* that could not be completed at the phase that runs it, and the failure mode
is a future agent either building T064 early to satisfy it or quietly skipping a step and calling the
gate passed.

### Recorded, not fixed: a control no automated test can click

The `MONTH` toggle. Next's dev overlay covers it at 375px, and `playwright.config.ts` runs `next dev`,
so this is true in CI too — not just in a hand-walk, which is how the Phase 4 checkpoint recorded it.

> **[Correction, 2026-08-03]** The second clause is false and the Phase 4 record was right — CI runs
> `pnpm start`. See the correction earlier in this T057 entry.

It went unnoticed until T057 for a reason worth generalising: **no test had ever clicked it.** `WEEK`
works, so the toggle was exercised in one direction only, and the gap was invisible because the half
that works is the half every test happened to use. A control that no automated test can click is one
restyle away from being broken with the suite still green.

The real fix — running the suite against `pnpm start` — rebuilds on every run and belongs with T069's
overlay audit, not here.
