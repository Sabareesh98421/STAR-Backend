// try-catch.ts
export const NEXT = Symbol("tryCatch.next");

export type Resolver<T> = (error: unknown) => T | typeof NEXT | Promise<T | typeof NEXT>;

export function tryCatch<T>(onError: Resolver<T>) {
    return async (fn: () => Promise<T>): Promise<T> => {
        try {
            return await fn();
        } catch (error: unknown) {
            const resolved = await onError(error);
            if (resolved === NEXT) throw error;
            return resolved;
        }
    };
}

export function pipe<T>(...resolvers: Resolver<T>[]): Resolver<T> {
    return async (error: unknown) => {
        for (const resolver of resolvers) {
            const resolved = await resolver(error);
            if (resolved !== NEXT) return resolved;
        }
        return NEXT;
    };
}
