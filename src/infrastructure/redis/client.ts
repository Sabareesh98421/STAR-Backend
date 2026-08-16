// client.ts
import Redis from "ioredis";
import { logger } from "@/infrastructure/logger";
import { AppError } from "@/shared/errors";
import appErrorCodes from "@/shared/errors/app.error.codes";
import { TryCatch, type Resolver } from "@/shared/utils/try-catch";
import { redisConfig } from "@/config";

let redis: Redis | null = null;

const resolveConnectionError: Resolver<Redis> = (error) => {
    logger.error(error);
    throw new AppError(
        "Failed to connect to Redis",
        appErrorCodes.redisStartError.toString(),
        500
    );
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
        throw new AppError(
            "Redis is not yet started, connect it first",
            appErrorCodes.redisStartError.toString(),
            500
        );
    }
    return redis;
}

export async function disconnectRedis(): Promise<void> {
    await redis?.quit();
    redis = null;
}
