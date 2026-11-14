import Elysia from 'elysia';
import { sessionConfig } from '@/config';
import { deleteSession } from '@/modules/auth/service/session';
import { UnauthorizedError } from '@/shared/errors';
import { failure, response, success } from '@/shared/http';
import { sessionMiddleware } from '@/server/middleware/session';
import { emailCookieOptions } from '@/modules/auth/providers/email/email.cookie';

const routerConfig = { prefix: '/auth' };

export const privateAuthRouter = new Elysia(routerConfig)
    .use(sessionMiddleware)
    .post('/email/signout', async ({ cookie, user }) => {
        if (!user) return response(failure(new UnauthorizedError()));
        const cookieValue: unknown = cookie[sessionConfig.cookieName]?.value ?? null;
        const sid = typeof cookieValue === 'string' ? cookieValue : null;
        if (sid) await deleteSession(sid);
        cookie[sessionConfig.cookieName]?.set({ ...emailCookieOptions, value: '', maxAge: 0 });
        return response(success());
    })
    .get('/email/me', ({ user }) => {
        if (!user) return response(failure(new UnauthorizedError()));
        return response(success({ id: user.id, email: user.email, plan: user.plan }));
    });

export default privateAuthRouter;