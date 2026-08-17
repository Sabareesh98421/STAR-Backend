// redis.config.ts
import { envNumber } from './env.util';

export const redisConfig = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: envNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || null,
    db: envNumber(process.env.REDIS_DB, 0),
};
