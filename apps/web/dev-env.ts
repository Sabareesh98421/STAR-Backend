// dev-env.ts — ports, read from the environment Bun already loaded.
//
// There is one .env, at the monorepo root, and Bun loads it into the process
// that runs the dev scripts; every child inherits it. So this app reads the
// same API_PORT and WEB_PORT the API reads, out of process.env, with no second
// copy of the value and nothing here that parses a file.
//
// Dev-time only — nothing the browser runs imports this.

/**
 * A port from the environment, or `fallback` when it is unset or not a port.
 *
 * Not `Number(x) || fallback`: that treats a legitimate 0 as missing. Same
 * rule as `envNumber` in the API's config, which is the other reader of these
 * exact variables.
 */
export function envPort(key: string, fallback: number): number {
    const value = Number(process.env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
