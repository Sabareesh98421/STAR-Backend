// client.ts
import Redis from "ioredis";
import { logger } from "@/infrastructure/logger";
import { ServiceUnavailableError } from "@/shared/errors";
import { TryCatch, type Resolver } from "@/shared/utils/try-catch";
import { redisConfig } from "@/config";

let redis: Redis | null = null;

const resolveConnectionError: Resolver<Redis> = (error) => {
    logger.error(error);
    throw new ServiceUnavailableError("Failed to connect to Redis");
};

const resolveConnectFailure = (client: Redis): Resolver<void> => (error) => {
    client.disconnect();
    throw error;
};

export async function connectRedis(): Promise<Redis> {
    if (redis) return redis;
    return TryCatch.of(async () => {
        const client = new Redis({
            ...redisConfig,
            password: redisConfig.password ?? undefined,
            lazyConnect: true,
            maxRetriesPerRequest: 3,
        });
        client.on("error", (error) => logger.error(error, "Redis connection error"));
        await TryCatch.of(() => client.connect()).onError(resolveConnectFailure(client));
        redis = client;
        return redis;
    }).onError(resolveConnectionError);
}

export function getRedis(): Redis {
    if (!redis) {
        throw new ServiceUnavailableError("Redis is not connected");
    }
    return redis;
}

export async function disconnectRedis(): Promise<void> {
    await redis?.quit();
    redis = null;
}
