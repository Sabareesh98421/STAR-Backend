/**
 * The run wire contract: what the API sends and the web app applies.
 *
 * One copy, imported by both. These names were written twice before — once in
 * the API's event builders and once in the web app's event union — and that is
 * the worst possible thing to duplicate: an unrecognised event type is not an
 * error on either side, so a rename on one end produces a stream the other end
 * silently ignores. No throw, no log, just a UI that never updates.
 *
 * Types only, plus the string constants. No logic: how a client stores a run is
 * its own business, and the API has no opinion about it.
 */

/** Backend truth about the run. Never changed by a network hiccup. */
export const RunStatus = {
    idle: 'idle',
    responding: 'responding',
    reviewing: 'reviewing',
    synthesizing: 'synthesizing',
    complete: 'complete',
    failed: 'failed',
    cancelled: 'cancelled',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

/** Where one participant is in the round. */
export const AgentPhase = {
    waiting: 'waiting',
    responding: 'responding',
    reviewing: 'reviewing',
    done: 'done',
    failed: 'failed',
} as const;
export type AgentPhase = (typeof AgentPhase)[keyof typeof AgentPhase];

/** Sheet A's categories for what a peer can flag. Never a severity colour. */
export const ReviewKind = {
    factual: 'factual',
    reasoning: 'reasoning',
    omission: 'omission',
    assumption: 'assumption',
    contradiction: 'contradiction',
} as const;
export type ReviewKind = (typeof ReviewKind)[keyof typeof ReviewKind];

export const RunEventType = {
    started: 'run.started',
    agentPhase: 'agent.phase',
    agentToken: 'agent.token',
    agentResponse: 'agent.response',
    reviewAdded: 'review.added',
    status: 'run.status',
    leaderNote: 'leader.note',
    /** The finished transcript, as the file the editor opens. */
    file: 'run.file',
} as const;

/**
 * Events nothing sends yet, and what each waits on. The web app applies all
 * three and the rail renders two, so without this list the absence is invisible
 * from either end. Delete an entry when its producer lands.
 *
 * - `agent.token` — streaming. A browser tab is read by polling until its text
 *   stops growing, so there is no token stream, only `agent.response`.
 * - `review.added` — a STRUCTURED finding. The cross-review happens and its
 *   prose is in the transcript; parsing that into { kind, note } is not done.
 * - `leader.note` — a leader. `agentFor` makes every model a peer.
 */
export const PENDING: readonly RunEventType[] = [
    RunEventType.agentToken,
    RunEventType.reviewAdded,
    RunEventType.leaderNote,
];
export type RunEventType = (typeof RunEventType)[keyof typeof RunEventType];

export interface Agent {
    readonly id: string;
    readonly name: string;
    /** The Leader holds internet access and RAG; participants do not. */
    readonly isLeader: boolean;
}

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
 * instead of replaying the run.
 */
export type RunEvent =
    | { seq: number; type: typeof RunEventType.started; agents: readonly Agent[]; prompt: string }
    | { seq: number; type: typeof RunEventType.agentPhase; agentId: string; phase: AgentPhase }
    | { seq: number; type: typeof RunEventType.agentToken; agentId: string; text: string }
    | {
          seq: number;
          type: typeof RunEventType.agentResponse;
          agentId: string;
          /** Which round produced it: draft, review or revise. */
          round: string;
          iteration: number;
          text: string;
          ok: boolean;
          error: string | null;
      }
    | { seq: number; type: typeof RunEventType.reviewAdded; review: Review }
    | { seq: number; type: typeof RunEventType.status; status: RunStatus }
    | { seq: number; type: typeof RunEventType.leaderNote; text: string }
    | { seq: number; type: typeof RunEventType.file; name: string; text: string };
