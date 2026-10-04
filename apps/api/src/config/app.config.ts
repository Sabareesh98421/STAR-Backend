// app.config.ts
import { envNumber } from './env.util';

export const appConfig = {
    isProduction: process.env.NODE_ENV === "production",
    /**
     * Browser origins allowed to call this API. The web app is a separate
     * process on its own port, so every request from it is cross-origin and
     * fails the preflight without this — the request never leaves the browser
     * and the API sees nothing at all, which looks like a backend that ignored
     * the call rather than a browser that refused to make it.
     *
     * An allowlist, not '*': credentials are coming, and '*' is incompatible
     * with them. Comma-separated in WEB_ORIGINS to add a deployed front end.
     *
     * Built from WEB_PORT rather than naming a port of its own, because the
     * web app reads the SAME variable for the port it listens on — so moving
     * the dev server is one edit, not one edit plus a matching allowlist entry
     * that is only noticed when the socket starts answering 401.
     *
     * REQUIRED in a deployment. Same-origin handshakes skip this list only on
     * loopback (see `isAllowedOrigin`) — a public hostname is not trusted just
     * because the request claims it, or DNS rebinding would walk straight in.
     */
    webOrigins: (process.env.WEB_ORIGINS ?? `http://localhost:${envNumber(process.env.WEB_PORT, 3001)}`)
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
};
