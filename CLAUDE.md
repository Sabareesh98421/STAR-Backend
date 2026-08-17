# STAR backend

Bun + Elysia API, Prisma/Postgres persistence. Run: `bun run dev`. Test: `bun run test`
(Playwright Test runner, see below).

## Commit message conventions

One commit per file. One-line message: `<prefix>: <what changed>` — imperative,
lowercase, no trailing period. Prefixes ([reference](https://peyrone.medium.com/adding-custom-prefixes-to-your-git-commits-426bf7104713)):

- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting/whitespace, no logic change
- `refactor` — code change that's neither a fix nor a feature
- `perf` — a performance improvement
- `test` — adding or correcting tests
- `chore` — build process or auxiliary tool changes
- `build` — build artifacts or external dependencies
- `ci` — CI configuration/scripts

No `Co-Authored-By` trailer — commits are authored and pushed under the
user's own account only.

## Error handling conventions

- Use `TryCatch.of(fn).onError(resolver)` instead of a native `try { }
  catch { }` for anything that can fail and needs to react to it (I/O,
  Redis/DB calls, a step that must roll back on failure). It keeps the
  fatal-vs-recoverable distinction (`NEXT` vs `throw`) and the `toAppError`
  logging path in one place instead of every call site reimplementing its own
  version. Native `try/catch` is only for the cases `TryCatch`'s single-attempt
  recover-or-rethrow model doesn't fit: a multi-attempt retry loop
  (`otp.mailer.ts`'s `sendWithRetry`, `server.ts`'s port-binding fallback — the
  loop's next iteration *is* the recovery, not a value a resolver returns), a
  synchronous function (`TryCatch` is async-only), or `try-catch.ts` itself,
  which can't depend on the abstraction it implements. A `try { } finally { }`
  with no `catch` (test cleanup, e.g. restoring a stub) is a different
  construct — always-runs cleanup, not error recovery — and isn't covered by
  this rule.
- Keep a service function's business logic and its error handling in two
  separate functions, not one. The logic function is a plain, unexported
  `async function` — no `TryCatch` inside it except around a step that needs
  its own rollback-and-rethrow (see `otp.store.ts`'s `saveOtp`). The only
  exported symbol is a one-line `xHandler(body)` wrapper: `TryCatch.of(() =>
  x(body)).onError(toResponse)` (see `otp.service.ts`'s `requestOtpHandler`/
  `verifyOtpHandler` over the private `requestOtp`/`verifyOtp`). This keeps
  the logic callable and testable on its own and guarantees nothing outside
  the file can reach it without going through the error-handling wrapper —
  don't export the logic function itself, and don't inline the two together.
  The router calls that handler directly (`({ body }) => xHandler(body)`) —
  no separate `*.handler.ts` file whose only job is unwrapping Elysia's
  `Context` into `body`. That's a third layer that earns nothing and forces
  two different functions to share the name `xHandler`.
- A resolver passed to `TryCatch.onError` that should be fatal (e.g. a failed
  startup dependency) must `throw`, not just log. Returning anything other than
  `NEXT` tells `TryCatch` the error was handled, so execution continues as if
  it succeeded — a resolver that only logs silently swallows the failure.
- `TryCatch.onError`'s fallback (`toAppError`) already logs the original error
  before normalizing it — don't remove that log call, and don't let a new
  resolver branch bypass it by resolving to something other than `NEXT` for an
  error it isn't actually handling.
- Elysia's `onError` codes (`VALIDATION`, `PARSE`, etc.) each need their own
  status mapping. Don't let an unmapped code fall through to a generic 500 —
  a client-caused error (bad JSON, bad input) should stay a 4xx so client
  retry logic doesn't treat it as transient.
- A Redis (or similar) "undo" that deletes a key by identifier alone is unsafe
  if a concurrent request can legitimately rewrite that key first (e.g. after
  a short-lived lock expires). Write a per-write token/generation and only
  delete when it still matches — a blind `DEL` can wipe out newer data.
- Never log a secret's actual value (OTP code, password, token) — not even at
  `debug` level. A `LOG_LEVEL` flip in production (e.g. during an incident) is
  all it takes to leak it. Log that the action happened, not what it contains.

## Config conventions

- Never parse a numeric env var as `Number(process.env.X) || default` — `0`
  is falsy and gets silently overridden. Only fall back when the value is
  missing or fails to parse (`NaN`). Use the `envNumber` helper in
  `src/config/env.util.ts` for every numeric env var — don't hand-roll this
  parse again in a new config file.
- A value checked by a schema (e.g. Zod `.length(n)`) must read the same
  config constant used to produce that value elsewhere — don't hardcode a
  second copy that can drift out of sync.
- A configurable "how many times to retry" value must be clamped to at least
  1 attempt. If it's ever misconfigured to `0`, a `for (i = 1; i <= n; i++)`
  loop over it silently skips the work entirely and returns success — clamp
  with `Math.max(1, n)` rather than trusting the config value directly.

## Code style conventions

- No variable that exists only to rename something. `const VERIFY_EMAIL =
  OtpPurpose.VerifyEmail` then using `VERIFY_EMAIL` adds a name without adding
  meaning — use the original. Same for a `const x = getX()` that's read once:
  inline the call. A local variable earns its place when it's used more than
  once, or when the name explains a value the expression doesn't.
- No hardcoded string that appears in more than one place. If a literal is
  needed twice — a Redis key format, an error code, a purpose/status value —
  it goes in one exported constant, enum, or builder function, and every
  caller (including specs) imports it. Scope it to the narrowest place that
  serves all its callers: module-local first (`otpKey`/`cooldownKey` in
  `otp.store.ts`, `pendingSignupKey` in `email.signup.store.ts`), shared
  (`src/shared/errors/`, `src/config/`) only when more than one module needs
  it. Export the builder rather than letting a spec re-type the format —
  a test that rebuilds `otp:${purpose}:${email}` by hand keeps passing when
  the real key format changes, which is exactly when it should fail.

## Type conventions

- No `undefined`, anywhere, in our own code. Use `null` for every absent,
  missing, or optional value. An optional interface field (`secondName?:
  string`) types as `T | undefined` and lets a caller silently omit it — write
  `secondName: T | null` instead, so every call site has to state the absence
  explicitly. This applies to our own types, function params/returns, class
  fields (e.g. `AppError.details` defaults to `null`, not left unset), and
  local variables — not just object shapes.
- A platform value that arrives as `undefined` (`process.env.X`, `Array.find`,
  a third-party SDK field) gets converted to `null` the moment our code
  receives it — it never propagates past that first line into our own
  functions, types, or variables.
- The only exception is a call site that hands data *into* a third-party
  constructor/function whose own TypeScript type requires `undefined`
  specifically and rejects `null` (e.g. `ioredis`'s `RedisOptions.password`,
  `nodemailer`'s transport `auth`, `pino`'s `transport` option) — there,
  convert `null` back to `undefined` (`value ?? undefined`) inline, right at
  that call, never earlier. Our own config/domain values stay `null`-typed up
  to that exact line.

## Test case generation

Runner: [Playwright Test](https://playwright.dev/docs/test-intro) (`@playwright/test`,
config at `playwright.config.ts`). No separate test directory — test files sit right
next to the logic file they cover, Angular-style: `foo.ts` → `foo.spec.ts` in the same
folder. `testMatch` picks up any `**/*.spec.ts` under `src/`.

### When to generate/update test cases

1. **Per commit** — when reviewing a commit on `main`, check whether it touches
   behavior (not docs/config-only). If so, generate or update the `.spec.ts` file(s)
   colocated with the changed source file(s).
2. **On request** — the user can ask directly ("generate tests for X") at any time,
   independent of any commit.
3. **Test plan changed** — if a file under `docs/test-plans/` is edited, regenerate
   only the spec(s) tied to that plan (see below). A plan edit is the trigger, not
   a suggestion.

### Test plans (major features only)

A "major feature" gets a test plan in `docs/test-plans/<feature>.md` *before* its
spec files are written — the plan is the spec's source of truth. Bug fixes,
refactors, and small changes don't need a plan; just write the `.spec.ts`.

Plan → spec mapping is by feature name, e.g. `docs/test-plans/auth-signup.md` →
`src/modules/auth/service/email.signup.spec.ts`.

### Second repo (test-case export)

Some setups keep generated test cases in a separate git repo from the app code.
This project currently has one repo (`origin` → STAR-Backend) and no second remote
configured — that's fine, not a blocker; colocated `.spec.ts` files travel with the
source they test either way. If a second remote is ever configured, ask before
pushing to it.

### Read the Notes

`notes/` (repo root, organized by module) is where issues and ideas get
drafted before becoming work. Read every file under `notes/` at the start of
each session. Plan against what's there; only start writing code once the
user approves a plan.

### Completed log

`notes/completed.md` tracks notes that have been acted on. When a noted
item is finished, append a line: `- YYYY-MM-DD: <what was completed>
(notes/<file>)`. This is a log, not a plan — don't remove or edit past
entries, only append.
