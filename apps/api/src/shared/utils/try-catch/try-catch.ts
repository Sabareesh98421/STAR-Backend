// try-catch.ts
import { AppError, AppErrorCode } from '@/shared/errors';
import { logger } from '@/infrastructure/logger';
import type { Resolver } from './try-catch.types';

export const NEXT = Symbol("tryCatch.next");

// Passes an existing AppError through unchanged, wraps anything else as a generic one.
export function toAppError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    return new AppError("Internal server error", AppErrorCode.INTERNAL_ERROR, 500);
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
