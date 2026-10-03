// password.config.ts
import { envNumber } from './env.util';

export const passwordConfig = {
    cost: Math.min(31, Math.max(4, envNumber(process.env.PASSWORD_HASH_COST, 10))),
};
