// session.config.ts
import { envNumber } from './env.util';

export const sessionConfig = {
    // Rolling TTL: every authenticated request resets the clock.
    // Default: 7 days. Set SESSION_TTL_SECONDS to override.
    ttlSeconds: envNumber(process.env.SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
    cookieName: process.env.SESSION_COOKIE_NAME ?? 'sid',
};
