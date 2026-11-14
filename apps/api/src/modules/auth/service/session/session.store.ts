// session.store.ts
import { randomBytes, randomUUID } from "node:crypto";
import { getRedis } from "@/infrastructure/redis";
import { sessionConfig } from "@/config";

const { ttlSeconds: TTL_SECONDS } = sessionConfig;

// Strategy: notes/auth/session-id-strategy.md
function generateSessionId(): string {
    const uuidPrefix = randomUUID().split("-")[0];
    const saltLength = 4 + (randomBytes(1)[0]! % 2);
    const salt = randomBytes(saltLength + 1).toString("base64url").slice(0, saltLength);
    return `${uuidPrefix}-${salt}-${Date.now()}`;
}

export interface SessionData {
    userId: string;
    email: string;
    createdAt: string;
    lastSeenAt: string;
}

export function sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
}

export async function createSession(userId: string, email: string): Promise<string> {
    const sessionId = generateSessionId();
    const now = new Date().toISOString();
    const data: SessionData = { userId, email, createdAt: now, lastSeenAt: now };
    // Pipeline: hset + expire are one atomic batch — a crash between two
    // separate calls would leave the key with no TTL and it would live forever.
    await getRedis()
        .pipeline()
        .hset(sessionKey(sessionId), data)
        .expire(sessionKey(sessionId), TTL_SECONDS)
        .exec();
    return sessionId;
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
    const record = await getRedis().hgetall(sessionKey(sessionId));
    // Validate all fields explicitly — hgetall returns Record<string, string>
    // and a cast would silently pass undefined through as SessionData.
    if (!record.userId || !record.email || !record.createdAt || !record.lastSeenAt) {
        return null;
    }
    return {
        userId: record.userId,
        email: record.email,
        createdAt: record.createdAt,
        lastSeenAt: record.lastSeenAt,
    };
}

// Resets the TTL on every authenticated request so active users are never
// logged out mid-session. Idle sessions still expire after TTL_SECONDS.
export async function refreshSession(sessionId: string): Promise<void> {
    // Pipeline: same atomicity reason as createSession.
    await getRedis()
        .pipeline()
        .hset(sessionKey(sessionId), "lastSeenAt", new Date().toISOString())
        .expire(sessionKey(sessionId), TTL_SECONDS)
        .exec();
}

export async function deleteSession(sessionId: string): Promise<void> {
    await getRedis().del(sessionKey(sessionId));
}
