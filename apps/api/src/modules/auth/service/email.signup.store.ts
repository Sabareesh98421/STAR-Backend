// email.signup.store.ts
import { getRedis } from "@/infrastructure/redis";
import { signupConfig } from "@/config";
import { cooldownKey, otpKey } from "@/modules/auth/providers/OTP/otp.store";
import { OtpPurpose } from "@/modules/auth/shared";
import type { PendingSignup } from "@/modules/auth/shared";

const MOVE_PENDING_SIGNUP = `
if redis.call("EXISTS", KEYS[1]) == 0 then return 0 end
if redis.call("EXISTS", KEYS[2]) == 1 then return -1 end
redis.call("RENAMENX", KEYS[1], KEYS[2])
redis.call("DEL", KEYS[3], KEYS[4])
return 1
`;

export type PendingSignupEmailMove = 'moved' | 'missing' | 'conflict';

export function pendingSignupKey(email: string): string {
    return `signup:pending:${email}`;
}

export async function savePendingSignup(email: string, data: PendingSignup): Promise<void> {
    await getRedis().set(pendingSignupKey(email), JSON.stringify(data), "EX", signupConfig.pendingTtlSeconds);
}

export async function createPendingSignup(email: string, data: PendingSignup): Promise<boolean> {
    const result = await getRedis().set(
        pendingSignupKey(email),
        JSON.stringify(data),
        "EX",
        signupConfig.pendingTtlSeconds,
        "NX",
    );
    return result === 'OK';
}

export async function movePendingSignupEmail(
    currentEmail: string,
    newEmail: string,
): Promise<PendingSignupEmailMove> {
    const result = await getRedis().eval(
        MOVE_PENDING_SIGNUP,
        4,
        pendingSignupKey(currentEmail),
        pendingSignupKey(newEmail),
        otpKey(OtpPurpose.VerifyEmail, currentEmail),
        cooldownKey(OtpPurpose.VerifyEmail, currentEmail),
    );
    if (result === 1) return 'moved';
    return result === 0 ? 'missing' : 'conflict';
}

export async function hasPendingSignup(email: string): Promise<boolean> {
    return (await getRedis().exists(pendingSignupKey(email))) === 1;
}

export async function getPendingSignup(email: string): Promise<PendingSignup | null> {
    const raw = await getRedis().get(pendingSignupKey(email));
    return raw ? (JSON.parse(raw) as PendingSignup) : null;
}

export async function deletePendingSignup(email: string): Promise<void> {
    await getRedis().del(pendingSignupKey(email));
}
