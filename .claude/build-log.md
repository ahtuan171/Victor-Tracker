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
