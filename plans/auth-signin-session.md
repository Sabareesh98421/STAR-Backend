# Plan — Login half, milestone 1: signin + logout

Status: draft, not started
Scope: `POST /api/auth/email/signin` and `/signout`, plus the session mechanism
they need. Forgot/reset password is milestone 2.

## Context

`notes/application/flow.md` has two halves.

**Register — done.** Signup parks a pending record in Redis (15-min TTL) and the
Postgres `User` row is created only after the `verify-email` OTP is confirmed.
Committed at `9fc180a`, logged in `notes/completed.md`.

**Login — not started.** The working tree holds an abandoned restructure: a
folder move into `service/login/` and `service/passwordHandler/`, three empty
stubs, and one file that does not compile —
`src/modules/auth/service/login/email.signin.ts` has `await` inside a non-async
arrow, compares the returned promise to `null`, and calls `failure()` with no
argument. `/signin` and `/signout` in `email.router.ts` are `()=>{}`.

Nothing in the codebase represents a signed-in session — no token library, no
session store, no auth guard. That is the real blocker and the substance of this
milestone.

## Current state

| Piece | State |
|---|---|
| signup → pending record in Redis | done |
| `/otp/request` + `/otp/verify` → creates user | done |
| OTP hardening (hashing, attempts, cooldown, CAS discard) | done |
| `purpose` restricted to known values | **broken — see step 0** |
| signin | broken stub |
| logout | empty stub |
| forgot / reset password | empty stubs, milestone 2 |
| session token / revocation / auth guard | does not exist |

## Decisions

- **JWT** for the session token, signed HS256 via `jose`.
  Not `@elysiajs/jwt`: that plugin decorates Elysia's `Context`, which would
  force services to accept a context object and break the "service takes `body`,
  router calls `handler(body)`" convention in `CLAUDE.md`. `jose` is callable
  from a plain function.
- **Logout revokes via a Redis `jti` denylist.** A JWT is stateless, so signout
  has to record something server-side or the token stays valid until it expires.
  The denylist key's TTL equals the token's own remaining life, so it self-cleans
  and cannot grow unbounded.
- **No auth guard yet.** There is no protected route to guard. It gets written
  when the first one exists.

---

## Step 0 — Fix the OTP `purpose` open relay *(separate commit, lands first)*

`otp.schema.ts:8` types `purpose` as `z.string().min(1).max(50)`. The
pending-signup guard in `otp.service.ts` only fires on
`purpose === OtpPurpose.VerifyEmail`, so any other string skips it and mails an
OTP to an arbitrary address — an open mail relay.

- [ ] `otp.schema.ts` — `z.enum(OtpPurpose).default(OtpPurpose.VerifyEmail)` in
      both `otpRequestSchema` and `otpVerifySchema`.
- [ ] `otp.store.ts` — change the `purpose` parameter type on `otpKey`,
      `cooldownKey`, `saveOtp`, `discardOtp`, `consumeOtp` from `string` to
      `OtpPurpose`, so an unknown purpose cannot reach Redis.
- [ ] `otp.router.spec.ts` — `POST /otp/request` with `purpose: "x"` → 400, and
      no key at `otpKey(...)`.

Kept separate so a security fix isn't buried inside a feature diff.

## Step 1 — Dependency and config

- [ ] `bun add jose`.
- [ ] New `src/config/session.config.ts`, mirroring `otp.config.ts`:
      `jwtSecret: string | null` (`process.env.JWT_SECRET ?? null` — never
      `undefined`), and `accessTtlSeconds` via the existing `envNumber` helper
      in `env.util.ts`, default `3600`. Do not hand-roll the
      `Number(x) || default` parse.
- [ ] Export it from `src/config/index.ts`.
- [ ] `server.ts` — fail fast on a missing secret at startup, alongside the
      Redis connect. The `TryCatch.onError` resolver must `throw`; a resolver
      that only logs silently swallows the failure.
- [ ] `.env.example` — add `JWT_SECRET=` and `SESSION_ACCESS_TTL_SECONDS=3600`.

## Step 2 — Session token (`service/login/session.jwt.ts`)

- [ ] `issueSession(userId): Promise<string>` — `jose` `SignJWT`, HS256, claims
      `sub: userId`, `jti: crypto.randomUUID()`, `exp` from
      `sessionConfig.accessTtlSeconds`.
- [ ] `readSession(token): Promise<{ userId, jti, expiresAt }>` — `jwtVerify`,
      then the denylist check from step 3. Throws the existing
      `UnauthorizedError` on any failure. Never surface `jose`'s error text to
      the client.

## Step 3 — Revocation (`service/login/session.store.ts`)

Shape it like `email.signup.store.ts` — plain exported async functions over
`getRedis()`, no class.

- [ ] Exported `revokedKey(jti)` builder, so specs import the format instead of
      retyping it (`CLAUDE.md`: no hardcoded string in two places).
- [ ] `revokeSession(jti, expiresAt)` — `SET revokedKey(jti) "1" EX <seconds
      remaining until exp>`.
- [ ] `isRevoked(jti): Promise<boolean>`.

## Step 4 — Signin (rewrite `service/login/email.signin.ts`)

Delete the current contents. Use the two-function split from `email.signup.ts`:

```ts
export default function signinHandler(body: EmailSigninRequest) {
    return TryCatch.of(() => signinService(body)).onError(toResponse);
}

async function signinService(body: EmailSigninRequest) { ... }
```

- [ ] `userRepository.findByEmail(body.email)` — reuse the existing
      `IUserRepository`.
- [ ] `Bun.password.verify(body.password, user.passwordHash)` — mirrors
      `Bun.password.hash` in signup, no dependency needed.
- [ ] **Identical** `UnauthorizedError('Invalid email or password')` for both
      "no such user" and "wrong password" — distinct messages turn signin into
      an email-enumeration oracle.
- [ ] `response(success({ token, expiresIn }, 'Signed in', 200))`.

A user who signed up but never verified has no Postgres row at all, so that case
is rejected for free — no extra branch.

## Step 5 — Logout

Keep the file at `service/email.logout.ts`. Moving it into `login/` is churn with
no functional gain.

- [ ] The raw token arrives in the `Authorization` header, not the body, so the
      router pulls it and passes the bare string:
      `.post('/signout', ({ headers }) => logoutHandler(headers.authorization ?? null))`.
- [ ] Same handler/service split. `readSession` → `revokeSession(jti,
      expiresAt)` → 200. A missing or malformed header is an
      `UnauthorizedError`.

## Step 6 — Schema and routing

- [ ] `email.schema.ts` — add `emailSigninSchema`
      (`{ email: z.email(), password: z.string().min(1) }`) and its inferred
      type. **Do not** reuse `passwordSchema`: signin must not reject an attempt
      on complexity rules, which would tell an attacker the password shape.
- [ ] `email.router.ts` — wire `/signin` with `{ body: emailSigninSchema }`, and
      `/signout` per step 5.
- [ ] `service/index.ts` — currently exports `signin` and a misspelled
      `forgotPasswrod`, and omits `email.resetPassword.ts`. Export
      `signinHandler` and `logoutHandler`; leave the password stubs out until
      milestone 2 gives them bodies.

## Step 7 — Test plan, then specs

`CLAUDE.md` requires the plan before the specs for a major feature.

- [ ] Write `docs/test-plans/auth-signin.md` first.
- [ ] `session.jwt.spec.ts` — issue→read round-trip; tampered token throws
      `UnauthorizedError`; expired token throws.
- [ ] `session.store.spec.ts` — revoke then `isRevoked` is true; the key carries
      a TTL rather than being persistent.
- [ ] `email.signin.spec.ts` — verified user signs in; wrong password and
      unknown email return the **same** 401 message; a pending-but-unverified
      signup cannot sign in.
- [ ] Extend `otp.router.spec.ts` with the full loop: signup → request → verify
      → signin → signout → the same token now rejected.

Follow the existing spec shape: `connectRedis()` in `beforeAll`, key cleanup plus
`disconnectRedis()` in `afterAll`, imported key builders rather than retyped
strings.

## Step 8 — Log it

- [ ] Append to `notes/completed.md` (append-only):
      `- 2026-08-22: Email signin issues a JWT; signout revokes it via a Redis
      jti denylist. Covers "Email and Password Login" in
      notes/application/flow.md. Forgot/reset password still open.`

---

## Commits

One file per commit, `prefix: lowercase imperative`, no `Co-Authored-By`:

```
fix: restrict otp purpose to known values
build: add jose for session tokens
feat: add session config
feat: issue and read session jwts
feat: revoke sessions via redis denylist
feat: sign in with email and password
feat: revoke the session on signout
feat: add signin schema
feat: wire signin and signout routes
refactor: fix auth service exports
docs: add signin test plan
test: cover signin and session handling
chore: log signin completion
```

## Verification

1. `bun run test` — needs Redis and Postgres up (see
   `docs/postgres-local-setup-issues.md`).
2. `bun run dev`, then walk the real flow:

```bash
curl -s -XPOST localhost:3000/api/auth/email/signup -H 'content-type: application/json' -d '{"firstName":"Ada","email":"a@b.com","password":"Str0ng!Pass","confirmPassword":"Str0ng!Pass"}'
```

Then `/auth/otp/request`, read the code from Redis or the jsonTransport output
(the code value itself is deliberately never logged), `/auth/otp/verify`, then:

```bash
curl -s -XPOST localhost:3000/api/auth/email/signin -H 'content-type: application/json' -d '{"email":"a@b.com","password":"Str0ng!Pass"}'
```

3. Relay fix: `/auth/otp/request` with `"purpose":"x"` → 400, no mail sent.
4. Revocation: `/signout` with the token, then reuse it → 401.

## Risks / open questions

- **No refresh token.** A 1-hour access token means re-login every hour. Fine
  for now; revisit when there's a client that cares.
- **Denylist lookup per verified token** — one Redis read on every future
  protected request. Acceptable at this scale; it is also the cost that makes
  logout actually work.
- **`JWT_SECRET` rotation** invalidates every live token at once. No plan for
  graceful rotation, and none needed pre-launch.

## Out of scope

Forgot password, reset password, refresh tokens, and the `onBeforeHandle` auth
guard for protected routes. None has a consumer yet.
