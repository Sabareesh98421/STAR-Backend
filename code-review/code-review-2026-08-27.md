# STAR backend — file classification + code review

Date: 2026-08-27 · Branch: `main` (working tree, uncommitted restructure included)
Scope: all 95 non-generated files under `src/` (1,809 LOC). `src/generated/prisma/**`
(8 files) excluded — Prisma output, not hand-written.

---

## Part 1 — File classification

Six buckets. **Logic** = does something. **Shared** = cross-module primitive.
**Barrel** = re-export only, zero behavior. **Config** = env reading. **Contract**
= schema/type/route declaration. **Spec** = test. **Stub** = empty body.

### Summary

| Bucket | Files | LOC | Notes |
|---|---:|---:|---|
| Logic | 22 | ~600 | The actual application |
| Shared | 20 | ~230 | `shared/errors`, `shared/http`, `shared/types`, `try-catch` |
| Barrel (import-only) | 24 | 88 | 22 pure re-export, 2 hide a singleton |
| Config | 11 | 96 | 10 config objects + `env.util.ts` |
| Contract (schema/route/types) | 9 | ~110 | Zod schemas, Elysia routers, interfaces |
| Spec | 9 | 488 | 27% of the codebase is tests |
| Stub (empty) | 4 | 11 | Exported through barrels as if live |

### Full listing

**Config — `src/config/` (11)**

| File | Class | Note |
|---|---|---|
| `app.config.ts` | config | |
| `database.config.ts` | config | |
| `redis.config.ts` | config | |
| `mailer.config.ts` | config + **logic** | `resolveTestTransport()` is a branch, not a read — see F4 |
| `otp.config.ts` | config | |
| `signup.config.ts` | config | |
| `server.config.ts` | config | |
| `password.config.ts` | config | value read by nobody — see F9 |
| `logger.config.ts` | config | leaks `undefined` past the boundary — see F16 |
| `env.util.ts` | **shared util** | mis-filed; it's a parser, not config |
| `index.ts` | barrel | pure |

**Infrastructure — `src/infrastructure/` (12)**

| File | Class | Note |
|---|---|---|
| `database/client.ts` | logic | connect/get/disconnect singleton |
| `database/repositories/user.repository.ts` | contract | interface + record types |
| `database/repositories/user.repository.prisma.ts` | logic | own P2002 handler — see F12 |
| `database/utils/prisma.error.ts` | logic | **dead** — see F12 |
| `database/utils/prisma.error.spec.ts` | spec | tests dead code |
| `database/utils/index.ts` | barrel | pure |
| `database/index.ts` | barrel + **side effect** | constructs `userRepository` singleton |
| `logger/server.log.ts` | logic | |
| `logger/index.ts` | barrel | pure |
| `mailer/client.ts` | logic | lazy transporter |
| `mailer/index.ts` | barrel | pure |
| `redis/client.ts` | logic | |
| `redis/index.ts` | barrel | pure |

**Auth module — `src/modules/auth/` (25)**

| File | Class | Note |
|---|---|---|
| `providers/email/email.router.ts` | contract | `/signout` is `()=>{}` |
| `providers/email/email.schema.ts` | contract | |
| `providers/email/password.schema.ts` | contract | |
| `providers/email/index.ts` | barrel | pure |
| `providers/OTP/otp.store.ts` | **logic** | the best code in the repo — and F6/F7 |
| `providers/OTP/otp.service.ts` | logic | |
| `providers/OTP/otp.mailer.ts` | logic | |
| `providers/OTP/otp.generator.ts` | logic | |
| `providers/OTP/otp.router.ts` | contract | |
| `providers/OTP/otp.schema.ts` | contract | |
| `providers/OTP/index.ts` | barrel | pure |
| `providers/OTP/*.spec.ts` (4) | spec | 277 LOC, the real coverage |
| `service/email.signup.ts` | logic | |
| `service/email.signup.store.ts` | logic | |
| `service/email.logout.ts` | **stub** | empty |
| `service/login/email.signin.ts` | **logic, live, untested** | F1–F3 |
| `service/login/index.ts` | barrel | 1 file behind a barrel |
| `service/passwordHandler/email.forgotpassword.ts` | **stub** | empty |
| `service/passwordHandler/email.resetPassword.ts` | **stub** | empty |
| `service/passwordHandler/index.ts` | barrel | 2 stubs behind a barrel |
| `service/password/password.util.ts` | shared util | F8, F9 |
| `service/password/index.ts` | barrel | 1 file behind a barrel |
| `service/index.ts` | barrel | 3-deep chain — F14 |
| `shared/otp.purpose.ts` | contract | |
| `shared/email.signup.types.ts` | contract | |
| `shared/index.ts` | barrel | pure |
| `routes/router.ts` | contract | |
| `routes/index.ts` | barrel | pure |

**Shared — `src/shared/` (23)**

| File | Class | Note |
|---|---|---|
| `errors/app.error.ts` | shared | base class |
| `errors/app.error.codes.ts` | shared | enum |
| `errors/elysia.error.codes.ts` | shared | enum |
| `errors/domain/*.ts` (5) | shared | 5 subclasses, ~10 LOC each |
| `errors/infrastructure/*.ts` (2) | shared | |
| `errors/{,domain/,infrastructure/}index.ts` (3) | barrel | pure |
| `http/response.ts` | shared | **F5 — no content-type** |
| `http/responseHelper.ts` | shared | |
| `http/resolveAppError.ts` | shared | |
| `http/httpsresponse.errorcode.ts` | shared | filename typo (`https` → `http`) |
| `http/index.ts` | barrel | pure |
| `types/httpResponse.types.ts` | contract | optional fields — F16 |
| `types/common.types.ts` | contract | 2 of 3 types **unused** |
| `types/index.ts` | barrel | pure |
| `utils/try-catch/try-catch.ts` | shared | the project's error spine |
| `utils/try-catch/try-catch.types.ts` | contract | |
| `utils/try-catch/index.ts` | barrel | pure |
| `workers/worker.ts` | shared | **dead** — F13 |
| `workers/worker.spec.ts` | spec | tests dead code |
| `workers/index.ts` | barrel | pure |

**Server / socket / scripts (10)**

| File | Class | Note |
|---|---|---|
| `server/server.ts` | logic | bootstrap, port walk, shutdown |
| `server/router.ts` | logic | request log + `onError` mapping — untested, F18 |
| `socket/handlers/wsConnection.ts` | logic | echo placeholder, F11 |
| `socket/handlers/wsHandler.types.ts` | contract | |
| `socket/handlers/index.ts` | barrel + **side effect** | constructs `wsHandler` |
| `socket/routes/router.ts` | contract | no auth on `/ws` |
| `socket/routes/index.ts` | barrel | pure |
| `socket/index.ts` | barrel | pure |
| `scripts/preload.ts` | logic | gitignored, dev-only |

### What the classification says on its own

- **24 barrels for 95 files.** One in four files exists only to re-export.
  Three of them (`service/login/`, `service/password/`, `service/passwordHandler/`)
  front a single file each. Two are not barrels at all — they construct
  singletons, so an "import-only" file has a side effect on import.
- **Tests are 27% of LOC, but concentrated in the wrong place.** 277 of 488 spec
  lines cover OTP. The live `/signin` endpoint has zero. Two spec files (107 LOC)
  test code nothing imports.
- **`shared/` is 20 files for 230 LOC** — an average of 11 lines each. Five error
  subclasses that differ only in status code and name is a lot of files for a
  three-line idea, though each one is genuinely used.

---

## Part 2 — Code review

Typecheck is clean (`tsc --noEmit`, exit 0). Findings are ranked by what they
cost if left alone.

### Blockers

**F1 — `/signin` is an email-enumeration oracle.**
`src/modules/auth/service/login/email.signin.ts:19,22`

An unknown email returns `404` with body message `User Not Found with id
'<the email>'`. A known email with a wrong password returns `409 email or
password is incorrect`. Status, message, and body all differ, so anyone can
enumerate registered addresses at HTTP speed.

The comment on lines 16–17 argues this is deliberate and that "zod-gatekeeping"
makes the two indistinguishable. It doesn't — Zod validates the *shape* of the
request, and has nothing to say about whether a row exists. `plans/auth-signin-session.md`
step 4 already specifies the fix: one identical `UnauthorizedError('Invalid
email or password')` for both branches. Keep the internal split if it helps
readability, but both must return the same response object.

**F2 — `/signin` succeeds without issuing anything.**
`src/modules/auth/service/login/email.signin.ts:25`

`response(success())` — 200, `data: null`. The route is live in
`email.router.ts:9`. A client that authenticates successfully receives nothing it
can present on the next request, and nothing in the codebase represents a
session. Either land steps 1–4 of `plans/auth-signin-session.md`, or take
`/signin` off the router until they land. A live endpoint that appears to work
and doesn't is worse than a 404.

**F3 — Wrong status code and an off-enum error code on the same line.**
`src/modules/auth/service/login/email.signin.ts:22`

```ts
new AppError("email or password is incorrect", "creds mismatch", 409)
```

`409 Conflict` for bad credentials should be `401`. And `"creds mismatch"` is a
free-form string in the `code` slot, where every other call site in the repo
passes an `AppErrorCode` member — CLAUDE.md puts error codes in one exported
enum precisely so this can't happen. This code reaches the client verbatim in
`failure()`'s `error.code`.

**F4 — The mail-safety comment describes behavior the code does not have.**
`src/config/mailer.config.ts:4-12`

The comment states: *"Under NODE_ENV=test this is forced on and
MAIL_USE_TEST_TRANSPORT is ignored"*. The code:

```ts
if (process.env.NODE_ENV === "development") return true;
if (process.env.MAIL_USE_TEST_TRANSPORT) return process.env.MAIL_USE_TEST_TRANSPORT === "true";
return process.env.NODE_ENV !== "production";
```

`NODE_ENV=test` is not checked anywhere. With `MAIL_USE_TEST_TRANSPORT=false` in
a developer's `.env` — which `.env.example` explicitly invites — `bun run test`
sends real SMTP mail to `otp-router-test@example.com` and every other fake
address the suite uses. That is exactly the bounce storm and quota burn the
comment claims is impossible, and the person who set that variable did so for
`bun run dev`, not for the test suite. Add `if (process.env.NODE_ENV === "test")
return true;` as the first line.

**F5 — Every API response ships with no `content-type`.**
`src/shared/http/response.ts:5`

```ts
new Response(JSON.stringify(body), { status, statusText })
```

Verified under Bun: `r.headers.get("content-type")` is `null`. Not
`application/json`, not even `text/plain` — absent. `fetch().json()` tolerates
it, which is why the specs pass, but axios and most typed HTTP clients will hand
the caller a raw string, and API tooling can't introspect the responses. This is
every success and every failure the API produces. One-line fix:

```ts
headers: { "content-type": "application/json" }
```

**F6 — Signup mails OTPs to already-registered addresses.**
`src/modules/auth/service/email.signup.ts:11-18`

`signupService` never checks Postgres. Any email — including one that already has
a `User` row — gets a pending record parked in Redis, and the subsequent
`/otp/request` passes the `hasPendingSignup` guard and mails a code. The
duplicate is only caught at `/otp/verify`, when `userRepository.create` hits
P2002 and returns 409.

Two costs: the server can be induced to mail arbitrary registered addresses, and
a legitimate user burns a full request→mail→verify round trip to be told they
already have an account. Add a `findByEmail` guard in `signupService`.

Note the trade-off: a bare `409 already exists` on `/signup` is itself an
enumeration oracle. The standard resolution is to return the same 201 either way
and send a *"someone tried to sign up with your address"* mail instead of an OTP.
At minimum, stop issuing a verification code for an address that can never
consume it.

### Correctness

**F7 — `consumeOtp`'s attempt cap is not atomic.**
`src/modules/auth/providers/OTP/otp.store.ts:73-89`

`hgetall` → compare against `MAX_ATTEMPTS` → `hincrby` is three round trips. N
concurrent verify requests all read the same `attempts` value before any
increment lands, so the cap can be overshot by roughly the concurrency factor —
20 parallel guesses against a 5-attempt limit all get evaluated. For a 6-digit
code this widens the window meaningfully.

`saveOtp` and `discardOtp` already use a Lua script for exactly this class of
race (`DISCARD_IF_MATCHING_TOKEN`). The brute-force counter is the one that most
needs the same treatment: move read/compare/increment/delete into one script.

**F8 — `timingSafeEqual` can throw a 500 on malformed stored data.**
`src/modules/auth/providers/OTP/otp.store.ts:83`

`timingSafeEqual` throws `RangeError` when the two buffers differ in length. Both
sides are sha256 digests today so it holds — but the left side is
`Buffer.from(record.hash, "hex")`, read back from Redis. A truncated or non-hex
value produces a short buffer and an unhandled `RangeError`, which
`toAppError` turns into a generic 500 rather than the 400 this is. Check
`record.hash.length` before the compare.

**F9 — A bcrypt hash is computed at module load, and it's dead.**
`src/modules/auth/service/password/password.util.ts:10-14`

```ts
const ABSENT_USER_HASH = await hashPassword(crypto.randomUUID());
```

Top-level `await` of a bcrypt cost-10 hash — roughly 100ms, paid at import by
every chain that touches `@/modules/auth/service`, including every spec run.

It buys nothing. `verifyPassword` computes `matches` against the dummy and then
discards it (`return stored === null ? false : matches`), and the only caller,
`email.signin.ts:18`, has already returned 404 before it could pass `null`. The
constant-time defense is unreachable, and the leak it was meant to close is
F1 — which lives one function up and isn't about timing at all.

Once F1 is fixed properly (single 401, always run the verify), this becomes the
right shape. Until then it's dead weight on every boot.

**F10 — Two password-hashing algorithms in one flow.**
`src/modules/auth/service/email.signup.ts:12`, `src/scripts/preload.ts:63`

Signup calls `Bun.password.hash(body.password)` raw → argon2id defaults (verified:
`$argon2id$` prefix). `password/password.util.ts` `hashPassword` uses bcrypt at
`passwordConfig.cost`. Nothing breaks — `Bun.password.verify` auto-detects the
algorithm from the stored prefix — but:

- `PASSWORD_HASH_COST`, documented in `.env.example`, controls nothing.
- `hashPassword` is imported by its own spec and by `ABSENT_USER_HASH`. Nothing
  in production uses it.
- The dummy hash in F9 is bcrypt while real hashes are argon2id, so even if it
  were reachable, the timing profiles wouldn't match.

Signup should call `hashPassword`. (Bun's bcrypt pre-hashes, so the 72-byte
truncation problem does not apply here — verified against the schema's 1000-char
ceiling.)

**F11 — Two small dead paths.**

- `src/server/router.ts:70-72` — `.get('/')` calls `console.log`, bypassing the
  pino logger the rest of the file uses, and implicitly returns `undefined`
  (empty 200 at the API root).
- `src/socket/handlers/wsConnection.ts:15-17` — `onClose` calls `ws.send()` on a
  socket that has already closed. The message goes nowhere.

### Structure

**F12 — Two independent Prisma error translators; the better one is dead.**

`src/infrastructure/database/utils/prisma.error.ts` — 61 lines, 8 Prisma codes
mapped, exported from a barrel, tested by a 66-line spec — is imported by nothing
except that spec. Meanwhile `user.repository.prisma.ts:10-15` hand-rolls its own
P2002 resolver. If `toDatabaseError` is the intended design, wire it into the
repository and delete the local resolver. If it isn't, delete the file and its
spec. Two answers to one question is how they drift.

**F13 — Dead exports carrying passing specs.**

- `shared/workers/` (`createWorker`, 14 LOC + 41-line spec) — used nowhere.
- `shared/types/common.types.ts` — `DeepPartial` and `Result` used nowhere.
- `uuid@^14.0.1` in `dependencies` — imported nowhere; the code uses
  `node:crypto`'s `randomUUID`. Drop the dependency.

Passing tests on unused exports read as coverage on the dashboard and guard
nothing in production.

**F14 — Import cycle through barrels.**

`providers/OTP/otp.service.ts:12` imports `@/modules/auth/service` →
`service/index.ts` imports `./login/email.signin` → which imports
`@/modules/auth/providers/email` → `email.router.ts` → back to
`@/modules/auth/service`. ESM tolerates the cycle today because everything
resolved during it is a function declaration; a `const` evaluated at module scope
inside that loop would be `undefined` at use. `otp.service.ts` wants three
functions from one file — import `../../service/email.signup.store` directly.

**F15 — Single-file barrels three deep.**

Reaching `signInHandler` goes `service/index.ts` → `login/index.ts` →
`login/email.signin.ts`. Same for `password/` and `passwordHandler/`. Three of
the 24 barrels front one or two files each and add nothing but a hop. Collapse
them.

**F16 — Four empty stubs exported as if live, one of them misspelled.**

`email.logout.ts`, `passwordHandler/email.forgotpassword.ts`,
`passwordHandler/email.resetPassword.ts` all have empty bodies and are exported
through `service/index.ts`. `/signout` in `email.router.ts:10` is `()=>{}` and
returns 200. The barrel exports `forgotPasswrod` (typo), the file's default is
named `forgotPassword`, and `email.resetPassword.ts`'s default is
`resetPasswword` (typo). Nothing calls any of them.
`plans/auth-signin-session.md` already says to leave the password stubs out of
the barrel until milestone 2 gives them bodies.

### Convention drift (against `CLAUDE.md`)

**F17 — `undefined` in our own types and helpers.** The stated rule is no
`undefined` anywhere in our own code, `null` for every absent value, with a
single exception for converting back at a third-party call site. Violations:

- `types/httpResponse.types.ts:20` — `statusText?: string` (also never used;
  `response.ts` derives it via `getStatusText`).
- `types/httpResponse.types.ts:13` — `error.details?: unknown`.
- `http/responseHelper.ts:4` — `success<T>(data?: T, ...)`.
- `config/env.util.ts:5` — `value: string | undefined`.
- `config/logger.config.ts:5` — `level: process.env.LOG_LEVEL` stored as
  `string | undefined` in one of our own config objects and carried all the way
  to `server.log.ts:7`. The third-party exception covers converting `null →
  undefined` *at the pino call*; the config object itself should hold `null`.

**F18 — Two styles for reading the same config.** `otp.store.ts:19` destructures
`otpConfig` into module constants at import time; `otp.service.ts:23` and
`otp.schema.ts:15` read `otpConfig.x` live. Besides the inconsistency, the
destructured copy freezes the values before any spec can override them.

**F19 — `async` on a wrapper that only returns a promise.**
`login/email.signin.ts:9` — `export default async function signInHandler` whose
body is a single `return TryCatch.of(...)`. The convention's wrapper is a
non-async one-liner; `async` here adds a second promise wrap for nothing.

**F20 — `.gitignore` has a bare `*.txt`.** It exists for `folder_structure.txt`,
but it will also silently swallow any future `requirements.txt`, `LICENSE.txt`,
or text fixture. Narrow it to the file you actually mean.

**F21 — `preload.ts:77-78` prints `DEV_OTP` to stdout.** Gated on
`NODE_ENV !== production` and the file is gitignored, so this is acceptable — but
it is the one place the "never log a secret's value" rule is broken, and worth
naming so it stays deliberate.

### Testing gaps

**F22 — `/signin` has no test plan and no spec.** It is live, security-sensitive,
and carries F1–F3. `CLAUDE.md` requires `docs/test-plans/auth-signin.md` before
the spec for a major feature; neither exists.
`plans/auth-signin-session.md` step 7 already lists what they should assert.

**F23 — The `purpose` enum fix landed without its test.**
`plans/auth-signin-session.md` step 0 pairs the schema change (done —
`otp.schema.ts:5` is now `z.enum(OtpPurpose)`) with a spec asserting
`purpose: "x"` → 400 and no key written. The schema half shipped; the assertion
that keeps it from regressing did not.

**F24 — `server/router.ts`'s `onError` mapping is untested, and it now reads a
TypeBox shape from Zod schemas.** That handler decides whether a bad body is a
400 or a 500, and it branches on `error.valueError?.path` — a TypeBox-shaped
field — while every router now passes Zod schemas via Standard Schema. If
`valueError` is absent under Zod, the branch degrades silently to `field: 'root'`
and `"Invalid request body"`, losing the per-field detail without failing
anything. Worth one spec that posts a malformed signup body and asserts a 400
with a populated `field`.

---

## What's genuinely good

Not a formality — these are load-bearing and shouldn't get refactored away:

- **`otp.store.ts`.** Codes hashed at rest, salted by the Redis key so the same
  code for two purposes hashes differently, an attempt cap, a cooldown lock taken
  *before* the write, and a compare-and-delete Lua script so a rollback can't wipe
  a concurrent request's newer code. F7 is the one gap in an otherwise careful
  piece of work.
- **`TryCatch`'s `NEXT`-vs-`throw` contract.** Coherent, documented, and it puts
  the fatal/recoverable decision in one place instead of every call site. The
  handler/service split it enables is followed almost everywhere.
- **`envNumber`.** Kills the `Number(x) || default` zero bug in one function
  rather than at nine call sites.
- **Specs import key builders instead of retyping formats.** `otp.router.spec.ts`
  imports `otpKey`/`cooldownKey`/`pendingSignupKey`, so a change to the key format
  breaks the test — which is the point.
- **`plans/auth-signin-session.md`** is a better plan than most shipped code has,
  and it independently names F1 and the `purpose` open-relay before this review did.

## Suggested order

1. F4 (one line, stops the test suite mailing strangers), F5 (one line, fixes
   every response).
2. F1 + F3 together — one identical 401, `AppErrorCode.UNAUTHORIZED`.
3. F2 — either finish the session work or unwire `/signin`.
4. F6 — `findByEmail` guard in signup.
5. F7, F8 — the OTP store's two real gaps.
6. F22, F23, F24 — the missing tests.
7. F12, F13, F15, F16 — deletions. Roughly 200 LOC and one dependency leave the
   repo and nothing changes at runtime.
8. Everything else as it's touched.
