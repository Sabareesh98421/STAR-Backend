// Covers the chat socket against a fake, which is the only way to produce the
// failures that matter: a question asked before the handshake finished, a drop
// mid-run, and a resume that duplicates or skips.
//
// Precedent for the shape: `readWhenSettled` is tested against a fake
// Playwright page in apps/e2e/tests/broadcast.spec.ts.
import { test, expect } from '@playwright/test';
import { createSession, listSessions, openChat, type SocketLike } from './chat.transport';
import type { ChatServerMessage } from '@star/run-protocol/chat';

/** Every socket the transport opened, in order, so a reconnect is observable. */
const sockets: FakeSocket[] = [];

class FakeSocket implements SocketLike {
    sent: string[] = [];
    closed = false;
    onopen: null | (() => void) = null;
    onmessage: null | ((event: { data: unknown }) => void) = null;
    onclose: null | (() => void) = null;
    onerror: null | (() => void) = null;

    constructor(readonly url: string) {}

    send(data: string) {
        // A real socket throws when it is not open, and the transport's
        // behaviour on that throw is part of what is under test.
        if (this.closed) throw new Error('socket is closed');
        this.sent.push(data);
    }

    close() {
        this.drop();
    }

    /** The server accepting the handshake. */
    accept() {
        this.onopen?.();
    }

    deliver(message: unknown) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    /** The connection going away, for any reason. */
    drop() {
        if (this.closed) return;
        this.closed = true;
        this.onclose?.();
    }
}

const factory = (url: string) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
};

test.beforeEach(() => {
    sockets.length = 0;
});

const asked = (socket: FakeSocket) => socket.sent.map((s) => JSON.parse(s) as { prompt: string });

test('a question asked before the handshake completes is held, then sent once', () => {
    const chat = openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: () => {},
        onLink: () => {},
        cursor: () => 0,
        factory,
    });

    // The first question of a new conversation always lands here: the session
    // is created, the socket opened and the prompt sent in one gesture.
    expect(chat.ask('why is evict slow?', null)).toBe(true);
    expect(sockets[0]!.sent).toEqual([]);

    sockets[0]!.accept();
    expect(asked(sockets[0]!).map((m) => m.prompt)).toEqual(['why is evict slow?']);
});

test('messages arrive in order, and an unparseable frame does not end the run', () => {
    const seen: ChatServerMessage[] = [];
    openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: (m) => seen.push(m),
        onLink: () => {},
        cursor: () => 0,
        factory,
    });

    const socket = sockets[0]!;
    socket.accept();
    socket.deliver({ seq: 1, type: 'run.started' });
    socket.onmessage?.({ data: '{not json' });
    socket.deliver({ seq: 2, type: 'run.status', status: 'responding' });

    // One frame lost, not a connection torn down: the turn behind it is
    // minutes of browser time that cannot be run again.
    expect(seen.map((m) => m.seq)).toEqual([1, 2]);
});

test('a drop mid-run reconnects, and resumes from the last seq applied', async () => {
    let cursor = 0;
    const link: string[] = [];
    openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: (m) => (cursor = m.seq),
        onLink: (state) => link.push(state),
        cursor: () => cursor,
        factory,
    });

    sockets[0]!.accept();
    sockets[0]!.deliver({ seq: 1, type: 'run.started' });
    sockets[0]!.deliver({ seq: 2, type: 'run.status', status: 'responding' });
    sockets[0]!.drop();

    expect(link).toEqual(['live', 'reconnecting']);

    // The transport waits before retrying, so this waits with it rather than
    // reaching inside for the timer.
    await new Promise((resolve) => setTimeout(resolve, 1_800));

    // Resumed, not restarted: the run outlived this socket, and `since` is
    // what keeps the client from re-applying what it already has.
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.url).toContain('since=2');
    expect(sockets[1]!.url).toContain('/chat/s1');
});

test('a frame arriving after a deliberate close is not applied', () => {
    const seen: ChatServerMessage[] = [];
    const chat = openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: (m) => seen.push(m),
        onLink: () => {},
        cursor: () => 0,
        factory,
    });

    sockets[0]!.accept();
    sockets[0]!.deliver({ seq: 1, type: 'run.started' });
    chat.close();
    // A real socket keeps firing `onmessage` through CLOSING, so a frame
    // already in flight still arrived. Applied, it overwrote the status a
    // cancel had just set and the rail drew the turn running again.
    sockets[0]!.deliver({ seq: 2, type: 'run.status', status: 'reviewing' });

    expect(seen.map((m) => m.seq)).toEqual([1]);
});

test('a question asked after the retries are exhausted is refused, not swallowed', async () => {
    // Five reconnects at the transport's own backoff. Waited out rather than
    // injected: the bug is in the state the real schedule leaves behind.
    test.setTimeout(30_000);

    const link: string[] = [];
    const chat = openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: () => {},
        onLink: (state) => link.push(state),
        cursor: () => 0,
        factory,
    });

    for (let i = 0; i < 6; i++) {
        sockets.at(-1)!.drop();
        if (link.at(-1) === 'offline') break;
        await new Promise((resolve) => setTimeout(resolve, 1_800));
    }

    expect(link.at(-1)).toBe('offline');
    // False, because the question was not asked. Returning true parked it in
    // the pending slot of a socket nothing would ever open again: the turn
    // never left the page while the UI showed it running.
    expect(chat.ask('why is evict slow?', null)).toBe(false);
});

test('resync reconnects and asks for the replay from the cursor', async () => {
    let cursor = 0;
    const link: string[] = [];
    const chat = openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: (m) => (cursor = m.seq),
        onLink: (state) => link.push(state),
        cursor: () => cursor,
        factory,
    });

    sockets[0]!.accept();
    sockets[0]!.deliver({ seq: 1, type: 'run.started' });
    sockets[0]!.deliver({ seq: 2, type: 'run.status', status: 'responding' });

    // What a caller does on a hole in the sequence: seq 5 arrived after 2, so
    // 3 and 4 never got out of the server and only a replay can produce them.
    chat.resync();
    await new Promise((resolve) => setTimeout(resolve, 1_800));

    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.url).toContain('since=2');
    // Not a deliberate close: the run is still going and the client still wants
    // it, so this passes through reconnecting and back to live rather than
    // stopping at offline the way `close` does.
    expect(link).toEqual(['live', 'reconnecting']);
    sockets[1]!.accept();
    expect(link.at(-1)).toBe('live');
});

test('a deliberate close does not reconnect', async () => {
    const link: string[] = [];
    const chat = openChat({
        wsBase: 'ws://x/ws',
        sessionId: 's1',
        onMessage: () => {},
        onLink: (state) => link.push(state),
        cursor: () => 0,
        factory,
    });

    sockets[0]!.accept();
    chat.close();

    await new Promise((resolve) => setTimeout(resolve, 1_800));

    // Cancelling or switching conversations must not leave a socket that keeps
    // coming back, which is the leak that only shows up as traffic hours later.
    expect(sockets).toHaveLength(1);
    expect(link.at(-1)).toBe('offline');
});

/** Replaces fetch for one assertion and always puts it back. */
async function withFetch(reply: Response, work: () => Promise<unknown>) {
    const original = globalThis.fetch;
    // Through unknown: the stub answers the one call under test and is not a
    // whole fetch (no `preconnect`), which the cast has to say out loud.
    globalThis.fetch = (async () => reply.clone()) as unknown as typeof fetch;
    try {
        await work();
    } finally {
        globalThis.fetch = original;
    }
}

test('a refused request fails with the server\'s own wording', async () => {
    const body = {
        success: false,
        message: 'An ensemble run is already in progress on the shared browser',
        error: { code: 'CONFLICT' },
    };

    await withFetch(new Response(JSON.stringify(body), { status: 409 }), async () => {
        // The reason has to survive the transport, or the toast the user reads
        // is a status code and the refusal the API carefully worded is lost.
        await expect(createSession('/api', 'q')).rejects.toThrow(
            /already in progress on the shared browser/,
        );
    });
});

test('a failure body that is not ours still names the request', async () => {
    // A gateway's own page, not our envelope. Parsing it as one used to throw
    // over the top of the failure it was meant to explain.
    await withFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }), async () => {
        await expect(listSessions('/api')).rejects.toThrow(
            'GET /api/ensemble/sessions failed (502)',
        );
    });
});
