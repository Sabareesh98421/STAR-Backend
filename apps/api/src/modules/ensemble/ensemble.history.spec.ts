// Covers the stored record of a run, which is the only thing that outlives it.
// A run costs minutes of real browser time across three logged-in services and
// cannot be repeated identically, so a run read back wrong is a conclusion drawn
// from the wrong evidence — worse than a run that was never stored at all.
//
// Needs Postgres on DATABASE_URL; skips rather than fails without it, since a
// database that is not up is a precondition and not a defect in this code.
import { test, expect } from '@playwright/test';
import { conversationContext } from './ensemble.context';
import type { ModelResult, Transcript } from '@star/browser-ensemble/types';
import type { RunListResponse, StoredRound, StoredRun } from '@star/run-protocol/history';
import type { SessionTurnsResponse } from '@star/run-protocol/chat';

/**
 * Set before anything that reaches @/config is loaded, which is why every
 * import below is dynamic.
 *
 * Nothing here drives a browser — but Playwright reuses a worker process across
 * spec files, and a module registry that already cached `ensembleConfig` with
 * its default CDP URL would hand the real logged-in browser to the *next* spec
 * file in the same worker. So this file refuses to be the one that caches it.
 */
process.env.ENSEMBLE_CDP_URL = 'http://127.0.0.1:1';

type Db = typeof import('@/infrastructure/database');
type History = typeof import('./ensemble.history');

let db: Db;
let history: History;
let dbReady = false;

/** Distinctive enough that the cleanup below can never match a real run. */
const QUESTION = 'spec: ensemble stored run round-trip';

const result = (
    model: string,
    text: string,
    url: string | null,
    ok = true,
): ModelResult => ({
    model,
    ok,
    text,
    ms: 10,
    attempts: 1,
    url,
    error: ok ? null : 'timed out waiting for response',
});

const DRAFT_SENT = { chatgpt: 'Q as sent to chatgpt', claude: 'Q as sent to claude', gemini: 'Q as sent to gemini' };
const REVISE_SENT = { chatgpt: 'peer critiques for chatgpt', claude: 'peer critiques for claude' };
/** A second turn: each model was given its OWN earlier answers and no peer's. */
const CONTEXT = { chatgpt: 'PRIOR_CG', claude: 'PRIOR_CL' };
const THREAD_URL = 'https://chatgpt.com/c/0000-draft';
const CONTEXT_TURNS = 4;

const transcript: Transcript = {
    question: QUESTION,
    startedAt: '2026-10-02T12:00:00.000Z',
    finishedAt: '2026-10-02T12:04:00.000Z',
    models: ['chatgpt', 'claude', 'gemini'],
    context: CONTEXT,
    rounds: [
        {
            kind: 'draft',
            iteration: 0,
            at: '2026-10-02T12:01:00.000Z',
            sent: DRAFT_SENT,
            responses: [
                result('chatgpt', 'DRAFT_CG', THREAD_URL),
                // An empty URL, which must never be stored as one: '' and "we
                // failed to record it" would stop being distinguishable.
                result('claude', 'DRAFT_CL', ''),
                // Failed before it ever opened a thread.
                result('gemini', '', null, false),
            ],
        },
        {
            kind: 'revise',
            iteration: 1,
            at: '2026-10-02T12:03:00.000Z',
            sent: REVISE_SENT,
            responses: [
                result('chatgpt', 'FINAL_CG', 'https://chatgpt.com/c/0000-revise'),
                result('claude', 'DRAFT_CL', 'https://claude.ai/chat/0000-revise'),
            ],
        },
    ],
    // chatgpt moved; claude's final is its draft verbatim; gemini never answered.
    final: { chatgpt: 'FINAL_CG', claude: 'DRAFT_CL' },
};

let runId = '';
let sessionId = '';

test.beforeAll(async () => {
    db = await import('@/infrastructure/database');
    history = await import('./ensemble.history');
    dbReady = await db.connectDatabase().then(
        () => true,
        () => false,
    );
    if (!dbReady) return;

    const { outcome, toMarkdown, transcriptFileName } = await import('./ensemble.transcript');
    const { RunStatus } = await import('@star/run-protocol');
    const { answered, changed } = outcome(transcript);
    sessionId = (await db.ensembleRunRepository.createSession(`spec:history ${QUESTION}`)).id;
    runId = await db.ensembleRunRepository.save({
        sessionId,
        transcript,
        status: RunStatus.complete,
        file: { name: transcriptFileName(transcript.startedAt), text: toMarkdown(transcript) },
        answered,
        changedModels: changed,
    });
});

test.afterAll(async () => {
    if (!dbReady) return;
    // The session cascades to the runs filed under it; the second clause covers
    // a run written before its session existed, which can no longer happen.
    // Only this file's sessions: spec files run in parallel workers against one
    // database, and a broader predicate deleted another file's rows mid-test.
    await db.getDb().chatSession.deleteMany({ where: { title: { startsWith: 'spec:history ' } } });
    await db.getDb().ensembleRun.deleteMany({ where: { question: QUESTION } });
    await db.disconnectDatabase();
});

test.beforeEach(() => {
    test.skip(!dbReady, 'needs Postgres on DATABASE_URL');
});

/**
 * A stored run WITH its rounds, which is what most of this file is about. They
 * are opt-in on the endpoint — the editor opens the rendered file and reads
 * nothing else, and the rounds are that same text several times over — so
 * asking for them is part of what these tests assert.
 */
const storedRun = async (id: string): Promise<StoredRun & { rounds: StoredRound[] }> => {
    const res = await history.getRunHandler({ id }, { rounds: true });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: StoredRun };
    // Asked for, so present. Null here would be the endpoint ignoring the query.
    expect(payload.data.rounds).not.toBeNull();
    return payload.data as StoredRun & { rounds: StoredRound[] };
};

test('thread urls round-trip, and an absent one is null rather than an empty string', async () => {
    const run = await storedRun(runId);
    const draft = run.rounds.find((r) => r.kind === 'draft')!;
    const byModel = new Map(draft.responses.map((r) => [r.model, r]));

    // Every round opens a fresh chat per model, so one run leaves a separate
    // conversation per model per round. This URL is the only way to go back and
    // confirm a model actually said what the transcript claims.
    expect(byModel.get('chatgpt')!.threadUrl).toBe(THREAD_URL);

    // Both of these are "no thread", and storing '' for either would make a URL
    // we never had indistinguishable from one we dropped on the floor.
    expect(byModel.get('claude')!.threadUrl).toBeNull();
    expect(byModel.get('gemini')!.threadUrl).toBeNull();

    // The dropout is stored as a failure with a reason, not as an empty answer.
    expect(byModel.get('gemini')!.ok).toBe(false);
    expect(byModel.get('gemini')!.error).toBe('timed out waiting for response');
});

test('every round stores the prompt each model received, and the context once', async () => {
    const run = await storedRun(runId);

    // Without these a disagreement between rounds cannot be diagnosed after the
    // fact: the answers alone do not say what was asked to produce them.
    expect(run.rounds.find((r) => r.kind === 'draft')!.sent).toEqual(DRAFT_SENT);
    expect(run.rounds.find((r) => r.kind === 'revise')!.sent).toEqual(REVISE_SENT);

    // Once for the run, not once per round. Every round prepends the same
    // block, so stored per round this was nine copies of the previous turns'
    // answers — most of the bytes a turn weighed. `sent` plus this is still the
    // exact text a model received.
    expect(run.context).toEqual(CONTEXT);
    for (const round of run.rounds) {
        expect(JSON.stringify(round.sent)).not.toContain('PRIOR_');
    }
});

test('rounds come back in the order they happened', async () => {
    const run = await storedRun(runId);
    expect(run.rounds.map((r) => r.kind)).toEqual(['draft', 'revise']);
});

test('changedModels matches what the rendered transcript says', async () => {
    const run = await storedRun(runId);

    // One implementation, two callers. Two would let the summary and the file
    // disagree about the result of the experiment, with no error on either end.
    expect(run.changedModels).toEqual(['chatgpt']);
    expect(run.file.text).toContain(`changed after review: ${run.changedModels.join(', ')}`);
    expect(run.file.text).toContain(`models answered: ${run.answeredCount} of ${run.modelCount}`);
    expect(run.answeredCount).toBe(2);
    expect(run.modelCount).toBe(3);
});

test('the list endpoint returns summaries, not transcripts', async () => {
    const res = await history.listRunsHandler({ limit: 50 });
    const { data } = (await res.json()) as { data: RunListResponse };
    const summary = data.runs.find((r) => r.id === runId) ?? null;

    expect(summary).not.toBeNull();
    // A transcript is tens of kilobytes and a list of twenty must not be.
    expect(summary).not.toHaveProperty('rounds');
    expect(summary).not.toHaveProperty('file');
    expect(JSON.stringify(summary)).not.toContain('DRAFT_CG');

    // The result of the experiment still travels with the summary, so the list
    // can say what a run found without loading it.
    expect(summary!.changedModels).toEqual(['chatgpt']);
});

test('the list limit is honoured', async () => {
    const res = await history.listRunsHandler({ limit: 1 });
    const { data } = (await res.json()) as { data: RunListResponse };
    expect(data.runs.length).toBeLessThanOrEqual(1);
});

test('a run is fetched without its rounds unless they are asked for', async () => {
    const res = await history.getRunHandler({ id: runId }, { rounds: false });
    const { data } = (await res.json()) as { data: StoredRun };

    // The transcript is what the editor opens, and it already contains every
    // answer. Sending the rounds beside it was the same text three to five
    // times over on the one read that happens most.
    expect(data.file.text).toContain('DRAFT_CG');
    expect(data.rounds).toBeNull();
    // The context is what a round's prompt was prepended with, so it travels
    // with the rounds and not with the transcript.
    expect(data.context).toBeNull();
    // Null, not absent: an omitted key reads as undefined, which this project
    // does not use anywhere.
    expect(data).toHaveProperty('rounds');
    expect(JSON.stringify(data.rounds)).not.toContain('DRAFT_CG');
});

test('an unknown run id is a 404, not an empty 200', async () => {
    const res = await history.getRunHandler(
        { id: '00000000-0000-4000-8000-000000000000' },
        { rounds: false },
    );

    // A 200 with nothing in it tells the client the run exists and holds no
    // rounds, which is the one thing a stored run can never be.
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
});

test('a turn is filed under its conversation, and the conversation reads back in order', async () => {
    const res = await history.getSessionHandler({ id: sessionId });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: SessionTurnsResponse };

    expect(payload.data.session.turnCount).toBe(1);
    expect(payload.data.turns.map((t) => t.id)).toEqual([runId]);
    // Oldest first. A conversation read newest-first is a conversation whose
    // answers precede their questions.
    expect(payload.data.turns[0]!.question).toBe(QUESTION);
});

const contextOf = async (id: string) =>
    conversationContext(await db.ensembleRunRepository.recentTurns(id, CONTEXT_TURNS));

test('each model is given back its own prior answers and no peer\'s', async () => {
    const context = await contextOf(sessionId);

    // The final answers of the turn above: chatgpt revised, claude did not,
    // gemini never answered at all.
    expect(context.chatgpt).toContain('FINAL_CG');
    expect(context.claude).toContain('DRAFT_CL');

    // The failure with no symptom. A model handed a peer's history reads as one
    // that revised its position, when it is one reading someone else's
    // conversation — and the transcript of the next turn looks perfectly fine.
    expect(context.chatgpt).not.toContain('DRAFT_CL');
    expect(context.claude).not.toContain('FINAL_CG');

    // The question is carried with the answer: without it the model is handed
    // its own words with no idea what they were answering.
    expect(context.chatgpt).toContain(QUESTION);

    // A model that dropped out gets no entry rather than an empty answer,
    // which would read as a model that was asked and chose to say nothing.
    expect(context.gemini ?? null).toBeNull();
});

test('a conversation with no turns yet hands the models nothing', async () => {
    const fresh = await db.ensembleRunRepository.createSession('spec:history never asked');
    // Not an empty block, not a heading with no body: nothing at all. The
    // first turn of a conversation must be indistinguishable from a run that
    // had no conversation to continue.
    expect(await contextOf(fresh.id)).toEqual({});
});

test('a title is one line, and short enough for a rail to render', () => {
    const prompt = `  why   is evict slow\n\nand what   should I do  ${'x'.repeat(400)}`;
    const title = history.toTitle(prompt);

    expect(title.startsWith('why is evict slow and what should I do')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(120);
    // Truncated, and visibly so: a title cut mid-word with no mark reads as a
    // prompt the user typed that way.
    expect(title.endsWith('…')).toBe(true);
});

test('a session that does not exist is a 404, not an empty conversation', async () => {
    const res = await history.getSessionHandler({ id: '3f1a7c6e-0000-4000-8000-000000000000' });
    // An empty conversation is a real state — opened, never asked — so it
    // cannot also be how a missing one answers.
    expect(res.status).toBe(404);
});
