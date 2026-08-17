# Auth email verification

Signup no longer writes the user straight to Postgres. It stores a pending
signup in Redis (`src/modules/auth/service/email.signup.store.ts`, TTL from
`src/config/signup.config.ts`) and only creates the Postgres `User` once the
`verify-email` OTP is confirmed. This closes the gap where `/otp/request` and
`/otp/verify` used to accept any client-supplied email with no link back to a
signup.

## Cases

- Sign up with a new email -> succeeds; no Postgres user row exists yet, a
  pending signup exists in Redis for that email.
- Request an OTP for an email with no pending signup -> rejected (not found),
  no OTP is generated or sent.
- Request an OTP for a signed-up email -> succeeds as before.
- Full flow: signup -> request OTP -> verify with the correct code -> a
  Postgres user row is created with the signed-up name/password, and the
  pending signup record is deleted from Redis.
- Verify succeeds against the OTP but the pending signup already expired
  (TTL elapsed) -> rejected even with the correct code; no user is created.
- Sign up again for an email that's already a verified (Postgres) user, then
  complete verification -> rejected as a duplicate (existing Prisma unique
  constraint path), no second user row.

## Maps to

- `src/modules/auth/service/email.signup.store.spec.ts` - pending signup
  save/get/delete/TTL.
- `src/modules/auth/service/email.signup.spec.ts` - signup writes a pending
  record, not a Postgres row.
- `src/modules/auth/providers/OTP/otp.router.spec.ts` - end-to-end
  signup -> request -> verify, including the no-pending-signup rejection and
  the duplicate-email rejection.
