import { envPort } from './dev-env';

export default defineNuxtConfig({
    compatibilityDate: '2026-09-07',

    // The API is a separate Bun/Elysia process. Nothing in this app talks to a
    // database or a vendor SDK; every byte arrives over the transport layer.
    runtimeConfig: {
        public: {
            // Relative, because the API and this app share ONE origin: the
            // dev proxy below in development, the API serving the built app in
            // production. Nothing here knows a port, so nothing here can drift
            // out of sync with one.
            apiBase: process.env.NUXT_PUBLIC_API_BASE ?? '/api',
            // Under /api, where the socket is actually mounted: the chat
            // socket is part of the same router as every other route, and a
            // base that skipped the prefix 404s at the handshake. A relative
            // WebSocket URL resolves against the page and http:// becomes
            // ws://, so this needs no scheme of its own.
            wsBase: process.env.NUXT_PUBLIC_WS_BASE ?? '/api/ws',
        },
    },

    // @nuxt/ui brings Tailwind 4, color-mode, fonts and Reka with it, so none
    // of those are separate dependencies.
    modules: ['@nuxt/ui'],
    fonts: {
        families: [
            { name: 'IBM Plex Sans', provider: 'google', weights: [400, 500, 600] },
            { name: 'IBM Plex Mono', provider: 'google', weights: [400, 500] },
        ],
    },

    css: ['~/assets/css/main.css'],

    // The HMR workflow. Not how the app ships — the API serves the built SPA
    // and is the only server there — but while working on the front end this
    // gives hot reload, and everything under /api is proxied to the API so the
    // page still sees ONE origin and the relative bases above keep working.
    //
    // Ports come from the monorepo's single .env, which Bun loads before this
    // process starts; the defaults match the API's own defaults.
    devServer: { port: envPort('WEB_PORT', 3001) },
    nitro: {
        // HTTP only. devProxy cannot carry a WebSocket upgrade whatever it is
        // passed — Nitro's dev server hands upgrades straight to its own
        // worker without consulting devProxy — and a chat run IS a WebSocket,
        // so that half lives in modules/dev-ws-proxy.ts.
        devProxy: {
            '/api': { target: `http://localhost:${envPort('API_PORT', 3000)}/api` },
        },
    },

    typescript: { strict: true },

    // Load-bearing, not a default left alone. `ssr: false` + `nuxt generate`
    // emits a static SPA that the Elysia API serves itself, which is the whole
    // reason this monorepo runs as ONE server. Turning SSR on means rendering
    // per request, which means Nitro running as a second (Node) server beside
    // the API — the thing we removed. A run is live, per-user and streamed, so
    // there is nothing to prerender anyway.
    ssr: false,
})
