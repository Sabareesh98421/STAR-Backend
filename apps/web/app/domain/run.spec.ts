import { expect, test } from '@playwright/test';
import { applyEvent, emptyRunState, phaseLabel, type RunEvent } from './run';
import { makeLocalRunTransport } from '../transport/run.transport.fixture';

const transport = makeLocalRunTransport(0);

async function drainRun(prompt = 'compare eviction strategies') {
    const state = emptyRunState();
    const events: RunEvent[] = [];
    for await (const event of transport.start(prompt, new AbortController().signal)) {
        events.push(event);
        applyEvent(state, event);
    }
    return { state, events };
}

test('every participant reaches done, and the run completes', async () => {
    const { state } = await drainRun();

    expect(Object.keys(state.agents).length).toBeGreaterThan(1);
    for (const [id, rt] of Object.entries(state.runtime)) {
        expect(rt.phase, `${state.agents[id]?.name} never finished`).toBe('done');
    }
    expect(state.status).toBe('complete');
});

test('review is peer review: never self, never a reply', async () => {
    const { state } = await drainRun();

    for (const review of state.reviews) {
        expect(review.byAgentId).not.toBe(review.aboutAgentId);
        // The Leader synthesises; it does not sit in the peer round.
        expect(state.agents[review.byAgentId]?.isLeader).toBe(false);
    }
});

test('a self-review is dropped rather than counted', () => {
    const state = emptyRunState();
    applyEvent(state, {
        seq: 1,
        type: 'run.started',
        prompt: 'x',
        agents: [{ id: 'a', name: 'a', isLeader: false }],
    });
    applyEvent(state, {
        seq: 2,
        type: 'review.added',
        review: { id: 'r', byAgentId: 'a', aboutAgentId: 'a', kind: 'factual', note: 'n' },
    });

    expect(state.reviews).toHaveLength(0);
    expect(state.runtime.a?.reviewsGiven).toBe(0);
});

test('finding counts match the reviews actually recorded', async () => {
    const { state } = await drainRun();

    const received = Object.values(state.runtime).reduce((n, rt) => n + rt.reviewsReceived, 0);
    const given = Object.values(state.runtime).reduce((n, rt) => n + rt.reviewsGiven, 0);
    expect(received).toBe(state.reviews.length);
    expect(given).toBe(state.reviews.length);
});

test('the cursor tracks the last applied event, so a reconnect can resume', async () => {
    const { state, events } = await drainRun();
    expect(state.cursor).toBe(events.at(-1)?.seq);
    // seq must be strictly increasing or ?since=<seq> replays or skips.
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
});

test('an aborted run stops emitting', async () => {
    const controller = new AbortController();
    const state = emptyRunState();
    let count = 0;

    await expect(async () => {
        for await (const event of transport.start('x', controller.signal)) {
            applyEvent(state, event);
            if (++count === 3) controller.abort(new DOMException('cancelled', 'AbortError'));
        }
    }).rejects.toThrow();

    expect(state.status).not.toBe('complete');
});

test('phase labels never carry severity language', () => {
    const labels = (['waiting', 'responding', 'reviewing', 'done', 'failed'] as const).map((phase) =>
        phaseLabel({ phase, reviewsGiven: 2, reviewsReceived: 2 }),
    );
    for (const label of labels) {
        expect(label).not.toMatch(/error|critical|warning|bad|wrong|winner|best/i);
    }
    expect(phaseLabel({ phase: 'done', reviewsGiven: 0, reviewsReceived: 0 })).toBe('no findings');
    expect(phaseLabel({ phase: 'done', reviewsGiven: 0, reviewsReceived: 1 })).toBe('1 finding');
});

// --- the events the real transport adds -------------------------------------

test('a settled answer is stored under its own agent', () => {
    const state = emptyRunState();
    applyEvent(state, { seq: 1, type: 'agent.response', agentId: 'gemini', round: 'draft', iteration: 0, text: 'A', ok: true, error: null });
    applyEvent(state, { seq: 2, type: 'agent.response', agentId: 'claude', round: 'draft', iteration: 0, text: 'B', ok: true, error: null });

    expect(state.responses).toEqual({ gemini: 'A', claude: 'B' });
});

test('a later round replaces an answer rather than appending to it', () => {
    const state = emptyRunState();
    applyEvent(state, { seq: 1, type: 'agent.response', agentId: 'gemini', round: 'draft', iteration: 0, text: 'draft', ok: true, error: null });
    applyEvent(state, { seq: 2, type: 'agent.response', agentId: 'gemini', round: 'revise', iteration: 1, text: 'revised', ok: true, error: null });

    expect(state.responses.gemini).toBe('revised');
});

test('a failed model does not erase the answer it already gave', () => {
    // A dropout in a later round must not read as a model that answered
    // nothing — that is the difference between two-way and three-way agreement.
    const state = emptyRunState();
    applyEvent(state, { seq: 1, type: 'agent.response', agentId: 'gemini', round: 'draft', iteration: 0, text: 'draft', ok: true, error: null });
    applyEvent(state, { seq: 2, type: 'agent.response', agentId: 'gemini', round: 'revise', iteration: 1, text: '', ok: false, error: 'timed out' });

    expect(state.responses.gemini).toBe('draft');
});

test('the transcript file is held until a run produces one', () => {
    const state = emptyRunState();
    expect(state.file).toBeNull();

    applyEvent(state, { seq: 1, type: 'run.file', name: 'run-x.md', text: '# answer' });
    expect(state.file).toEqual({ name: 'run-x.md', text: '# answer' });
});

test('an error advances the cursor, so a reconnect does not replay it', () => {
    const state = emptyRunState();
    applyEvent(state, { seq: 1, type: 'run.started', agents: [], prompt: 'q' });
    applyEvent(state, { seq: 2, type: 'error', code: 'CONFLICT', message: 'busy', details: null });

    // The protocol puts a seq on the error for exactly this reason: left behind
    // the cursor, it came back on every reconnect for the rest of the turn and
    // raised its toast again each time.
    expect(state.cursor).toBe(2);
});

test('a connection-scoped refusal does not drag the cursor back to the start', () => {
    const state = emptyRunState();
    applyEvent(state, { seq: 7, type: 'run.status', status: 'reviewing' });
    // seq 0 is 'belongs to no turn's sequence' — a refused turn, a rejected
    // message. Taken literally it would resume the socket from zero and replay
    // the whole run over the top of itself.
    applyEvent(state, { seq: 0, type: 'error', code: 'CONFLICT', message: 'busy', details: null });

    expect(state.cursor).toBe(7);
});

test('a second turn restarts the cursor at its own seq 1', () => {
    const state = emptyRunState();
    applyEvent(state, { seq: 11, type: 'run.status', status: 'complete' });
    // A turn numbers its messages from 1, so the next turn on the same
    // conversation opens below the last one's high-water mark. Held at the mark,
    // a reconnect would resume past this turn's opening and never ask for it.
    applyEvent(state, { seq: 1, type: 'run.started', agents: [], prompt: 'next' });

    expect(state.cursor).toBe(1);
});
