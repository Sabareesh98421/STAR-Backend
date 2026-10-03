// prisma.error.ts
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infrastructure/logger";
import {
    AppError,
    ConflictError,
    DatabaseError,
    NotFoundError,
    ServiceUnavailableError,
} from "@/shared/errors";

const prismaErrorCode = {
    uniqueConstraint: "P2002",
    recordNotFound: "P2025",
    poolTimeout: "P2024",
    authFailed: "P1000",
    unreachable: "P1001",
    serverTimeout: "P1002",
    operationTimeout: "P1008",
    connectionClosed: "P1017",
} as const;

function conflictTarget(error: Prisma.PrismaClientKnownRequestError): string {
    const target = error.meta?.target ?? null;
    if (Array.isArray(target)) return target.join(", ");
    return typeof target === "string" ? target : "value";
}

export function toDatabaseError(error: unknown): never {
    if (error instanceof AppError) throw error;

    logger.error(error, "Database request failed");

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case prismaErrorCode.uniqueConstraint:
                throw new ConflictError(`${conflictTarget(error)} already exists`);
            case prismaErrorCode.recordNotFound:
                throw new NotFoundError(String(error.meta?.modelName ?? "Record"));
            case prismaErrorCode.poolTimeout:
                throw new ServiceUnavailableError("Database is busy, retry shortly");
            case prismaErrorCode.authFailed:
            case prismaErrorCode.unreachable:
            case prismaErrorCode.serverTimeout:
            case prismaErrorCode.operationTimeout:
            case prismaErrorCode.connectionClosed:
                throw new ServiceUnavailableError("Database is unavailable");
            default:
                throw new DatabaseError("Database request failed", { prismaCode: error.code });
        }
    }

    if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError
    ) {
        throw new ServiceUnavailableError("Database is unavailable");
    }

    throw new DatabaseError();
}
