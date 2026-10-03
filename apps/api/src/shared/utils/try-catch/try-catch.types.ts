import type { NEXT } from './try-catch';

export type Resolver<T> = (error: unknown) => T | typeof NEXT | Promise<T | typeof NEXT>;
