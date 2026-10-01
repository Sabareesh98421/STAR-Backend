/**
 * The multi-LLM execution model. Pure: no Vue, no network.
 *
 * The wireframes do not cover this — they design the shell. The one decision
 * they do make is Sheet A's ROW note, "instances: tree row · file result ·
 * review finding · agent thread", so an agent thread and a review finding are
 * both ROWs. Rows, not columns, which is the only layout that survives an
 * unknown N.
 */

/** Backend truth about the run. Never changed by a network hiccup. */
export type RunStatus =
    | 'idle'
    | 'responding'
    | 'reviewing'
    | 'synthesizing'
    | 'complete'
    | 'failed'
    | 'cancelled';

/** Where one participant is in the round. */
export type AgentPhase = 'waiting' | 'responding' | 'reviewing' | 'done' | 'failed';

/** Our connection, not the run. A drop moves this and nothing else. */
export type LinkState = 'live' | 'reconnecting' | 'offline';

export interface Agent {
    readonly id: string;
    readonly name: string;
    /** The Leader holds internet access and RAG; participants do not. */
    readonly isLeader: boolean;
}

export interface AgentRuntime {
    phase: AgentPhase;
    /** Peer reviews this agent has written about others. */
    reviewsGiven: number;
    /** Peer reviews written about this agent's response. */
    reviewsReceived: number;
}

/** Sheet A's categories for what a peer can flag. Never a severity colour. */
export type ReviewKind =
    | 'factual'
    | 'reasoning'
    | 'omission'
    | 'assumption'
    | 'contradiction';

export interface Review {
    readonly id: string;
    /** Who wrote it. */
    readonly byAgentId: string;
    /** Whose response it is about. Peer review, never self. */
    readonly aboutAgentId: string;
    readonly kind: ReviewKind;
    readonly note: string;
}

/**
 * Events carry a monotonic seq so a reconnect can resume with ?since=<seq>
 * instead of replaying the run. See docs/frontend-architecture.md.
 */
export type RunEvent =
    | { seq: number; type: 'run.started'; agents: readonly Agent[]; prompt: string }
    | { seq: number; type: 'agent.phase'; agentId: string; phase: AgentPhase }
    | { seq: number; type: 'agent.token'; agentId: string; text: string }
    | { seq: number; type: 'review.added'; review: Review }
    | { seq: number; type: 'run.status'; status: RunStatus }
    | { seq: number; type: 'leader.note'; text: string };

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
 * Response text is deliberately absent. Tokens are the one thing that must not
 * enter reactive state, so they are buffered outside it and published per
 * response. Everything here is small and bounded by the agent count.
 */
export interface RunState {
    status: RunStatus;
    agents: Record<string, Agent>;
    runtime: Record<string, AgentRuntime>;
    reviews: Review[];
    leaderNote: string | null;
    /** Last applied seq, so a reconnect resumes with ?since=<cursor>. */
    cursor: number;
}

export function emptyRunState(): RunState {
    return { status: 'idle', agents: {}, runtime: {}, reviews: [], leaderNote: null, cursor: 0 };
}

/** Pure apart from mutating the state it is handed, so it can be tested alone. */
export function applyEvent(state: RunState, event: RunEvent): void {
    state.cursor = event.seq;

    switch (event.type) {
        case 'run.started':
            state.agents = Object.fromEntries(event.agents.map((a) => [a.id, a]));
            state.runtime = Object.fromEntries(
                event.agents.map((a) => [a.id, { phase: 'waiting', reviewsGiven: 0, reviewsReceived: 0 }]),
            );
            break;

        case 'agent.phase': {
            const rt = state.runtime[event.agentId];
            if (rt) rt.phase = event.phase;
            break;
        }

        case 'review.added': {
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

        case 'run.status':
            state.status = event.status;
            break;

        case 'leader.note':
            state.leaderNote = event.text;
            break;

        case 'agent.token':
            // Token text never lands in run state; see the note above.
            break;
    }
}
