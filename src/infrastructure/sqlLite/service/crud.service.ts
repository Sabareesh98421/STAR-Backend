// crud.service.ts
export function serializeUser<T>(data: T): string {
    // Sorted keys = stable JSON regardless of construction order.
    // Only handles top-level keys — revisit if User ever gets nested objects.
    return JSON.stringify(data, Object.keys(data as object).sort());
}