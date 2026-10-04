/**
 * The multi-LLM execution model. Pure: no Vue, no network.
 *
 * The wireframes do not cover this — they design the shell. The one decision
 * they do make is Sheet A's ROW note, "instances: tree row · file result ·
 * review finding · agent thread", so an agent thread and a review finding are
 * both ROWs. Rows, not columns, which is the only layout that survives an
 * unknown N.
 *
 * The wire vocabulary lives in @star/run-protocol, shared with the API. What is
 * here is the client's own: how a run is stored and how an event changes it.
 * Re-exported so components keep importing their types from one place.
 */
import type { Agent, AgentPhase, Review, RunStatus } from '@star/run-protocol';
import { RunEventType } from '@star/run-protocol';
import type { ChatServerMessage } from '@star/run-protocol/chat';

export type { Agent, AgentPhase, Review, ReviewKind, RunEvent, RunStatus } from '@star/run-protocol';

/** Our connection, not the run. A drop moves this and nothing else. */
export type LinkState = 'live' | 'reconnecting' | 'offline';

export interface AgentRuntime {
    phase: AgentPhase;
    /** Peer reviews this agent has written about others. */
    reviewsGiven: number;
    /** Peer reviews written about this agent's response. */
    reviewsReceived: number;
}

/** Whether the server is still working on the turn. The composer's busy state,
 *  the rail's live row and the marker table all ask this one question. */
export const isRunning = (status: RunStatus): boolean =>
    status === 'responding' || status === 'reviewing' || status === 'synthesizing';

export const PHASE_MARKER = {
    waiting: 'closed',
    responding: 'running',
    reviewing: 'running',
    done: 'open',
    failed: 'raised',
} as const;

/** Short, lowercase, no severity language. Shown in the ROW's meta slot. */
export function phaseLabel(runtime: AgentRuntime): string {
    switch (runtime.phase) {
        case 'waiting':
            return 'waiting';
        case 'responding':
            return 'responding';
        case 'reviewing':
            return `reviewing · ${runtime.reviewsGiven}`;
        case 'done':
            return runtime.reviewsReceived === 0
                ? 'no findings'
                : `${runtime.reviewsReceived} finding${runtime.reviewsReceived === 1 ? '' : 's'}`;
        case 'failed':
            return 'failed';
    }
}

/**
 * One run, normalised. Flat maps and a flat list, not a nested tree: an event
 * touches one entry rather than walking a graph.
 *
 * TOKENS are deliberately absent — they are the one thing that must not enter
 * reactive state, so they are buffered outside it and published per response.
 * A settled answer is a different thing: one per agent per round, bounded by
 * the agent count like everything else here, so `responses` holds those.
 */
export interface RunState {
    status: RunStatus;
    agents: Record<string, Agent>;
    runtime: Record<string, AgentRuntime>;
    /** Empty until something sends `review.added` — see PENDING in
     *  @star/run-protocol. Bounded by agents x rounds once one does. */
    reviews: Review[];
    /** Empty while there is no leader. Same PENDING list. */
    leaderNote: string | null;
    /**
     * The latest settled answer per agent. Bounded by the agent count like
     * everything else here, which is why it is allowed in where tokens are
     * not: the exclusion above is about per-token churn, and one whole answer
     * arriving once per round is not that.
     */
    responses: Record<string, string>;
    /** The finished transcript, once the run produced one. */
    file: { name: string; text: string } | null;
    /** Last applied seq, so a reconnect resumes with ?since=<cursor>. */
    cursor: number;
}

export function emptyRunState(): RunState {
    return {
        status: 'idle',
        agents: {},
        runtime: {},
        reviews: [],
        leaderNote: null,
        responses: {},
        file: null,
        cursor: 0,
    };
}

/**
 * Pure apart from mutating the state it is handed, so it can be tested alone.
 *
 * Takes the whole server union, error included: the cursor has one writer and
 * this is it, and an error that does not advance it is replayed on every
 * reconnect for the rest of the turn.
 */
export function applyEvent(state: RunState, event: ChatServerMessage): void {
    // seq 0 belongs to no turn's sequence and would resume from the start of
    // the run. Any other seq is followed exactly, smaller ones included — a
    // second turn numbers its own messages from 1.
    if (event.seq > 0) state.cursor = event.seq;

    switch (event.type) {
        case RunEventType.started:
            state.agents = Object.fromEntries(event.agents.map((a) => [a.id, a]));
            state.runtime = Object.fromEntries(
                event.agents.map((a) => [a.id, { phase: 'waiting', reviewsGiven: 0, reviewsReceived: 0 }]),
            );
            break;

        case RunEventType.agentPhase: {
            const rt = state.runtime[event.agentId];
            if (rt) rt.phase = event.phase;
            break;
        }

        case RunEventType.reviewAdded: {
            // Peer review, never self-review. A backend that sends one is
            // wrong, and silently counting it would hide that.
            if (event.review.byAgentId === event.review.aboutAgentId) return;
            state.reviews.push(event.review);
            const by = state.runtime[event.review.byAgentId];
            const about = state.runtime[event.review.aboutAgentId];
            if (by) by.reviewsGiven += 1;
            if (about) about.reviewsReceived += 1;
            break;
        }

        case RunEventType.status:
            state.status = event.status;
            break;

        case RunEventType.leaderNote:
            state.leaderNote = event.text;
            break;

        case RunEventType.agentResponse:
            // A failed model must not overwrite the answer it gave in an
            // earlier round with an empty string — that would read as a model
            // which answered nothing rather than one that dropped out.
            if (event.ok && event.text) state.responses[event.agentId] = event.text;
            break;

        case RunEventType.file:
            state.file = { name: event.name, text: event.text };
            break;

        case RunEventType.agentToken:
            // Token text never lands in run state; see the note above.
            break;
    }
}
