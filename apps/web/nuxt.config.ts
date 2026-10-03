export default defineNuxtConfig({
    compatibilityDate: '2026-09-07',

    // The API is a separate Bun/Elysia process. Nothing in this app talks to a
    // database or a vendor SDK; every byte arrives over the transport layer.
    runtimeConfig: {
        public: {
            apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3000/api',
            wsBase: process.env.NUXT_PUBLIC_WS_BASE ?? 'ws://localhost:3000/ws',
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

    // 3000 belongs to the Elysia API; the two run side by side in dev.
    devServer: { port: 3001 },

    typescript: { strict: true },

    // A run is live, per-user, and streamed. There is nothing to prerender and
    // nothing to cache at the edge, so the client owns the whole surface.
    ssr: false,
})
