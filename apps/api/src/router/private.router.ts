import { Elysia } from 'elysia';
import { privateAuthRouter } from '@/modules/auth/routes';
import { ensembleRoutes } from '@/modules/ensemble';
import { UnauthorizedError } from '@/shared/errors';
import { failure, response } from '@/shared/http';
import { socketRouter } from '@/socket';
import { sessionMiddleware } from '@/server/middleware/session';

const privateRouter = new Elysia()
    .use(sessionMiddleware)
    .onBeforeHandle(({ user }) => {
        if (user) return;
        return response(failure(new UnauthorizedError()));
    })
    .use(privateAuthRouter)
    .use(ensembleRoutes)
    .use(socketRouter);

export default privateRouter;