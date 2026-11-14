import {Elysia} from 'elysia';
import masterRouter from './router';
import { webRoutes } from './web';
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

// Awaited before the server binds, so a request can never arrive while we are
// still deciding whether there is a web build to serve.
const web = await webRoutes();

// Binds exclusively. Elysia's Bun adapter defaults to reusePort: true, which
// is why several processes could silently share this exact port before -
// reusePort: false here overrides that (it's spread after Elysia's default).
// If the port is genuinely taken, walk forward one at a time (never a random
// port) so whichever one it lands on is easy to find and stop.
// The web wildcard goes on LAST: it answers anything the API did not, and
// mounted first it would swallow routes that have a real handler. A fresh
// instance per attempt, so a half-bound one is never retried.
const buildApp = () => new Elysia().use(masterRouter).use(web);

function startServer(port: number, attemptsLeft: number): ReturnType<typeof buildApp> {
    try {
        return buildApp().listen({ port, reusePort: false }, () => {
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
let shuttingDown = false;

async function shutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, closing server`);
    await server.stop();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception, shutting down');
    void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection, shutting down');
    void shutdown('unhandledRejection', 1);
});

export default server;
