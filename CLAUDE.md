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

  in the src folder there is a folder called notes, where I draft and note the issues that I found based on the module wise you Read the note folder's files and plan according to those noted one's and if those plan are approved start wrting the code.
