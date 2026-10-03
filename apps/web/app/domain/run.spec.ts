import { expect, test } from '@playwright/test';
import { applyEvent, emptyRunState, phaseLabel, type RunEvent } from './run';
import { makeLocalRunTransport } from '../transport/run.transport';

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
