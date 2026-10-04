// Covers the live turn: the lock, the fan-out, the replay and the registry.
//
// Still no socket. A listener is a callback here, which is the whole point of
// the design — every failure this file guards (a turn delivered to the wrong
// conversation, a replay that duplicates or skips, a listener left behind)
// produces a chat that reads correctly and is wrong, and none of them need a
// server to reproduce.
import { test, expect } from '@playwright/test';
import { RunEventType } from '@star/run-protocol';
import type { ChatServerMessage } from '@star/run-protocol/chat';

const DEAD_CDP = 'http://127.0.0.1:1';

type Live = typeof import('./ensemble.live');
type Db = typeof import('@/infrastructure/database');
let live: Live;
let db: Db;
let dbReady = false;

test.beforeAll(async () => {
    // See ensemble.service.spec.ts: set before anything reaches @/config, or
    // these tests drive the developer's real logged-in browser.
    process.env.ENSEMBLE_CDP_URL = DEAD_CDP;
    live = await import('./ensemble.live');
    db = await import('@/infrastructure/database');
    dbReady = await db.connectDatabase().then(
        () => true,
        () => false,
    );
});

/**
 * Rows this file owns, and no other.
 *
 * Playwright runs spec FILES in parallel workers against the one development
 * database, so a cleanup that deleted every session titled 'spec: ' deleted
 * another file's session mid-test — and a session cascades to its runs, so the
 * symptom was a turn that had been written and then vanished.
 */
const MINE = 'spec:live ';

test.afterAll(async () => {
    if (!dbReady) return;
    await db.getDb().chatSession.deleteMany({ where: { title: { startsWith: MINE } } });
    await db.disconnectDatabase();
});

const PROMPT = 'spec: live turn';

const session = async (title = `${MINE}turn`) =>
    (await db.ensembleRunRepository.createSession(title)).id;

/**
 * Turns are started, not awaited — a real one is minutes long. With a dead CDP
 * url the failure path is immediate, so this polls rather than sleeping a fixed
 * amount: a timed wait is either flaky or slow, and usually both.
 */
async function settled(): Promise<void> {
    for (let i = 0; i < 400; i++) {
        if (!live.liveState().running) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('the turn never finished');
}

// Serial: there is one shared browser, so there is one live turn in the
// process, and two of these running at once would be testing each other's lock.
test.describe.configure({ mode: 'serial' });

test('a turn reaches the listeners of its own conversation and no others', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const mine = await session();
    const theirs = await session();
    const heard: ChatServerMessage[] = [];
    const overheard: ChatServerMessage[] = [];

    const offMine = live.subscribe(mine, (m) => heard.push(m));
    const offTheirs = live.subscribe(theirs, (m) => overheard.push(m));

    live.startTurn({ sessionId: mine, prompt: PROMPT, rounds: 0 });
    await settled();

    expect(heard.map((m) => m.type)).toContain(RunEventType.started);
    // The failure that has no symptom: turn text under an unrelated chat, with
    // no error on either side.
    expect(overheard).toEqual([]);

    offMine();
    offTheirs();
});

test('every message carries a monotonic, gapless seq so a reconnect can resume', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const sessionId = await session();
    const heard: ChatServerMessage[] = [];
    const off = live.subscribe(sessionId, (m) => heard.push(m));

    live.startTurn({ sessionId, prompt: PROMPT, rounds: 0 });
    await settled();

    // From 1, every step, no repeats. Resume is subtraction on this number; a
    // gap means a client either replays an event or never sees it, and neither
    // shows up as an error.
    expect(heard.map((m) => m.seq)).toEqual(heard.map((_, i) => i + 1));
    off();
});

test('a listener that joins mid-turn is replayed what it missed, from `since`', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const sessionId = await session();
    live.startTurn({ sessionId, prompt: PROMPT, rounds: 0 });
    await settled();

    const full: ChatServerMessage[] = [];
    const offFull = live.subscribe(sessionId, (m) => full.push(m));
    // A finished turn is still replayable: it is kept until the next one
    // replaces it, so a client reconnecting the instant a turn ended finds its
    // messages rather than concluding the turn produced nothing.
    expect(full.length).toBeGreaterThan(0);

    const tail: ChatServerMessage[] = [];
    const offTail = live.subscribe(sessionId, (m) => tail.push(m), 1);
    // Exactly the messages after the one the client already applied: no
    // duplicate of seq 1, no gap at seq 2.
    expect(tail.map((m) => m.seq)).toEqual(full.slice(1).map((m) => m.seq));

    offFull();
    offTail();
});

test('a replay to a sink that throws costs neither the other listeners nor the registry', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const sessionId = await session();
    live.startTurn({ sessionId, prompt: PROMPT, rounds: 0 });
    await settled();

    // A socket that closed between the handshake and the replay. The guard is
    // not cosmetic: before it, this threw out of `subscribe`, so the caller
    // never received its `off` and the sink stayed in the registry for the
    // life of the process — a leak with no symptom but a warning per message.
    const before = live.liveState().listenerCount;
    let off: () => void = () => {};
    expect(() => {
        off = live.subscribe(sessionId, () => {
            throw new Error('socket closed');
        });
    }).not.toThrow();

    const heard: ChatServerMessage[] = [];
    const offGood = live.subscribe(sessionId, (m) => heard.push(m));
    expect(heard.length).toBeGreaterThan(0);

    off();
    offGood();
    expect(live.liveState().listenerCount).toBe(before);
});

test('a second turn is refused while one is in flight, and does not touch the browser', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const sessionId = await session();
    const other = await session();

    live.startTurn({ sessionId, prompt: PROMPT, rounds: 0 });
    // Two turns on one shared browser type into the same three composers, and
    // neither transcript is worth anything afterwards. Refused from any
    // conversation, not just the one already running.
    expect(() => live.startTurn({ sessionId: other, prompt: PROMPT, rounds: 0 })).toThrow();
    expect(live.liveState().sessionId).toBe(sessionId);

    await settled();
});

test('the lock releases after a turn that failed, not only after one that succeeded', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const sessionId = await session();
    live.startTurn({ sessionId, prompt: PROMPT, rounds: 0 });
    await settled();

    // Nothing listens on DEAD_CDP, so that turn failed. If the lock leaked the
    // endpoint would stay wedged until the process restarted.
    expect(() => live.startTurn({ sessionId, prompt: PROMPT, rounds: 0 })).not.toThrow();
    await settled();
});

test('unsubscribing leaves nothing behind in the registry', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const sessionId = await session();
    const off = live.subscribe(sessionId, () => {});
    expect(live.liveState().listenerCount).toBe(1);

    off();
    // A listener left in the registry does not fail anything; it is memory that
    // grows for days. This is the only place it is observable.
    expect(live.liveState().listenerCount).toBe(0);
});
