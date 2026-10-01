// email.signup.store.ts
import { getRedis } from "@/infrastructure/redis";
import { signupConfig } from "@/config";

export interface PendingSignup {
    passwordHash: string;
    firstName: string;
    secondName: string | null;
}

export function pendingSignupKey(email: string): string {
    return `signup:pending:${email}`;
}

export async function savePendingSignup(email: string, data: PendingSignup): Promise<void> {
    await getRedis().set(pendingSignupKey(email), JSON.stringify(data), "EX", signupConfig.pendingTtlSeconds);
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
