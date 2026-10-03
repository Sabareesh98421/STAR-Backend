// Elysia's built-in onError `code` values we branch on. Elysia only exposes
// these as string-literal types, not values, so this enum gives call sites a
// reusable value to compare against instead of hardcoding the string.
export enum ElysiaErrorCode {
    VALIDATION = 'VALIDATION',
    PARSE = 'PARSE',
}
