// otp.store.ts
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getRedis } from "@/infrastructure/redis";
import { ValidationError, TooManyRequestsError } from "@/shared/errors";
import { otpConfig } from "@/config";
import { TryCatch } from "@/shared/utils/try-catch";

// Atomically deletes the OTP only if it's still the same one `token` names -
// prevents discardOtp from wiping out a newer OTP saved by a concurrent request
// after this one's cooldown lock already expired.
const DISCARD_IF_MATCHING_TOKEN = `
if redis.call("HGET", KEYS[1], "token") == ARGV[1] then
  redis.call("DEL", KEYS[1], KEYS[2])
  return 1
end
return 0
`;

const { ttlSeconds: TTL_SECONDS, maxAttempts: MAX_ATTEMPTS, resendCooldownSeconds: RESEND_COOLDOWN_SECONDS } = otpConfig;

export function otpKey(purpose: string, identifier: string): string {
    return `otp:${purpose}:${identifier}`;
}

export function cooldownKey(purpose: string, identifier: string): string {
    return `otp:cooldown:${purpose}:${identifier}`;
}

function hashOtp(otp: string, key: string): Buffer {
    return createHash("sha256").update(`${key}:${otp}`).digest();
}

export async function saveOtp(purpose: string, identifier: string, otp: string): Promise<string> {
    const redis = getRedis();
    const key = otpKey(purpose, identifier);
    const lockKey = cooldownKey(purpose, identifier);

    const gotLock = await redis.set(lockKey, "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
    if (!gotLock) {
        throw new TooManyRequestsError("OTP already sent recently, please wait before requesting a new one");
    }

    const token = randomUUID();
    const hash = hashOtp(otp, key).toString("hex");
    await TryCatch.of(() => redis.multi().hset(key, { hash, attempts: 0, token }).expire(key, TTL_SECONDS).exec())
        .onError(async (error) => {
            await redis.del(lockKey);
            throw error;
        });
    return token;
}

// Called when delivery (e.g. the email send) fails after saveOtp already set the
// cooldown lock — without this, a transient SMTP failure would leave the caller
// locked out from retrying for the full cooldown window despite receiving nothing.
// `token` must be the one saveOtp returned, so this only clears the OTP it saved -
// not a newer one a concurrent request may have saved after this one's lock expired.
export async function discardOtp(purpose: string, identifier: string, token: string): Promise<void> {
    const redis = getRedis();
    await redis.eval(
        DISCARD_IF_MATCHING_TOKEN,
        2,
        otpKey(purpose, identifier),
        cooldownKey(purpose, identifier),
        token
    );
}

export async function consumeOtp(purpose: string, identifier: string, otp: string): Promise<void> {
    const redis = getRedis();
    const key = otpKey(purpose, identifier);

    const record = await redis.hgetall(key);
    if (!record.hash) {
        throw new ValidationError("OTP has expired or was not requested");
    }

    if (Number(record.attempts ?? 0) >= MAX_ATTEMPTS) {
        await redis.del(key);
        throw new TooManyRequestsError("Too many incorrect attempts, request a new OTP");
    }

    const isValid = timingSafeEqual(Buffer.from(record.hash, "hex"), hashOtp(otp, key));
    if (!isValid) {
        await redis.hincrby(key, "attempts", 1);
        throw new ValidationError("Invalid OTP");
    }

    await redis.del(key);
}
