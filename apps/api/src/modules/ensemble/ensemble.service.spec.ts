// Covers one turn, with no transport at all.
//
// The emitter is injected, so these tests collect messages into an array and
// assert on them: no server, no socket, no stream to drain. The in-flight lock
// and the replay live in ensemble.live.spec.ts, which is what owns them now.
//
// No browser needed. The run fails at the CDP connect, and failing is exactly
// the path that has to still produce a record — a turn that died silently is
// indistinguishable from one that was never asked.
import { test, expect } from '@playwright/test';
import { RunEventType, RunStatus } from '@star/run-protocol';
import type { ChatServerPayload } from '@star/run-protocol/chat';

/**
 * Pointed at a port that refuses connections, and loaded only AFTER that is
 * set — the config reads the env once, at import.
 *
 * This matters more than it looks: without it the suite connects to whatever
 * shared browser happens to be running and types a test prompt into the
 * developer's real, logged-in chat tabs. Which is what happened the first time
 * this file was written.
 */
const DEAD_CDP = 'http://127.0.0.1:1';

type Service = typeof import('./ensemble.service');
type Db = typeof import('@/infrastructure/database');
let runTurnHandler: Service['runTurnHandler'];
let db: Db;
let dbReady = false;

test.beforeAll(async () => {
    process.env.ENSEMBLE_CDP_URL = DEAD_CDP;
    ({ runTurnHandler } = await import('./ensemble.service'));
    // Dynamic for the same reason as the line above it, not just for tidiness:
    // @/infrastructure/database reaches @/config, and a static import of it
    // would have frozen ensembleConfig.cdpUrl at its default — the developer's
    // real browser — before DEAD_CDP was ever set.
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
const MINE = 'spec:service ';

test.afterAll(async () => {
    if (!dbReady) return;
    // Cascades to the runs filed under them.
    await db.getDb().chatSession.deleteMany({ where: { title: { startsWith: MINE } } });
    await db.disconnectDatabase();
});

const PROMPT = 'spec: why is evict slow?';

/** A turn needs a conversation to be filed under; this makes a throwaway one. */
const session = async (title = `${MINE}turn`) =>
    (await db.ensembleRunRepository.createSession(title)).id;

/** Drives one turn to completion and hands back everything it said. */
async function drive(sessionId: string, prompt = PROMPT): Promise<ChatServerPayload[]> {
    const messages: ChatServerPayload[] = [];
    await runTurnHandler({ sessionId, prompt, rounds: 0 }, (message) => messages.push(message));
    return messages;
}

const typesOf = (messages: ChatServerPayload[]) => messages.map((m) => m.type);

test('a failure arrives as a message, since a socket has no status code to use', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');
    const messages = await drive(await session());

    // The turn started (the client knows who was asked) and then reported its
    // own failure. A socket that just closed would leave the client waiting on
    // a message that never comes.
    expect(typesOf(messages)).toContain(RunEventType.started);
    expect(messages).toContainEqual(
        expect.objectContaining({ type: RunEventType.status, status: RunStatus.failed }),
    );
});

test('the question is announced before any browser work is attempted', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');
    const messages = await drive(await session());

    // First, always: it is the only message a client can use to render the turn
    // it just asked for, and everything after it may be minutes away.
    expect(messages[0]).toMatchObject({ type: RunEventType.started, prompt: PROMPT });
});

test('a turn that failed partway is still recorded, under the session that asked', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    const prompt = `spec: a failed turn is still evidence ${Date.now()}`;
    const sessionId = await session();
    await drive(sessionId, prompt);

    const stored = await db.ensembleRunRepository.findSession(sessionId);
    const turn = stored?.turns.find((t) => t.question === prompt) ?? null;

    // The evidence that a model drops out under load is exactly the evidence
    // that gets lost if only successful runs are recorded — and a run costs
    // minutes of browser time that cannot be spent again identically. Filed
    // under its session, because a turn the conversation cannot list reads as
    // a turn that never happened.
    expect(turn).not.toBeNull();
    expect(turn!.status).toBe(RunStatus.failed);
    // Null, not the moment it died: this run never finished.
    expect(turn!.finishedAt).toBeNull();
    // Three models were asked and none answered. Recording answeredCount as
    // modelCount here would turn a total dropout into unanimous agreement.
    expect(turn!.modelCount).toBeGreaterThan(0);
    expect(turn!.answeredCount).toBe(0);
    expect(turn!.changedModels).toEqual([]);
});

test('a database that is down does not fail a turn', async () => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');

    // Both the context read and the failure write below need Postgres. With no
    // connection the turn must still report its own outcome rather than the
    // database's — by the time it runs, the answers are already in hand.
    const sessionId = await session();
    await db.disconnectDatabase();

    const messages = await drive(sessionId);
    expect(messages).toContainEqual(
        expect.objectContaining({ type: RunEventType.status, status: RunStatus.failed }),
    );
    expect(typesOf(messages)).toContain(RunEventType.started);

    await db.connectDatabase();
});
