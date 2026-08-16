// env.util.ts

// Number(env) || default treats an explicit "0" as falsy and silently overrides
// it with the default - this only falls back when the var is unset or invalid.
export function envNumber(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}
