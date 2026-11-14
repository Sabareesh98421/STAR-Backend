// The only place in the suite that starts a server and opens a real socket.
//
// Everything a turn decides is tested without one (ensemble.live.spec.ts,
// ensemble.service.spec.ts). What is left here is the transport itself, and the
// handshake in particular: browsers do not apply CORS to WebSocket upgrades, so
// the origin check is the only gate on this endpoint and "it is checked" cannot
// be taken on trust from reading the code.
import { test, expect } from '@playwright/test';
import { RunEventType } from '@star/run-protocol';
import { CHAT_ERROR, ChatClientMessageType } from '@star/run-protocol/chat';
import type { Elysia } from 'elysia';
import type { ChatServerMessage } from '@star/run-protocol/chat';
import { isAllowedOrigin } from './chat.socket';
import { appConfig } from '@/config';


const DEAD_CDP = 'http://127.0.0.1:1';
/** The configured dev origin, read from config rather than retyped — a spec
 *  with its own copy keeps passing after WEB_PORT moves. */
const ALLOWED = appConfig.webOrigins[0]!;

type Db = typeof import('@/infrastructure/database');
let db: Db;
let dbReady = false;
let app: Elysia;
let port = 0;

test.beforeAll(async () => {
    // See ensemble.service.spec.ts. A turn started here must fail at the CDP
    // connect rather than typing into the developer's real chat tabs.
    process.env.ENSEMBLE_CDP_URL = DEAD_CDP;

    db = await import('@/infrastructure/database');
    dbReady = await db.connectDatabase().then(
        () => true,
        () => false,
    );

    // The real router, so the route under test is the route that ships —
    // including its /api prefix, which is where the socket is actually mounted.
    const { Elysia } = await import('elysia');
    const masterRouter = (await import('@/server/router')).default;
    // Port 0: an ephemeral port, so the suite never collides with a dev server.
    app = new Elysia().use(masterRouter).listen({ port: 0, reusePort: false });
    port = app.server?.port ?? 0;
});

/**
 * Rows this file owns, and no other.
 *
 * Playwright runs spec FILES in parallel workers against the one development
 * database, so a cleanup that deleted every session titled 'spec: ' deleted
 * another file's session mid-test — and a session cascades to its runs, so the
 * symptom was a turn that had been written and then vanished.
 */
const MINE = 'spec:socket ';

test.afterAll(async () => {
    // Forced: a socket this suite opened is still connected, and a graceful
    // stop waits for connections that are only closed when the process ends.
    await app?.stop(true);
    if (!dbReady) return;
    await db.getDb().chatSession.deleteMany({ where: { title: { startsWith: MINE } } });
    await db.disconnectDatabase();
});

const session = async (title = `${MINE}chat`) =>
    (await db.ensembleRunRepository.createSession(title)).id;

const url = (sessionId: string, since: number | null = null) =>
    `ws://127.0.0.1:${port}/api/ws/chat/${sessionId}${since === null ? '' : `?since=${since}`}`;

/** Resolves true if the socket opened, false if the handshake was refused. */
function opened(socket: WebSocket): Promise<boolean> {
    return new Promise((resolve) => {
        socket.addEventListener('open', () => resolve(true), { once: true });
        // A refused upgrade arrives as an error, then a close. Either is a no.
        socket.addEventListener('error', () => resolve(false), { once: true });
        socket.addEventListener('close', () => resolve(false), { once: true });
    });
}

/** Waits for the first message whose type matches, or times out. */
function waitFor(socket: WebSocket, type: string, ms = 20_000): Promise<ChatServerMessage> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${type} within ${ms}ms`)), ms);
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as ChatServerMessage;
            if (message.type !== type) return;
            clearTimeout(timer);
            resolve(message);
        });
    });
}

const connect = (sessionId: string, origin: string | null = ALLOWED, since: number | null = null) =>
    new WebSocket(url(sessionId, since), origin === null ? {} : { headers: { origin } });

test('a handshake from a disallowed origin is refused', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const socket = connect(await session(), 'http://evil.example');
    // The whole reason this test exists: CORS never sees this request, so a
    // missing check here is not caught by anything else in the stack, and the
    // symptom is another site's page driving a developer's shared browser.
    expect(await opened(socket)).toBe(false);
});

test('a handshake for a session that does not exist is refused', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    // A well-formed id that was never created. Accepting it would let a turn
    // run for minutes and then fail its foreign key on the way to being
    // stored — a write that is deliberately non-fatal, so the work would
    // vanish with nothing to read back.
    const socket = connect('3f1a7c6e-0000-4000-8000-000000000000');
    expect(await opened(socket)).toBe(false);
});

test('a conversation accepts a connection and streams the turn it is asked for', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const socket = connect(await session());
    expect(await opened(socket)).toBe(true);

    const started = waitFor(socket, RunEventType.started);
    socket.send(
        JSON.stringify({
            type: ChatClientMessageType.turnStart,
            prompt: 'spec: socket round trip',
            rounds: 0,
        }),
    );

    // The round trip: asked for on this socket, answered on this socket, with
    // the prompt the client sent rather than a server-composed one.
    expect(await started).toMatchObject({ seq: 1, prompt: 'spec: socket round trip' });

    socket.close();
});

test('an unrecognised message is answered with an error, never ignored', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const socket = connect(await session());
    expect(await opened(socket)).toBe(true);

    const error = waitFor(socket, CHAT_ERROR, 5_000);
    socket.send(JSON.stringify({ type: 'turn.teleport', prompt: 'spec: nonsense' }));

    // Silence would be indistinguishable on the client from a server that is
    // merely slow, and it would wait forever for a turn that never started.
    // seq 0 says this belongs to no turn's sequence, so a resume cannot skip
    // or replay it.
    expect(await error).toMatchObject({ seq: 0, type: CHAT_ERROR });

    socket.close();
});

// The rule itself, without a socket: the cases below are about what counts as
// an allowed origin, and standing a server up to ask that only makes it slower
// to find out which case broke.
// Whatever host this server answers for. Deliberately NOT the real port: the
// rule under test is "Origin equals the serving host", and a spec that pinned
// the developer's actual port would pass for the wrong reason the day it moved.
const SERVING_HOST = 'localhost:8443';
const SAME_ORIGIN = `http://${SERVING_HOST}`;

test('a same-origin handshake on loopback is allowed though the allowlist does not name it', () => {
    // The one-server case with nothing configured: the page came from this
    // server, so Origin is this server, and no allowlist mentions it.
    expect(appConfig.webOrigins).not.toContain(SAME_ORIGIN);
    expect(isAllowedOrigin(SAME_ORIGIN, SERVING_HOST)).toBe(true);
    for (const host of ['127.0.0.1:10108', '[::1]:10108', 'LOCALHOST:3001']) {
        const scheme = host.startsWith('[') ? 'http://' : 'http://';
        expect(isAllowedOrigin(`${scheme}${host}`.toLowerCase(), host.toLowerCase()), host).toBe(true);
    }
});

test('DNS rebinding: Origin matching Host is NOT enough off loopback', () => {
    // Point evil.example at this server, get a browser to load it, and both
    // Origin and Host say evil.example — they match. Trusting that alone hands
    // a hostile page this user's conversations. A deployed host has to be
    // named in WEB_ORIGINS; it is not self-evident from the request.
    expect(isAllowedOrigin('https://evil.example', 'evil.example')).toBe(false);
    expect(isAllowedOrigin('https://star.example.com:8443', 'star.example.com:8443')).toBe(false);
    // ...and naming it is what makes it work.
    expect(appConfig.webOrigins.includes('https://star.example.com:8443')).toBe(false);
});

test('a hostname that merely ends in a loopback name is not loopback', () => {
    expect(isAllowedOrigin('http://notlocalhost:3001', 'notlocalhost:3001')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example', 'localhost.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1.evil.example', '127.0.0.1.evil.example')).toBe(false);
});

test('a cross-origin handshake outside the allowlist is still refused', () => {
    expect(isAllowedOrigin('http://evil.example', SERVING_HOST)).toBe(false);
    // Same hostname, different PORT, is a different origin — the check compares
    // host including port, so this must not slip through.
    expect(isAllowedOrigin('https://star.example.com:9999', SERVING_HOST)).toBe(false);
    // A prefix of the real host is not the real host.
    expect(isAllowedOrigin(`https://${SERVING_HOST}.evil.example`, SERVING_HOST)).toBe(false);
});

test('the allowlist still works when the origin is not this server', () => {
    expect(isAllowedOrigin(ALLOWED, SERVING_HOST)).toBe(true);
});

test('a junk Origin is refused, not a 500 out of the handshake', () => {
    // Origin is attacker-controlled and need not parse as a URL at all.
    for (const junk of ['', 'null', 'not a url', '://', 'http://']) {
        expect(isAllowedOrigin(junk, SERVING_HOST), junk).toBe(false);
    }
    // No Host header to compare against: same-origin cannot be established.
    expect(isAllowedOrigin(SAME_ORIGIN, null)).toBe(false);
});
