import Elysia from 'elysia';
import { publicEmailRouter } from '@/modules/auth/providers/email';
import { otpRouter } from '@/modules/auth/providers/OTP';

const routerConfig = { prefix: '/auth' };

export const publicAuthRouter = new Elysia(routerConfig)
    .use(publicEmailRouter)
    .use(otpRouter);

export default publicAuthRouter;