import Elysia from 'elysia';
import { signupHandler, signInHandler, updatePendingSignupEmailHandler } from '@/modules/auth/service';
import { emailSigninSchema, emailSignupSchema, pendingSignupEmailUpdateSchema } from './email.schema';
import { sessionConfig } from '@/config';
import { emailCookieOptions } from './email.cookie';

const routerConfig = { prefix: '/email' };

export const publicEmailRouter = new Elysia(routerConfig)
    .post('/signup', ({ body }) => signupHandler(body), { body: emailSignupSchema })
    .post(
        '/update-pending-signup-email',
        ({ body }) => updatePendingSignupEmailHandler(body),
        { body: pendingSignupEmailUpdateSchema },
    )
    .post(
        '/signin',
        ({ body, cookie }) =>
            signInHandler(body, (sessionId) => {
                cookie[sessionConfig.cookieName]?.set({ ...emailCookieOptions, value: sessionId });
            }),
        { body: emailSigninSchema }
    );

export default publicEmailRouter;
