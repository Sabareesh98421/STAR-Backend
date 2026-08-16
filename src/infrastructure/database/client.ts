// client.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { logger } from "@/infrastructure/logger";
import { AppError } from "@/shared/errors";
import appErrorCodes from "@/shared/errors/app.error.codes";
import { tryCatch, type Resolver } from "@/shared/utils/try-catch";

let prisma: PrismaClient | null = null;

const resolveConnectionError: Resolver<PrismaClient> = (error) => {
    logger.error(error);
    throw new AppError(
        "Failed to connect to Postgres",
        appErrorCodes.dbStartError.toString(),
        500
    );
};

const withConnectionErrorHandling = tryCatch(resolveConnectionError);

export async function connectDatabase(): Promise<PrismaClient> {
    if (prisma) return prisma;
    return withConnectionErrorHandling(async () => {
        const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
        const client = new PrismaClient({ adapter });
        await client.$connect();
        prisma = client;
        return prisma;
    });
}

export function getDb(): PrismaClient {
    if (!prisma) {
        throw new AppError(
            "Db is not yet started, connect it first",
            appErrorCodes.dbStartError.toString(),
            500
        );
    }
    return prisma;
}

export async function disconnectDatabase(): Promise<void> {
    await prisma?.$disconnect();
    prisma = null;
}
