// signup.config.ts
import { envNumber } from './env.util';

export const signupConfig = {
    pendingTtlSeconds: envNumber(process.env.SIGNUP_PENDING_TTL_SECONDS, 900),
};
