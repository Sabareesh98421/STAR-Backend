/**
 * One socket per chat.
 *
 * `/ws/chat/:id` is a conversation's connection: it is where a turn is asked
 * for and where that turn's messages arrive. A connection and a conversation
 * are deliberately the same thing — two chats open in two tabs are two sockets,
 * and neither sees the other's traffic.
 *
 * Thin on purpose. Everything that decides anything is in
 * `modules/ensemble/ensemble.live.ts` and takes a plain callback, so the replay,
 * the fan-out and the lock are all testable without a server.
 */
import { Elysia } from 'elysia';
import { appConfig } from '@/config';
import { ensembleConfig } from '@/config';
import { logger } from '@/infrastructure/logger';
import { ensembleRunRepository } from '@/infrastructure/database';
import { response, failure } from '@/shared/http';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/shared/errors';
import { toChatError } from '@/modules/ensemble/ensemble.events';
import { SESSION_RESOURCE } from '@/modules/ensemble/ensemble.history';
import { startTurn, subscribe } from '@/modules/ensemble/ensemble.live';
import { chatClientMessageSchema, idParamsSchema, PROMPT_MAX } from '@/modules/ensemble/ensemble.schema';
import type { ChatServerMessage } from '@star/run-protocol/chat';

/**
 * A round is silent for MINUTES while three chat UIs think — measured gaps on a
 * real run: 237s, 32s, 30s. Bun closes an idle socket, and its own ceiling for
 * that is 255s, which is below the silence a slow round already produces. So
 * the server pings. Not configurable: it is a property of the transport, not of
 * the ensemble, and nothing useful follows from tuning it per deployment.
 */
const PING_MS = 30_000;

/**
 * Connection-scoped messages — a rejected message, a refused turn — are seq 0.
 * A run's own messages are numbered from 1, so 0 says "this belongs to no
 * turn's sequence" rather than colliding with one and being skipped by a client
 * that is resuming.
 */
const UNSEQUENCED = 0;

/** Per connection: how to stop listening, and the keep-alive. */
const open = new Map<string, { off: () => void; ping: ReturnType<typeof setInterval> }>();

const since = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    // A client sending nonsense resumes from the start rather than silently
    // skipping the whole run, which is the failure that cannot be seen.
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Whether a browser at `origin` may open a socket against a server answering
 * for `host`.
 *
 * The allowlist, plus same-origin whatever the allowlist says: in production
 * this server also serves the web app, so the page's origin IS this server's
 * own, and a deployment would otherwise have to be told a hostname the request
 * already carries.
 *
 * But "Origin equals Host" is NOT on its own enough, because Host is just as
 * attacker-controlled as Origin. DNS rebinding: point evil.com at this
 * server's address, get the victim's browser to load it, and the socket
 * request arrives with Origin AND Host both saying evil.com — they match, and
 * a naive same-origin test lets a hostile page read this user's conversations
 * and start runs as them. The allowlist would have refused it.
 *
 * So same-origin is only trusted for a LOOPBACK host, which is the case it
 * exists for: a machine serving its own front end with nothing configured. A
 * deployed host is not self-evident and has to be named in WEB_ORIGINS, the
 * same thing Django calls ALLOWED_HOSTS and Rails calls host authorization.
 *
 * Native try/catch, not TryCatch: this is synchronous, and the only thing it
 * recovers from is URL parsing. Origin is attacker-controlled and need not be
 * a URL at all, so an unguarded parse here would turn a junk header into a 500
 * from inside the handshake.
 */
const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The host without its port. IPv6 literals keep their brackets, which is how
 *  they appear in a Host header and in `URL.host`. */
const hostname = (host: string): string =>
    (/^(\[[^\]]*\]|[^:]*)(?::\d+)?$/.exec(host)?.[1] ?? '').toLowerCase();

export const isAllowedOrigin = (origin: string, host: string | null): boolean => {
    if (appConfig.webOrigins.includes(origin)) return true;
    if (host === null) return false;
    try {
        if (new URL(origin).host !== host) return false;
    } catch {
        return false;
    }
    return LOOPBACK.has(hostname(host));
};

/** A UTF-16 code unit is at most 6 bytes once JSON-escaped, plus room for the
 *  message envelope around it. */
const WORST_CASE_BYTES_PER_CHAR = 8;

/**
 * `PROMPT_MAX` counts UTF-16 code units; a frame is bytes. One control character
 * is six of them once JSON-escaped (`\u0000`), so the longest acceptable prompt
 * needs this much room. Bun's own default is 16MB, which is 16MB of parsing
 * before the schema gets to reject it.
 */
const MAX_FRAME_BYTES = PROMPT_MAX * WORST_CASE_BYTES_PER_CHAR;

const chatSocket = new Elysia().ws('/ws/chat/:id', {
    // Bun's own ceiling. The ping above is what actually keeps the connection
    // alive; this only widens the window if a ping is ever missed.
    idleTimeout: 255,

    maxPayloadLength: MAX_FRAME_BYTES,

    /**
     * Runs before the upgrade, which is the only place a handshake can be
     * refused with a status rather than an immediate close.
     *
     * The origin check is not optional and not duplicated effort: browsers do
     * NOT apply CORS to WebSocket handshakes, so `@elysiajs/cors` does not
     * guard this route and the allowlist in `appConfig.webOrigins` would go
     * inert for every byte of run traffic. With no auth on the endpoint yet,
     * this is the only gate there is.
     *
     * A missing Origin is allowed through: non-browser clients (the socket
     * spec, a debug tail) send none, while a browser always sends one — so
     * this blocks the case the check exists for, which is another site's page
     * opening a socket against a developer's running API.
     *
     * So is a SAME-origin one — see `isAllowedOrigin`.
     */
    async beforeHandle({ params, headers }) {
        const origin = headers.origin ?? null;
        if (origin !== null && !isAllowedOrigin(origin, headers.host ?? null)) {
            logger.warn({ origin }, 'Rejected a chat socket handshake from a disallowed origin');
            return response(failure(new UnauthorizedError('Origin not allowed')));
        }

        const id = idParamsSchema.safeParse(params);
        if (!id.success) {
            return response(failure(new ValidationError('A chat session id must be a uuid')));
        }

        // At the handshake rather than on the first turn: saving a run against a
        // missing session fails its foreign key, and that write is deliberately
        // non-fatal — so the turn would spend minutes of browser time and leave
        // no record anywhere.
        if (!(await ensembleRunRepository.sessionExists(id.data.id))) {
            return response(failure(new NotFoundError(SESSION_RESOURCE, id.data.id)));
        }
    },

    open(ws) {
        const sessionId = ws.data.params.id;

        const sink = (message: ChatServerMessage) => ws.send(message);
        const off = subscribe(sessionId, sink, since(ws.data.query.since));

        open.set(ws.id, {
            off,
            ping: setInterval(() => ws.ping(), PING_MS),
        });
    },

    message(ws, raw) {
        const message = chatClientMessageSchema.safeParse(raw);
        if (!message.success) {
            // Answered, not ignored. An unrecognised message dropped in silence
            // looks exactly like a server that is merely slow, and the client
            // waits for a turn that was never started.
            ws.send({
                ...toChatError(
                    new ValidationError(
                        'Unrecognised chat message',
                        message.error.flatten().fieldErrors as Record<string, string[]>,
                    ),
                ),
                seq: UNSEQUENCED,
            });
            return;
        }

        try {
            startTurn({
                sessionId: ws.data.params.id,
                prompt: message.data.prompt,
                rounds: message.data.rounds ?? ensembleConfig.rounds,
            });
        } catch (error) {
            // The shared browser is busy, almost always. Reported on the socket
            // that asked, since no other connection did anything wrong.
            logger.warn({ err: error }, 'Refused a chat turn');
            ws.send({ ...toChatError(error), seq: UNSEQUENCED });
        }
    },

    close(ws) {
        const state = open.get(ws.id) ?? null;
        if (!state) return;
        // Both, always: a listener left in the registry is memory that grows
        // for days without failing anything, and an interval on a closed socket
        // is the same leak with a timer attached.
        state.off();
        clearInterval(state.ping);
        open.delete(ws.id);
        // The turn itself keeps going. Its rounds are mid-conversation in three
        // real chat tabs with nothing safe to interrupt, and its transcript is
        // still worth writing — a reconnect replays what it missed.
    },
});

export default chatSocket;
