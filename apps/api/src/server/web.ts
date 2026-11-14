// server/web.ts — the built web app, served by the API.
//
// One origin, one process in production: the browser fetches the page and
// calls /api from the same place, so there is no CORS preflight and no
// cross-origin WebSocket handshake. In development this does nothing — Nuxt's
// own dev server owns the page and proxies /api back here (see
// apps/web/nuxt.config.ts), because a dev server is what HMR needs.
import path from 'node:path';
import { Elysia } from 'elysia';
import { logger } from '@/infrastructure/logger';

/**
 * Where `nuxt generate` writes the static SPA.
 *
 * generate, not build: with ssr:false, `nuxt build` still emits a Nitro server
 * that renders the shell at request time, so .output/public comes out with the
 * assets and NO index.html — a second server, which is the thing we are here
 * to get rid of. `nuxt generate` writes the shell to disk instead, and then
 * this is the only server left.
 *
 * Overridable because a container will not keep the two apps in their
 * workspace layout.
 */
export const webRoot = path.resolve(
    process.env.WEB_DIST ?? path.resolve(import.meta.dir, '../../../web/.output/public'),
);

/**
 * Which file on disk answers a URL path, or null if the path tries to leave
 * the web root.
 *
 * A URL pathname is attacker-controlled: it reaches us before any router and
 * can carry `..`, percent-encoded or not. Decoding BEFORE normalising is what
 * makes `%2e%2e%2f` the same thing as `../`; normalising an absolute path is
 * what clamps the `..` at the root instead of walking above it. Matching on
 * the raw string catches neither. The containment check after is belt and
 * braces — unreachable while normalise runs first, and the thing that still
 * fails closed if that line is ever changed.
 *
 * Anything that is not a file is the SPA's index, so a client-side route
 * survives a refresh instead of 404ing.
 */
export function resolveWebFile(given: string, urlPath: string): string | null {
    // Normalised before anything is compared against it. The containment check
    // below tests `root + sep`, so a root with a trailing slash made that
    // `/srv/web//`, which nothing matches — one character in WEB_DIST and every
    // request in the deployment answered 400, the index included.
    const root = path.resolve(given);
    const index = path.join(root, 'index.html');
    let decoded: string;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch {
        return null; // malformed percent-encoding: not a path we will guess at
    }
    if (decoded.includes('\0')) return null;

    const resolved = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
    return resolved === root ? index : resolved;
}

/**
 * The wildcard is always registered; whether a build exists is decided once at
 * startup, not per request. Without a build (development, where Nuxt's own dev
 * server owns the page) it answers 404 — the same thing an unrouted path would
 * have got anyway.
 */
export async function webRoutes() {
    const index = Bun.file(path.join(webRoot, 'index.html'));
    const built = await index.exists();
    if (!built) logger.info({ webRoot }, 'No web build found, serving the API only');

    return new Elysia({ name: 'web' }).get('/*', async ({ path: urlPath, status }) => {
        // An unmatched /api path is an API 404. Without this the wildcard
        // would hand a client expecting JSON the HTML of the app shell.
        if (!built || urlPath.startsWith('/api')) return status(404);

        const file = resolveWebFile(webRoot, urlPath);
        if (file === null) return status(400);

        const asset = Bun.file(file);
        return (await asset.exists()) ? asset : index;
    });
}
