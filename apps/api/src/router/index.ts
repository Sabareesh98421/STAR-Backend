import { Elysia } from 'elysia';
import privateRouter from './private.router';
import publicRouter from './public.router';

const apiRouter = new Elysia()
    .use(publicRouter)
    .use(privateRouter);

export default apiRouter;