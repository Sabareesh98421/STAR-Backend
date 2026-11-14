// session.ts
import { Elysia } from 'elysia';
import { getSession, refreshSession } from '@/modules/auth/service/session';
import { getInsiderPlan, sessionConfig } from '@/config';

export type SessionUser = { id: string; email: string; plan: string | null };

// Named plugin — Elysia deduplicates by name, so this runs exactly once even
// if multiple routers use it. { as: 'global' } makes ctx.user visible to every
// child plugin, not just the scope this middleware is mounted in.
export const sessionMiddleware = new Elysia({ name: 'mw:session' }).derive(
    { as: 'global' },
    async ({ cookie }): Promise<{ user: SessionUser | null }> => {
        const sessionCookie = cookie[sessionConfig.cookieName] ?? null;
        const cookieValue: unknown = sessionCookie?.value ?? null;
        const sid = typeof cookieValue === 'string' ? cookieValue : null;
        if (!sid) return { user: null };
        const session = await getSession(sid);
        if (!session) return { user: null };
        // Rolling TTL: fire-and-forget — do not block the request for a
        // Redis EXPIRE call that only updates bookkeeping.
        void refreshSession(sid);
        return {
            user: {
                id: session.userId,
                email: session.email,
                plan: getInsiderPlan(session.email),
            },
        };
    }
);
