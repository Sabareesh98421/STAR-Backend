/**
 * The network boundary. Nothing outside this folder knows HTTP or WebSocket
 * exist, mirroring the backend's rule that only infrastructure/ names a vendor.
 *
 * Two implementations of one interface. `httpRunTransport` is the real one —
 * it streams a run off the API. `makeLocalRunTransport` drives the same
 * interface from a timer and exists only so the specs can drain a full run
 * without a browser, an API, or three logged-in chat tabs.
 */
import type { Agent, RunEvent } from '../domain/run';
import { sseEvents } from './sse';

/** Distributes over the union, so each variant keeps its own shape. */
type Unsequenced<T> = T extends unknown ? Omit<T, 'seq'> : never;

export interface RunTransport {
    /**
     * Yields events until the run ends or the signal aborts. Every event
     * carries a seq so a reconnect can resume from the last applied one.
     */
    start(prompt: string, signal: AbortSignal): AsyncIterable<RunEvent>;
}

/** Whoever is in the ensemble is a runtime fact. Nothing here assumes a count. */
const ENSEMBLE: readonly Agent[] = [
    { id: 'a1', name: 'llama-3.3-70b', isLeader: false },
    { id: 'a2', name: 'qwen-2.5-32b', isLeader: false },
    { id: 'a3', name: 'mistral-small-3', isLeader: false },
    { id: 'a4', name: 'gemma-3-27b', isLeader: false },
    { id: 'ld', name: 'leader', isLeader: true },
];

const FINDINGS: ReadonlyArray<Pick<import('../domain/run').Review, 'kind' | 'note'>> = [
    { kind: 'factual', note: 'cites a TTL default that does not exist' },
    { kind: 'omission', note: 'does not mention listener cleanup' },
    { kind: 'assumption', note: 'assumes entries map is bounded' },
    { kind: 'reasoning', note: 'eviction order does not follow from the loop' },
    { kind: 'contradiction', note: 'claims O(1) after describing a full scan' },
];

const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        // Checked up front, not only via the listener: an abort that already
        // happened fires no event, so without this the timer resolves and the
        // run keeps emitting after it was cancelled.
        if (signal.aborted) return reject(signal.reason);

        const t = setTimeout(resolve, ms);
        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(t);
                reject(signal.reason);
            },
            { once: true },
        );
    });

/**
 * `pace` scales every delay. Production uses 1; the specs use 0 so a full run
 * drains instantly instead of waiting out the simulated latency.
 */
export function makeLocalRunTransport(pace = 1): RunTransport {
    return {
    async *start(prompt, signal) {
        let seq = 0;
        const next = (e: Unsequenced<RunEvent>): RunEvent => ({ ...e, seq: ++seq }) as RunEvent;
        const participants = ENSEMBLE.filter((a) => !a.isLeader);
        const leader = ENSEMBLE.find((a) => a.isLeader)!;

        yield next({ type: 'run.started', agents: ENSEMBLE, prompt });
        yield next({ type: 'run.status', status: 'responding' });

        // All participants are asked at once; they finish at different times.
        for (const agent of participants) {
            yield next({ type: 'agent.phase', agentId: agent.id, phase: 'responding' });
        }
        for (const agent of participants) {
            await sleep((400 + Math.random() * 900) * pace, signal);
            yield next({ type: 'agent.phase', agentId: agent.id, phase: 'done' });
        }

        // Peer review: each agent reads every other agent's response, never
        // its own. This is review, not debate; nobody replies to a finding.
        yield next({ type: 'run.status', status: 'reviewing' });
        for (const reviewer of participants) {
            yield next({ type: 'agent.phase', agentId: reviewer.id, phase: 'reviewing' });
            for (const subject of participants) {
                if (subject.id === reviewer.id) continue;
                await sleep(180 * pace, signal);
                if (Math.random() > 0.55) continue;
                const finding = FINDINGS[Math.floor(Math.random() * FINDINGS.length)]!;
                yield next({
                    type: 'review.added',
                    review: {
                        id: `r${seq}`,
                        byAgentId: reviewer.id,
                        aboutAgentId: subject.id,
                        kind: finding.kind,
                        note: finding.note,
                    },
                });
            }
            yield next({ type: 'agent.phase', agentId: reviewer.id, phase: 'done' });
        }

        yield next({ type: 'run.status', status: 'synthesizing' });
        yield next({ type: 'agent.phase', agentId: leader.id, phase: 'responding' });
        yield next({ type: 'leader.note', text: 'retrieving current sources' });
        await sleep(700 * pace, signal);
        yield next({ type: 'leader.note', text: 'weighing findings against responses' });
        await sleep(700 * pace, signal);
        yield next({ type: 'agent.phase', agentId: leader.id, phase: 'done' });
        yield next({ type: 'run.status', status: 'complete' });
    },
    };
}

export const localRunTransport: RunTransport = makeLocalRunTransport();

/**
 * The real transport: one POST, then events until the run ends.
 *
 * A run is MINUTES long — three rounds, each waiting on the slowest of three
 * real chat UIs — so this is a stream and not a request/response. There is no
 * timeout here on purpose: the only honest signal that a run is finished is the
 * server saying so, and a client-side deadline would abandon runs that were
 * still working.
 */
export function makeHttpRunTransport(apiBase: string): RunTransport {
    return {
        async *start(prompt, signal) {
            const res = await fetch(`${apiBase}/ensemble/run`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ prompt }),
                signal,
            });

            // A refusal arrives as JSON with a status — most usefully 409, the
            // shared browser already running someone else's round. Surfaced as
            // a throw so useRun treats it as a failure rather than an empty run.
            if (!res.ok || !res.body) {
                const detail = await res.text().catch(() => '');
                throw new Error(`run rejected (${res.status}) ${detail}`.trim());
            }

            yield* sseEvents<RunEvent>(res.body);
        },
    };
}
