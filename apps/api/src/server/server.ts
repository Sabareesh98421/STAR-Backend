import {Elysia} from 'elysia';
import masterRouter from './router';
import { connectDatabase, disconnectDatabase } from '@/infrastructure/database';
import { connectRedis, disconnectRedis } from '@/infrastructure/redis';
import { logger } from '@/infrastructure/logger';
import { serverConfig } from '@/config';
import { TryCatch, type Resolver } from '@/shared/utils/try-catch';

const logStartupFailure = (message: string): Resolver<void> => (error) => {
    logger.error(error, message);
    throw error;
};

await TryCatch.of(async () => { await connectDatabase(); })
    .onError(logStartupFailure('Database connection failed at startup, requests needing the database will fail until it reconnects'));
await TryCatch.of(async () => { await connectRedis(); })
    .onError(logStartupFailure('Redis connection failed at startup, OTP endpoints will fail until it reconnects'));

// Binds exclusively. Elysia's Bun adapter defaults to reusePort: true, which
// is why several processes could silently share this exact port before -
// reusePort: false here overrides that (it's spread after Elysia's default).
// If the port is genuinely taken, walk forward one at a time (never a random
// port) so whichever one it lands on is easy to find and stop.
function startServer(port: number, attemptsLeft: number): Elysia {
    try {
        return new Elysia().use(masterRouter).listen({ port, reusePort: false }, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        if (attemptsLeft <= 0) {
            logger.error(error, `Could not bind any port from ${serverConfig.port} to ${port}`);
            throw error;
        }
        logger.warn(error, `Port ${port} is already in use, trying port ${port + 1}`);
        return startServer(port + 1, attemptsLeft - 1);
    }
}

const server = startServer(serverConfig.port, serverConfig.maxPortAttempts);

// Mandatory cleanup: release the port and close the DB/Redis connections on
// shutdown instead of leaving them dangling for the next start to trip over.
async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, closing server`);
    await server.stop();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export default server;