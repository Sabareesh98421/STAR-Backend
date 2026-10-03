// password.util.ts
import { passwordConfig } from '@/config';

const ALGORITHM = "bcrypt" as const;

export function hashPassword(plain: string): Promise<string> {
    return Bun.password.hash(plain, { algorithm: ALGORITHM, cost: passwordConfig.cost });
}

const ABSENT_USER_HASH = await hashPassword(crypto.randomUUID());

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
    const matches = await Bun.password.verify(plain, stored ?? ABSENT_USER_HASH);
    return stored === null ? false : matches;
}
