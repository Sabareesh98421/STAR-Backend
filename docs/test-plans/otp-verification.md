# OTP verification

Email OTP request/verify flow backed by Redis (code storage, cooldown, attempt
limit) and nodemailer (delivery). Config: `src/config/otp.config.ts`.

## Cases

- Request an OTP, then verify it with the correct code -> succeeds, code is
  single-use (a second verify with the same code fails).
- Verify with a wrong code -> rejected; after `maxAttempts` wrong codes the
  entry is locked out even if the correct code is finally supplied.
- Request an OTP twice within `resendCooldownSeconds` -> second request is
  rejected (too many requests).
- Mail delivery fails after the code was saved -> the save is rolled back
  (not just the cooldown lock) so an immediate retry succeeds.
- Verify with an expired/never-requested code -> rejected as invalid.

## Maps to

- `src/modules/auth/providers/OTP/otp.store.spec.ts` - save/consume/cooldown/lockout.
- `src/modules/auth/providers/OTP/otp.mailer.spec.ts` - delivery success/failure.
- `src/modules/auth/providers/OTP/otp.router.spec.ts` - end-to-end request -> verify over HTTP.
- `src/modules/auth/providers/OTP/otp.generator.spec.ts` - code shape.
