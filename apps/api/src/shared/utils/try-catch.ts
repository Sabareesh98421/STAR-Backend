// try-catch.ts
import { AppError } from '@/shared/errors';
import appErrorCodes from '@/shared/errors/app.error.codes';
import { logger } from '@/infrastructure/logger';

export const NEXT = Symbol("tryCatch.next");

export type Resolver<T> = (error: unknown) => T | typeof NEXT | Promise<T | typeof NEXT>;

// Passes an existing AppError through unchanged, wraps anything else as a generic one.
export function toAppError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    return new AppError("Internal server error", appErrorCodes.internalError.toString(), 500);
}

// Runs fn; on failure, resolver may recover it, otherwise it's normalized to an AppError.
export class TryCatch<T> {
    private constructor(private readonly fn: () => Promise<T>) {}

    static of<T>(fn: () => Promise<T>): TryCatch<T> {
        return new TryCatch(fn);
    }

    async onError(resolver?: Resolver<T>): Promise<T> {
        try {
            return await this.fn();
        } catch (error) {
            if (resolver) {
                const resolved = await resolver(error);
                if (resolved !== NEXT) return resolved;
            }
            logger.error(error, "Unhandled error normalized to a generic AppError");
            throw toAppError(error);
        }
    }
}
