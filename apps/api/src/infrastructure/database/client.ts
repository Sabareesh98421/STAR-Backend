// client.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { logger } from "@/infrastructure/logger";
import { ServiceUnavailableError } from "@/shared/errors";
import { TryCatch, type Resolver } from "@/shared/utils/try-catch";
import { databaseConfig } from "@/config";

let prisma: PrismaClient | null = null;

const resolveConnectionError: Resolver<PrismaClient> = (error) => {
    logger.error(error);
    throw new ServiceUnavailableError("Failed to connect to Postgres");
};

export async function connectDatabase(): Promise<PrismaClient> {
    if (prisma) return prisma;
    return TryCatch.of(async () => {
        const adapter = new PrismaPg({ connectionString: databaseConfig.url });
        const client = new PrismaClient({ adapter });
        await client.$connect();
        prisma = client;
        return prisma;
    }).onError(resolveConnectionError);
}

export function getDb(): PrismaClient {
    if (!prisma) {
        throw new ServiceUnavailableError("Database is not connected");
    }
    return prisma;
}

export async function disconnectDatabase(): Promise<void> {
    await prisma?.$disconnect();
    prisma = null;
}
