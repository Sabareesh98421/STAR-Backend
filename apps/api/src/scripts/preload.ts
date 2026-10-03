// preload.ts
//
// Plants a ready-to-use identity so local work never depends on receiving mail.
// DEV_OTP is planted in Redis for DEV_EMAIL alongside a pending signup, so a
// single POST /otp/verify returns 200 and creates the real Postgres user through
// the real code path - no mail sent, no mail received. Driven by the env file:
//
//   DEV_MODE=true
//   DEV_EMAIL=any@email.the.dev.wants
//   DEV_OTP=123098
//   DEV_PASS=<your choice>
//
// Every one of them is required. DEV_PASS deliberately has no default: a hardcoded
// fallback means an account exists with a password nobody chose, which is fine
// right up until signin lands and that constant is still sitting in the row.
//
// Run it on demand:  bun run src/scripts/preload.ts
//
// Not imported by the server. This file is untracked, so a tracked import would
// fail to resolve on any other checkout.
import { connectDatabase, disconnectDatabase, userRepository } from "@/infrastructure/database";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import { saveOtp, otpKey, cooldownKey } from "@/modules/auth/providers/OTP";
import { savePendingSignup } from "@/modules/auth/service";
import { OtpPurpose } from "@/modules/auth/shared";
import { appConfig, otpConfig, signupConfig } from "@/config";

export async function preload(): Promise<void> {
    // DEV_MODE is a convenience switch, not the safety boundary - NODE_ENV is.
    // A .env copied onto a real box must not be one variable away from planting
    // a known-credential account in production.
    if (appConfig.isProduction) throw new Error("preload refuses to run with NODE_ENV=production");
    if (process.env.DEV_MODE !== "true") return;

    const email = process.env.DEV_EMAIL ?? null;
    const otp = process.env.DEV_OTP ?? null;
    // Empty string counts as unset - DEV_PASS= in the env file is not a choice.
    const password = process.env.DEV_PASS || null;
    if (!email || !otp || !password) {
        throw new Error("DEV_MODE=true requires DEV_EMAIL, DEV_OTP and DEV_PASS to all be set");
    }

    // otp.schema.ts checks z.string().length(otpConfig.length). A DEV_OTP of the
    // wrong length is rejected at schema validation before it ever reaches the
    // store, so catch it here where the message can say why.
    if (otp.length !== otpConfig.length) {
        throw new Error(`DEV_OTP must be exactly ${otpConfig.length} characters (OTP_LENGTH), got ${otp.length}`);
    }

    // verifyOtp is hardwired to the pending-signup -> create-user path, so an
    // address that already has a row can never get a 200 out of /otp/verify.
    // Nothing left to plant in that case - the account it would have produced
    // is already there.
    const existing = await userRepository.findByEmail(email);
    if (existing) {
        console.log(`user      ${email} already registered, id=${existing.id}`);
        console.log(`otp       not planted - /otp/verify would 409 for a registered address`);
        console.log(`          Change DEV_EMAIL, or delete the row, to re-run the verify flow.`);
        return;
    }

    await savePendingSignup(email, {
        passwordHash: await Bun.password.hash(password),
        firstName: "Dev",
        secondName: null,
    });

    // Planted through the real saveOtp, never by writing the hash by hand: the
    // hash format lives in otp.store.ts and is module-private, so a hand-rolled
    // copy here would keep "working" on the day that format changes. Clearing
    // the cooldown key first is what makes re-running this idempotent - saveOtp
    // throws TooManyRequestsError while a previous lock is still alive.
    await getRedis().del(otpKey(OtpPurpose.VerifyEmail, email), cooldownKey(OtpPurpose.VerifyEmail, email));
    await saveOtp(OtpPurpose.VerifyEmail, email, otp);

    console.log(`pending   ${email} parked for ${signupConfig.pendingTtlSeconds}s`);
    console.log(`otp       ${otp} valid ${otpConfig.ttlSeconds}s (raise OTP_TTL_SECONDS for a longer window)`);
    console.log(`next      POST /api/auth/otp/verify {"email":"${email}","purpose":"${OtpPurpose.VerifyEmail}","otp":"${otp}"}`);
    console.log(`          -> 200, and the Postgres user is created. Re-run this to plant again.`);
}

if (import.meta.main) {
    await connectDatabase();
    await connectRedis();
    await preload();
    await disconnectDatabase();
    await disconnectRedis();
}
