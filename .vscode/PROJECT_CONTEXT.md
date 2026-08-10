# Project Context: Ensemblem ("star")

> **Purpose of this document:** This is a handoff/context file summarizing an extended
> design and implementation conversation about the "star" (Ensemblem) backend project.
> It is written so that a *different* AI assistant (another Claude session, ChatGPT, etc.)
> or a human collaborator can pick up the project with full context, without having
> access to the original conversation. It captures decisions made, reasoning behind them,
> mistakes that were caught and fixed, and what's still open/undecided.

---

## 1. Project Overview

- **Project name:** Ensemblem, codenamed **"star"**
- **Type:** Real-time backend application
- **Developer:** Padmanabhan (Padmanabhan.S), based in India (Tamil Nadu context),
  working solo, self-described Rust/backend learner-by-doing.
- **Stack:**
  - Runtime: **Bun** (not Node.js)
  - Language: **TypeScript**
  - HTTP/WebSocket framework: **Elysia**
  - Validation: **Zod** (via Elysia's Standard Schema support)
  - Cache/session store: **Valkey** (Redis-compatible fork, BSD-licensed, Linux Foundation),
    accessed via **Bun's native Redis client** (`import { redis } from 'bun'`) — NOT `ioredis`
    (ioredis was in the project initially, then explicitly removed).
  - Logging: **Pino** (planned/in-progress — see §7)
  - Mail: **Nodemailer** (planned/in-progress — see §8)
  - Frontend: **Not yet built.** Planned to be **Nuxt**, but no repo/monorepo decision made yet.
    Deliberately deferred — "don't design a sharing boundary for a repo that doesn't exist yet."

- **package.json name:** `star`
- **Entry point:** `src/server/server.ts`
- **WebSocket export:** `src/socket/index.ts` (exposed as `./webSocket` in package.json exports)
- Previously used Socket.IO + ioredis; **both have been removed**. WebSocket now uses
  Elysia's native `.ws()` support. `ioredis` and `socket.io` should not appear anywhere
  in source — only as stale entries to clean from `package.json`/`node_modules` if found.

---

## 2. Architectural Philosophy (established early, still governs everything)

The project follows a **layered / clean-architecture-style** structure:

```
src/
  server/          — HTTP entrypoint (Elysia app + global lifecycle hooks)
  socket/          — WebSocket, thin adapter over application layer
  application/     — (scaffolded, mostly empty) use-cases/services orchestration
  domain/          — framework-agnostic contracts: entities, value-objects, interfaces, repositories
  infrastructure/  — concrete implementations of domain interfaces (Redis, mail, DB, logger)
  shared/          — cross-cutting, reusable, framework-light utilities (errors, http envelope, types)
  modules/         — feature modules (currently: auth)
```

### Core rule: **never hardcode a specific vendor/technology outside `infrastructure/`**

This came up repeatedly and is a first-class project value:
- `domain/interfaces/` defines **generic contracts** (e.g. `ICacheStore`, not `IRedisStore`;
  `IAuthProvider`, not `IJwtProvider`; `IMailProvider`, not `INodemailerProvider`).
- `infrastructure/<vendor>/` is the **only** place allowed to `import` the actual library
  (`bun`'s redis client, `nodemailer`, etc.) and is the only place that knows the real
  vendor name.
- Everything outside `infrastructure/` (services, handlers, routes) imports only the
  **interface-typed, generically-named export** (e.g. `cacheDb: ICacheStore`,
  `mailProvider: IMailProvider`), never the vendor's own client/types directly.
- Rationale: if Valkey → DynamoDB, or Nodemailer → Resend, or ioredis → Bun-native, only
  the one `infrastructure/<vendor>/` folder changes. Zero other files change.
- **Important nuance established:** don't create empty placeholder folders for
  *speculative* future needs (e.g. a Nuxt frontend that doesn't exist yet — no repo, no
  timeline). BUT a *near-term, already-referenced* need (e.g. `userRepo.create()` already
  appears in draft signup code) is different — it's fine to **decide the naming convention
  now** (e.g. future persistent DB will be exposed as `db: IDatabase`, mirroring
  `cacheDb: ICacheStore`) without creating the actual folder/files until the DB/ORM is chosen.

### Barrel export philosophy

- **A barrel (`index.ts`) is a folder's public contract with the outside world** — not just
  a convenience re-export. Anything not re-exported through the barrel is (by convention)
  private to that folder, even though JS doesn't hard-enforce it.
- **Rule: every folder with more than one file that outsiders need reaches, gets a barrel.**
  A folder with only one file doesn't strictly need one yet.
- **Rule: parent barrels aggregate child barrels; they don't duplicate content.**
  ```ts
  // modules/auth/index.ts
  export * from './providers/email';
  export * from './otp';
  export * from './routes';
  ```
- **Rule: children never import from their own parent's barrel** — this causes circular
  imports. A real circular-import bug was found and fixed in `socket/`:
  `socket/index.ts` → `routes/router.ts` → back to `@/socket` (`socket/index.ts`). Fixed by
  having `routes/router.ts` import `wsHandler` from `@/socket/handlers` directly (its actual
  source), and `routes/index.ts` re-export from `./router` (its own child), never from `..`.
- **Rule for consumers: import the narrowest/most specific barrel that has what you need**,
  not the umbrella top-level barrel, unless you genuinely need multiple things from it.
  E.g. `server/router.ts` imports `socketRouter` from `@/socket/routes`, not `@/socket`.
- **500-line-file discipline (developer's personal habit):** when a file would exceed ~500
  lines, it becomes its own folder with its own **internal** barrel (distinct from the
  outer barrel — an inner barrel that only the immediate sibling file(s) reach into, not
  exposed further out). E.g. a hypothetical `providers/email/service/` folder splitting
  `email.service.ts` into `signup.service.ts`, `signin.service.ts`, etc., aggregated by
  `service/index.ts`, consumed only by `email.routes.ts` at that level.

### Syntax gotchas repeatedly hit (worth remembering for this codebase specifically)

- `export authRoutes from './router'` is **invalid** (that "export X from" shorthand was
  never shipped in JS). Correct forms:
  `export { default as authRoutes } from './router'` or `export { default } from './router'`.
- `export default interface Foo {}` is **invalid** — TS doesn't allow `export default`
  directly on an interface declaration. Must do `interface Foo {}` then `export default Foo;`
  or (preferred, consistent with rest of codebase) just use a **named** export.
- Folder/file naming was originally inconsistent (`Auth/Routes/router.ts` PascalCase mixed
  with `socket/handlers` camelCase). This was flagged and corrected to lowercase/camelCase
  throughout — e.g. `modules/auth/providers/email/...`, `modules/auth/routes/...`.

---

## 3. HTTP Response Envelope — **IMPORTANT: this design changed significantly, read carefully**

### Final, current design (as of the end of the conversation)

**There is NO `response.ts` file that constructs a raw `Response` object.** This was
built, then explicitly identified as unnecessary and removed, because **Elysia already
serializes whatever a handler `return`s into a real `Response` automatically** — building
one manually (`new Response(JSON.stringify(...), {...})`) was redundant boilerplate that
defeated the point of using Elysia.

**Current types** (`shared/types/httpResponse.types.ts` or similar):
```ts
import type { Nullable } from './common.types';

export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: Nullable<T>;
}

export interface FailureResponse {
  success: false;
  message: string;
  error: {
    code: string;       // NOTE: still a plain string, NOT an enum — see §6
    details?: unknown;
  };
}

export type ApiBody<T> = SuccessResponse<T> | FailureResponse;

// IMPORTANT: the generic parametrizes the BODY shape itself, not a raw payload,
// so success()/failure() can each declare a precise return type.
export interface HTTPResponse<B = ApiBody<unknown>> {
  status: number;
  statusText?: string;
  body: B;
}
```

**Helper functions** (`shared/http/responseHelper.ts`):
```ts
export function success<T>(
  data: T,
  message = '',
  status = 200,
): HTTPResponse<SuccessResponse<T>> {
  return { status, body: { success: true, message, data } };
}

export function failure(error: AppError): HTTPResponse<FailureResponse> {
  return {
    status: error.statusCode,
    body: {
      success: false,
      message: error.message,
      error: { code: error.code, details: error.details },
    },
  };
}
```

**How a route handler looks now (final, simplified form):**
```ts
export default async function signup({ body }: Context<{ body: EmailSignupRequest }>) {
  const existing = await userRepo.findByEmail(body.email);
  if (existing) throw new ConflictError('Email already registered');

  const newUser = await userRepo.create(body);
  return success({ id: newUser.id, email: newUser.email }, 'User signed up successfully', 201);
  // NOTE: no response() wrapper, no new Response() — just return the HTTPResponse object.
}
```

**Global unpacking happens once, in the router that owns all the routes**
(`server/router.ts` — see §9 for exact hook-ordering rules), via two Elysia lifecycle hooks:

```ts
const masterRouter = new Elysia({ prefix: '/api' })
  .onRequest(({ request }) => {
    const path = new URL(request.url).pathname;
    logger.info({ method: request.method, path }, 'Request Recieved');
  })
  .onAfterHandle(({ response, set }) => {
    // unpacks HTTPResponse -> real status + body, for the SUCCESS path
    if (response && typeof response === 'object' && 'status' in response && 'body' in response) {
      set.status = (response as any).status;
      return (response as any).body;
    }
    return response;
  })
  .onError(({ code, error, set, request }) => {
    // handles the FAILURE path — thrown AppErrors AND Elysia/Zod validation failures
    const path = new URL(request.url).pathname;
    const appError =
      code === 'VALIDATION'
        ? new ValidationError(error.message)
        : error instanceof AppError
        ? error
        : new AppError('Internal Server Error', 'INTERNAL', 500);

    logger.error(
      { method: request.method, path, errorCode: appError.code, statusCode: appError.statusCode, details: appError.details },
      appError.message,
    );

    const result = failure(appError);
    set.status = result.status;
    return result.body;
  })
  .use(socketRouter)
  .use(authRoutes)
  .get('/', () => { console.log('welcome,server is running'); });
```

**Why two separate hooks are both needed:** `onAfterHandle` only fires on the success path
(a handler that returns normally). If a handler `throw`s, execution skips `onAfterHandle`
entirely and jumps straight to `onError`. So `set.status` must be set independently in
*both* hooks — there's no single choke point that catches both cases.

### History of how this design was reached (context for why it looks the way it does)

1. First iteration: built `response.ts` with `new Response(JSON.stringify(body), { status, headers })`.
   Hit repeated TS errors (`ApiBody<T>` not assignable to `BodyInit`) from passing the
   whole `HTTPResponse` object, or the un-stringified `body`, into `new Response()`.
2. Fixed those errors incrementally (stringify body, fix double-generic-wrapping bugs in
   `success<SuccessResponse<T>>` mistakes, fixed missing colons in return-type syntax, etc.)
3. Discussed status-text mapping (`getStatusText(code)` lookup table) — this was built and
   is **still valid/current** if you want human-readable `statusText` on responses. Lives
   next to `response.ts`'s former location, in `shared/http/`.
4. Discussed header handling (`set.headers['Authorization']`) for session token rotation —
   confirmed via research that **Elysia automatically merges `set.headers` into a returned
   raw `Response` object** (append-not-overwrite — a documented Elysia bug/behavior, so
   avoid setting the same header key in two different places, e.g. `Content-Type` in both
   a global default-headers hook AND inside `response()`, or it duplicates).
5. **Then the developer realized this whole `response()`/`new Response()` layer was
   unnecessary** — Elysia already does this serialization for you if a handler just
   `return`s a plain object. This was the pivot point: **`response.ts` was deleted**, and
   the pattern moved to the current design above (§3's "final" version) —
   `success()`/`failure()` still exist and still return plain `HTTPResponse` objects, but
   nothing manually constructs `Response` or calls `JSON.stringify` anymore; that's fully
   delegated to Elysia via `onAfterHandle`/`onError`.

**⚠️ If you see any code, or are asked to write code, using `response(success(...))` or
importing a `response.ts` file that does `new Response(...)` — that is the OLD, abandoned
pattern. Do not reintroduce it. The current pattern is `return success(...)` /
`throw new SomeAppError(...)`, full stop.**

### Header mutation & handler/service split (a genuinely unresolved tension — read carefully)

This oscillated a few times over the conversation and the **final explicit agreement** was:

- **Service** = pure(ish) business logic + DB/Redis access. Returns plain data or throws
  an `AppError`. Should NOT import `Context`, `set`, or build `HTTPResponse` itself.
- **Handler** = the only place that touches Elysia's `Context`/`set` (headers, status),
  calls into the service, and translates the service's plain result (or a caught
  `AppError`) into `success(...)`/`failure(...)`.
- Concretely: `providers/email/email.handler.ts` (Elysia-aware, does header mutation like
  `set.headers['Authorization'] = ...` for session tokens) calls
  `service/email.signup.ts` / `service/email.signin.ts` (pure business logic, DB/Redis,
  returns e.g. `{ id, email, token }` or throws).
- **HOWEVER:** at multiple points in the actual code shown, the developer had merged
  these two responsibilities into ONE file (e.g. `service/email.signup.ts` itself
  destructuring `Context`, doing business logic, AND building the response) — and
  explicitly said "keep it as it is" at one point, only fixing the specific bug (hardcoded
  `null` instead of real data) rather than separating the layers.
- **Net take for whoever picks this up:** the *intended, discussed-as-ideal* architecture
  is the handler/service split described above (with header mutation clearly a handler
  concern, since a service returning a fully-built `Response`/`HTTPResponse` traps data
  like session tokens that the handler needs for headers — this was demonstrated with a
  concrete signin example). But **the actual repository state may still have some files
  where service and handler are merged into one function** (this was the pattern in
  `email.signup.ts` most recently shown). **Check the actual current files before
  assuming which pattern is in place**, and prefer migrating toward the split (handler
  owns Context/headers, service is pure) when you touch these files, since that was the
  more deliberated, final-stated preference.

---

## 4. Error Handling

### `AppError` base class (current, confirmed working code)

```ts
// shared/errors/app.error.ts
export class AppError extends Error {
  public readonly code: string;       // NOTE: plain string for now, see below
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(message: string, code: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype); // needed for instanceof after extending Error
  }
}
```

Subclasses exist for: `NotFoundError`, `UnauthorizedError`, `ValidationError`,
`ConflictError` (all in `shared/errors/`, barrel-exported via `shared/errors/index.ts`).
Each subclass's constructor bakes in its own `code`/`statusCode`, so call sites just do
`throw new ConflictError('Email already registered')` without repeating code/status.

### Deferred: `ErrorCode` enum

A design for replacing the plain-`string` `code` field with a proper `ErrorCode` enum
(`VALIDATION`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`, `INTERNAL`, etc.) was fully drafted
and discussed (motivated directly by repeated real typo bugs in this session — e.g.
`forgetPasswrod`, `'VALIDATAION'` instead of `'VALIDATION'`). **The developer explicitly
deferred this ("The enum is for another day not for now")** — so `AppError.code` is
**still typed as `string`** in the actual codebase. Do not silently introduce the enum
without being asked; it's a known, intentional, parked decision.

### Elysia's own `code` vs. your `AppError.code` — important distinction

In `onError(({ code, error }) => ...)`, Elysia's `code` is its own built-in string-literal
union (`'VALIDATION' | 'NOT_FOUND' | 'PARSE' | 'INTERNAL_SERVER_ERROR' | ...`), confirmed
via TS error messages during debugging. This is **separate** from your own `AppError.code`
string values, even where they happen to share a spelling like `'VALIDATION'`. Comparing
`code === 'VALIDATION'` in `onError` is comparing against **Elysia's** literal type, not
your `AppError`'s notion of a code.

---

## 5. Auth Module (`src/modules/auth/`)

### Structure (as designed/discussed; verify actual current files, this evolved a lot)

```
modules/auth/
  index.ts                        # top-level barrel, aggregates children
  providers/
    email/
      index.ts                     # barrel: exports emailRouter (and maybe emailRoutes)
      email.router.ts               # Elysia route registration + Zod schema attachment
      email.handler.ts               # Elysia-aware: Context, headers, calls service, builds response
      email.schema.ts                 # Zod schemas (emailSignupSchema, etc.) + inferred types
    oauth/                          # reserved, empty placeholder for future
      index.ts
  service/
    index.ts                        # barrel — NAMED exports only, no default export
                                     #   e.g. export {default as signupService} from "./email.signup"
    email.signup.ts
    email.signin.ts
    email.logout.ts
    email.forgotpassword.ts
  otp/                               # SHARED across providers (email today, maybe others later)
    index.ts
    otp.types.ts                     # OtpPurpose ('signup' | 'reset' | ...), OtpPayload
    otp.generator.ts                  # random code generation (crypto.getRandomValues — no package needed)
    otp.hasher.ts                      # hash/compare (Bun.password.hash/verify — no package needed)
    otp.store.ts                       # Redis-backed persistence via cacheDb (ICacheStore)
    otp.service.ts                     # trigger() / verify() — orchestrates generator+hasher+store+mail
  session/
    index.ts
    session.types.ts                   # SessionPayload { userId, token, refreshToken, expiresAt }
    session.store.ts                    # Redis-backed via cacheDb, same pattern as otp.store.ts
    session.service.ts                   # validate(), refresh(), revoke()
  middleware/
    http.middleware.ts                   # beforeHandle/derive: validates Authorization header via
                                          # sessionService, sets rotated token into set.headers, attaches
                                          # { userId } to context via Elysia's `.derive()`
    socket.middleware.ts                  # same idea, for the WS handshake (not yet built out)
  routes/
    index.ts                              # barrel: export {default as authRoutes} from './router'
    router.ts                              # mounts provider routers (emailRoutes, later oauthRoutes)
```

### Why `otp/` and `session/` are their own top-level folders under `auth/`, not inside `providers/email/`

Both are **shared across providers** — OTP could be used by email signup AND future OAuth
flows; sessions apply regardless of which provider authenticated the user. Keeping them as
siblings of `providers/`, not nested inside `providers/email/`, avoids coupling shared
concerns to one specific provider.

### OTP design specifics (discussed in depth)

- **"Shared file" the developer originally imagined for passing an OTP between the
  "trigger" and "verify" actions is actually just Redis** (via `cacheDb`), not a literal
  shared in-memory file/variable — trigger and verify happen in separate HTTP requests,
  possibly different server instances, so persistence has to be external.
- **Key shape:** `otp:{purpose}:{email}`, e.g. `otp:signup:user@example.com`.
- **On successful verify: delete the key immediately** (don't wait for TTL expiry) — a
  leaked/logged code shouldn't remain valid for the rest of its TTL after being used once.
- **Retry/guessing limits recommended** (not yet built): track attempt count per key
  (`otp:attempts:{purpose}:{email}`), incremented on failed verify, checked before allowing
  another attempt — to prevent brute-forcing a short numeric code within the TTL window.
- **No external package needed for OTP mechanics:**
  - Random code generation → Web Crypto's `crypto.getRandomValues()` (global in Bun).
  - Hashing before storage → `Bun.password.hash()` / `Bun.password.verify()` (Bun-native,
    supports bcrypt and argon2id, no `bcryptjs`/`argon2` package required).

### Password validation (Zod) — final settled version

```ts
import { z } from 'zod';

const ALLOWED_SPECIAL_CHARS = `!@#$%^&*()_+\\-=[\\]{};':"\\\\|,.<>/?`;

const passwordSchema = z.string()
  .min(8, {
    error: 'Password must be at least 8 length. Tip: using about 2 characters from each of lowercase, uppercase, numbers, and symbols is an easy way to reach that.',
  })
  .regex(/[a-z]/, { error: 'Atleast 1 small chareacters are required' })
  .regex(/[A-Z]/, { error: 'Atleast 1 Capital Letters are required' })
  .regex(/\d/, { error: 'Atleast 1 numbers are required' })
  .regex(new RegExp(`[${ALLOWED_SPECIAL_CHARS}]`), { error: 'At least 1 special character is required' });

export const emailSignupSchema = z.object({
  firstName: z.string().min(1).max(999),
  secondName: z.string().max(1000).optional(),
  email: z.email(),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  error: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type EmailSignupRequest = z.infer<typeof emailSignupSchema>;
```

Key decisions embedded here:
- **Only 1-of-each category required** (not 2) — a "2 of each" version was tried first,
  rejected because it silently forces an exactly-8-character password into a rigid
  2-2-2-2 composition, and produces misleading errors (e.g. `aA0@` — which already has
  one of each — would wrongly show "need more lowercase/uppercase/etc." errors when the
  *actual* problem is just total length). The "use ~2 of each" idea survives only as a
  **UX tip inside the `min(8)` error message**, not as an enforced rule.
- **Closed special-character set**, not an exclusion regex (`[^a-zA-Z0-9]` was rejected —
  too permissive, allows whitespace/emoji/unicode). Explicit whitelist used instead.
- `confirmPassword` has no duplicate regex rules — it's checked for equality against
  `password` via `.refine()` at the object level (cross-field checks can't live inside a
  single field's `.string()` chain).
- **Reminder for whoever builds the signup service:** `EmailSignupRequest` includes
  `confirmPassword` (since it's part of the inferred Zod type) — this field must be
  stripped out before persisting the user (don't try to save a `confirmPassword` DB column).

### Zod ↔ Elysia integration

Elysia supports Zod natively via **Standard Schema** (Elysia 1.4+). A Zod schema is BOTH
the runtime validator (attached to a route's `body` option) AND the source of the
TypeScript type (`z.infer<typeof schema>`) — one artifact does both jobs, so validation
rules and types can never drift apart.

```ts
export const emailRoutes = new Elysia()
  .post('/signup', signupHandler, { body: emailSignupSchema });
```

**Once a Zod schema is attached to a route's `body`, Elysia validates BEFORE the handler
runs.** A malformed/missing body never reaches the handler — Elysia returns a `422`
automatically. This makes manual `if (!body) throw new ValidationError(...)` checks
**dead code** inside handlers once schema validation is wired up — this was an actual bug
caught in this session (handler had a leftover manual null-check that could never fire).

**Production note:** Elysia hides detailed Zod field-by-field messages when
`NODE_ENV=production` by default (returns generic "validation failed" instead), for
security (avoids leaking schema internals to an attacker). This is intentional, not a bug.

### Zod method gotchas encountered (avoid repeating)

- `.nonempty()` after `.min(1)` or after `z.email()` is redundant/inert — both already
  imply non-empty.
- `.nonoptional()` is for stripping optionality from a field that was previously made
  `.optional()` — calling it on an already-required field does nothing meaningful.

---

## 6. Elysia-Specific Behaviors Learned The Hard Way (important — avoid re-learning these)

1. **`Context['request']` vs `Context['body']` are different things.** `request` is the
   raw Fetch API `Request` — its `.body` is always `ReadableStream<Uint8Array> | null` per
   spec, never parsed JSON. Elysia's own `body` field on `Context` is the *already-parsed*
   result. Destructure `{ body }: Context<{...}>`, never type a handler param as
   `Context['request']` and expect parsed JSON from it.

2. **To type `body` on a standalone handler function** (not inline in `.post()`), the
   correct generic shape is `Context<{ body: SomeType }>` — a bare type alias passed
   directly as `Context<SomeType>` does NOT satisfy Elysia's internal `RouteSchema`
   constraint; it must be wrapped as `{ body: SomeType }`.

3. **Lifecycle hook ORDER matters and is not intuitive.** Confirmed directly from Elysia's
   docs: *"events will only apply to routes after they are registered."* Concretely:
   ```ts
   new Elysia()
     .onBeforeHandle(() => console.log('1'))
     .use(someRouter)              // someRouter's routes DO get hook '1'
     .onBeforeHandle(() => console.log('2'))
     // routes inside someRouter do NOT get hook '2', because '2' was registered
     // AFTER someRouter was merged in.
   ```
   **Practical rule for this project:** any global hook meant to apply to ALL routes
   (logger, auth middleware, response-unpacking) must be registered on `masterRouter`
   **before** the `.use(socketRouter).use(authRoutes)` calls, not after.

4. **Lifecycle hooks are locally-scoped by default across separate plugin instances.** If
   you build a hook inside a *separate* `new Elysia()` plugin instance (e.g. a dedicated
   `httpLogger` plugin file) and then `.use()` it into another instance, the hook will
   **not** automatically apply to routes defined in the instance that used it — UNLESS you
   mark it `{ as: 'global' }`, e.g. `.onAfterResponse({ as: 'global' }, ...)`.
   **Exception: `onRequest` is always global regardless of scope**, because it fires before
   routing is even resolved, so it can't be scoped to specific routes anyway.
   **This project's chosen resolution:** avoid the whole scoping question by defining hooks
   directly on `masterRouter` (the same instance that owns/merges all the routes) rather
   than as a separate plugin file — see the code block in §3.

5. **`onError`'s context includes `code` and `error`; `onRequest`/`onAfterHandle` do not.**
   Each lifecycle stage only exposes what's relevant to that stage. `onAfterHandle`/
   `onAfterResponse` fires for both success AND failure paths (after `onError` has already
   run for failures) but only has the final `set.status`, not the raw error object — so
   detailed error logging belongs specifically in `onError`, and a general
   completion/timing log can live in `onAfterHandle`/`onAfterResponse`.

6. **`onAfterHandle`'s context has a `response` property** holding the handler's return
   value — NOT a second positional function argument (this was an assumption error caught
   and corrected during the session via doc verification).

7. **`path` is not available on `onRequest`'s context** (only `request`, `store`,
   `redirect`, `server`, `set`, `status`) — derive it manually:
   `const path = new URL(request.url).pathname;`

8. **Elysia automatically merges `set.headers` into a returned raw `Response` object** —
   but the merge is append-not-overwrite for duplicate keys (a documented Elysia
   behavior/bug), so avoid setting the same header key (e.g. `Content-Type`) in two
   different global hooks/places.

---

## 7. Logging (Pino) — plan, largely NOT yet implemented in actual files

**Current state: `infrastructure/logger/` exists as an empty scaffolded folder.** A design
was fully drafted in conversation but the developer explicitly clarified at one point that
none of it had actually been added/tested yet — **treat anything logger-related as a
proposal to implement, not confirmed-working code**, unless you check the actual repo files.

Chosen library: **Pino** (faster than Winston, async, matches `.env.example`'s existing
`LOG_LEVEL`/`LOG_FORMAT` variables which were previously unused).

**Bug caught and fixed during drafting:** the developer's actual `server.log.ts` had:
```ts
export default function logger() {
  return pino(logConfig);
}
```
— this exports the **factory function**, not an invoked `Logger` instance, which is why
`.info()`/`.warn()` etc. don't exist on it (TS error: `Property 'info' does not exist on
type '() => Logger<never, boolean>'`). **Correct pattern:** call `pino(logConfig)` once at
module load and export the resulting instance directly:
```ts
export const logger = pino(logConfig);
```
One shared instance, imported everywhere — not re-invoked per call site.

**Planned integration point:** directly on `masterRouter` in `server/router.ts` (not a
separate `.use()`'d plugin, per the scoping gotcha in §6.4), via `onRequest` +
`onAfterHandle`/`onAfterResponse` + `onError`, logging method/path/status/duration/error
details. Draft code is in §3's `masterRouter` block above.

---

## 8. Mail (Nodemailer) — plan, NOT yet implemented

```bash
bun add nodemailer
bun add -d @types/nodemailer
```

Wrapped behind a generic `IMailProvider` interface (same infra-isolation pattern as
`ICacheStore` — see §2):

```
domain/interfaces/mail-provider.interface.ts   # IMailProvider { send(to, subject, body): Promise<void> }
infrastructure/mail/
  nodemailer.client.ts        # ONLY file that imports 'nodemailer'
  nodemailer-mail.adapter.ts   # implements IMailProvider
  index.ts                     # exports `mailProvider: IMailProvider`
```

`.env.example` needs `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`
added (not yet done as of last message). Rationale for Nodemailer over API-based providers
(Resend, SendGrid) at this stage: works with any SMTP server including free dev sandboxes
(e.g. Mailtrap) with zero vendor lock-in; API providers noted as a likely **future swap**
once in production, which is exactly why the `IMailProvider` abstraction exists — swapping
later should only touch `infrastructure/mail/`.

---

## 9. Infrastructure Naming Convention (settled, apply consistently going forward)

- **`infrastructure/<vendor-folder>/`** — folder name CAN reveal the real vendor
  (`infrastructure/redis/`, `infrastructure/mail/`) since infra is the layer allowed to
  know this.
- **The exported symbol name that leaves the folder must be generic/purpose-based:**
  - Cache/ephemeral KV store (currently Valkey via Bun's client) → exported as
    **`cacheDb`**, typed as `ICacheStore`. (Originally named `kvStore`/`IKeyValueStore` —
    renamed to `cacheDb`/`ICacheStore` specifically to stop leaking "KV/Redis" framing into
    consumer code, per explicit developer request.)
  - Mail → exported as **`mailProvider`**, typed as `IMailProvider`.
  - **Not yet created, but naming is decided for consistency when it IS built:** a future
    persistent database layer would be exported as **`db`**, typed as `IDatabase`, living
    in `infrastructure/database/` — do NOT create this folder preemptively; only add it
    when an actual DB/ORM choice is made. `service/email.signup.ts` currently references a
    `userRepo` that doesn't formally exist yet as scaffolded infra — this is a known gap.
- Consumers (e.g. `otp.store.ts`) should read like they have no idea which vendor backs
  `cacheDb`/`mailProvider` — e.g.:
  ```ts
  import { cacheDb } from '@/infrastructure/redis';
  export async function saveOtp(key: string, hashedCode: string, ttl: number) {
    await cacheDb.set(key, hashedCode, ttl);
  }
  ```

### `ICacheStore` interface (current)
```ts
export interface ICacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}
```
Backed today by Bun's native `redis` client (`import { redis } from 'bun'`), pointed at a
locally-installed **Valkey** instance (developer is on Fedora, which doesn't ship Redis
natively — Valkey was installed instead; Bun's client supports Valkey as a first-class
target, even preferring `VALKEY_URL` over `REDIS_URL` in its default connection resolution
order). **`ioredis` has been fully removed from the project** — do not reintroduce it
without explicit reason (e.g. if Redis/Valkey **cluster** support is ever needed, since
Bun's native client doesn't yet support clustering — `ioredis` would be the fallback in
that specific scenario only).

---

## 10. Immediate Next Steps (as of the end of the conversation, in planned commit order)

The developer's own stated plan, to be executed as **separate, individually-testable git
commits**:

1. **Commit 1 — Redis/Valkey wiring:** create `domain/interfaces/kv-store.interface.ts`
   (or renamed per §9, `cache.interface.ts`/`ICacheStore`), `infrastructure/redis/redis.client.ts`,
   `infrastructure/redis/redis-cache.adapter.ts` (or similarly renamed), `infrastructure/redis/index.ts`
   exporting `cacheDb`. **Verify with a real `set`/`get` round-trip against the local Valkey
   instance before committing.**
2. **Commit 2 — Nodemailer:** `bun add nodemailer @types/nodemailer`; create
   `domain/interfaces/mail-provider.interface.ts`, `infrastructure/mail/nodemailer.client.ts`,
   `infrastructure/mail/nodemailer-mail.adapter.ts`, `infrastructure/mail/index.ts` exporting
   `mailProvider`; add SMTP env vars to `.env.example`. **Verify by sending one real test
   email (e.g. via Mailtrap sandbox) before committing.**
3. **Commit 3 — OTP: generate + hash + store:** build out `modules/auth/otp/` per §5 —
   `otp.types.ts`, `otp.generator.ts` (crypto-based), `otp.hasher.ts` (`Bun.password`-based),
   `otp.store.ts` (uses `cacheDb` from Commit 1), `otp.service.ts` with a `trigger()`
   function that ties generator+hasher+store+`mailProvider` (from Commit 2) together.
   **Verify by triggering an OTP and confirming it lands in Valkey
   (`valkey-cli GET otp:signup:test@example.com`) AND the email arrives.**
4. **Open question, not yet decided:** whether OTP `verify()` (read+compare+delete from
   Redis, plus attempt-limiting) is part of Commit 3 or its own Commit 4. The reasoning
   discussed favored splitting it into its own commit (storage-layer-exists vs.
   verification-flow-wired-in are different milestones) but no final call was made in the
   conversation.

---

## 11. Things Explicitly Deferred / Parked (do not do these unless asked)

- **`ErrorCode` enum** for `AppError.code` — fully designed, explicitly postponed
  ("for another day"). `code` remains `string`-typed.
- **`infrastructure/database/` and any ORM/DB choice** — not decided (Postgres? SQLite?
  Drizzle? Prisma? raw driver?). Only the *future naming convention* (`db: IDatabase`) is
  agreed, not the implementation.
- **Nuxt frontend / monorepo structure** — Nuxt is the planned frontend framework, but no
  repo exists yet, no monorepo tooling decision made. When it happens, the discussed shape
  is Bun workspaces (`apps/server`, `apps/web`, `packages/shared-validation` for
  isomorphic Zod schemas shared between backend and Nuxt frontend).
- **OTP attempt/retry limiting** — discussed as a recommended addition (`otp:attempts:...`
  key, incremented on failed verify) but not yet built.
- **`socket/middleware/socket.middleware.ts`** (WS handshake auth, mirroring the HTTP auth
  middleware) — discussed conceptually, not yet built.
- **Consistent `xService` naming suffix** across all barrel exports in
  `modules/auth/service/index.ts` — only `signup` was renamed to `signupService` so far;
  developer said they'd rename the rest "on the go."

---

## 12. Miscellaneous Corrections/Facts Worth Knowing

- Claude (the AI assisting in this conversation) made and self-corrected a few real
  mistakes worth knowing about if continuing this work:
  - Initially claimed returning a raw `Response` from an Elysia handler would NOT get
    `set.headers` merged in — this was **wrong**; verified via Elysia's own docs and a
    GitHub issue that it DOES merge automatically (append-style, not overwrite).
  - Initially wrote `onAfterHandle(({ set }, response) => ...)` with `response` as a second
    positional argument — **wrong**; corrected to `response` being a property on the single
    context object: `onAfterHandle(({ response, set }) => ...)`.
  - Assumed a separate `httpLogger` plugin file would work with plain `.use()` — **wrong**
    without `{ as: 'global' }` on non-`onRequest` hooks, due to Elysia's local-scope-by-
    default behavior. Corrected after verification.
- The developer has caught several of their own typos that are worth NOT reintroducing:
  `forgetPasswrod` → `forgetPassword`, `Passwrod` → `Password`, `'VALIDATAION'` →
  `'VALIDATION'`, `detail` → `details` (matching the `FailureResponse.error.details` field
  name), `colourize` → `colorize` (pino-pretty's actual option spelling).

---

*End of context document. If resuming work on this project, start by reading the actual
current state of `src/` in the repo — this document reflects the state of design
discussions and may be ahead of or behind what's actually committed to the codebase.*
