// modules/dev-ws-proxy.ts — proxies the chat WebSocket to the API in dev.
//
// `nitro.devProxy` forwards HTTP only. Its dev-server `handleUpgrade` hands
// the socket straight to the Nitro worker and never looks at devProxy at all
// (read in nitropack 2.13.4), so an upgrade under /api arrives at the Nuxt app
// instead of the API and is answered with a 200 and the app shell — which
// surfaces in the browser as a bare WebSocket `error` with no status to blame.
// Checked, not assumed: `curl -H 'Upgrade: websocket' localhost:3001/api/ws/...`
// returned the HTML of the page.
//
// So the upgrade is intercepted here, ahead of Nitro. Delete this file the day
// Nitro proxies upgrades itself.
//
// DEV ONLY, and it must stay that way: this forwards whatever arrives to the
// API with no authentication of its own. The gate is the API's own handshake
// check (`isAllowedOrigin`), which is why the headers below are replayed
// verbatim rather than rewritten.
import net from 'node:net';
import { defineNuxtModule } from 'nuxt/kit';
import { envPort } from '../dev-env';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/** Trailing slash: `/api/wsfoo` is not this socket and must not be tunnelled. */
const WS_PREFIX = '/api/ws/';

/**
 * A request line is built by hand below, so anything going into it has to be
 * free of CR/LF or a crafted method/target could inject headers — or a whole
 * second request — into the connection to the API. Node's HTTP parser already
 * rejects these, so this is the second lock on the same door, not the first.
 */
const CLEAN = /^[^\r\n]*$/;

export default defineNuxtModule({
    meta: { name: 'dev-ws-proxy' },
    setup(_options, nuxt) {
        // Production is one server: the API serves the built app, so there is
        // nothing to proxy and no dev server to proxy from.
        if (!nuxt.options.dev) return;

        nuxt.hook('listen', (server) => {
            // Taken over rather than prepended: both listeners would otherwise
            // fire for the same upgrade, and Nitro's would go on to pipe its
            // own worker into a socket we are already using.
            const passthrough = server.listeners('upgrade') as Array<
                (req: IncomingMessage, socket: Duplex, head: Buffer) => void
            >;
            server.removeAllListeners('upgrade');

            server.on('upgrade', (req, socket, head) => {
                // Vite's HMR socket is an upgrade too, and it is not ours.
                if (!req.url?.startsWith(WS_PREFIX)) {
                    for (const listener of passthrough) listener.call(server, req, socket, head);
                    return;
                }

                if (!CLEAN.test(req.url) || !CLEAN.test(req.method ?? '')) {
                    socket.destroy();
                    return;
                }

                // A WebSocket upgrade is one HTTP request and then raw frames,
                // so replaying the request line upstream and piping both ways
                // IS the whole proxy — no library, nothing to keep in step with
                // the frame format. The target is a fixed loopback address, not
                // anything the request can influence, so this cannot be aimed
                // at a third host. rawHeaders is replayed verbatim so
                // Sec-WebSocket-Key and Origin arrive exactly as sent; the API
                // checks Origin at the handshake and a rewritten one would
                // either break the check or quietly defeat it.
                const upstream = net.connect(envPort('API_PORT', 3000), '127.0.0.1', () => {
                    const lines = [`${req.method} ${req.url} HTTP/1.1`];
                    for (let i = 0; i < req.rawHeaders.length; i += 2) {
                        const name = req.rawHeaders[i] ?? '';
                        const value = req.rawHeaders[i + 1] ?? '';
                        if (!CLEAN.test(name) || !CLEAN.test(value)) {
                            socket.destroy();
                            upstream.destroy();
                            return;
                        }
                        lines.push(`${name}: ${value}`);
                    }
                    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
                    // Bytes the client sent already, read off the socket before
                    // we got here. Dropping them loses the first frame.
                    if (head?.length) upstream.write(head);
                    socket.pipe(upstream);
                    upstream.pipe(socket);
                });

                // Either end dying takes both down: a half-open tunnel looks to
                // the browser like a live socket that never answers, and a
                // socket left open is a file descriptor that never comes back.
                const bail = () => {
                    socket.destroy();
                    upstream.destroy();
                };
                upstream.on('error', bail);
                socket.on('error', bail);
                socket.on('close', bail);
                upstream.on('close', bail);
            });
        });
    },
});
