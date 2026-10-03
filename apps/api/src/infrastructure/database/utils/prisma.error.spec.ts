import { test, expect } from "@playwright/test";
import { Prisma } from "@/generated/prisma/client";
import {
    AppError,
    ConflictError,
    DatabaseError,
    NotFoundError,
    ServiceUnavailableError,
} from "@/shared/errors";
import { toDatabaseError } from "./prisma.error";

function knownRequestError(code: string, meta: Record<string, unknown> = {}) {
    return new Prisma.PrismaClientKnownRequestError("prisma failure", {
        code,
        clientVersion: "test",
        meta,
    });
}

function mapped(error: unknown): AppError {
    try {
        toDatabaseError(error);
    } catch (thrown) {
        return thrown as AppError;
    }
    throw new Error("toDatabaseError returned instead of throwing");
}

test.describe("toDatabaseError", () => {
    test("maps a unique constraint violation to a 409 naming the field", () => {
        const error = mapped(knownRequestError("P2002", { target: ["email"] }));
        expect(error).toBeInstanceOf(ConflictError);
        expect(error.statusCode).toBe(409);
        expect(error.message).toContain("email");
    });

    test("maps a missing record to a 404", () => {
        const error = mapped(knownRequestError("P2025", { modelName: "User" }));
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.statusCode).toBe(404);
    });

    test("maps pool exhaustion and an unreachable server to a retryable 503", () => {
        expect(mapped(knownRequestError("P2024"))).toBeInstanceOf(ServiceUnavailableError);
        expect(mapped(knownRequestError("P1001"))).toBeInstanceOf(ServiceUnavailableError);
        expect(mapped(knownRequestError("P1001")).statusCode).toBe(503);
    });

    test("maps an unmapped prisma code to a 500 that keeps the code", () => {
        const error = mapped(knownRequestError("P2003"));
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.statusCode).toBe(500);
        expect(error.details).toEqual({ prismaCode: "P2003" });
    });

    test("maps a non-prisma failure to a generic 500", () => {
        const error = mapped(new Error("socket hang up"));
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.statusCode).toBe(500);
    });

    test("passes an AppError through untouched", () => {
        const original = new ServiceUnavailableError("Database is not connected");
        expect(mapped(original)).toBe(original);
    });
});
