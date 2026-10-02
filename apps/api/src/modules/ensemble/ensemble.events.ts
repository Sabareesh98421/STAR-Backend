/**
 * The event vocabulary the UI consumes, in one place.
 *
 * These names are a contract with `apps/web/app/domain/run.ts` — its `RunEvent`
 * union and `applyEvent` switch on these exact strings. Written once here and
 * imported, so a rename cannot drift into a stream the frontend silently
 * ignores (an unknown event type is not an error on either side, which is
 * exactly what makes the drift invisible).
 */
export const RunEventType = {
    started: 'run.started',
    agentPhase: 'agent.phase',
    agentResponse: 'agent.response',
    status: 'run.status',
    /** The finished transcript, as the file the editor opens. */
    file: 'run.file',
} as const;

/** Mirrors `AgentPhase` in the web domain model. */
export const AgentPhase = {
    waiting: 'waiting',
    responding: 'responding',
    reviewing: 'reviewing',
    done: 'done',
    failed: 'failed',
} as const;

/** Mirrors `RunStatus`. `responding` covers the draft round, not the whole run. */
export const RunStatus = {
    responding: 'responding',
    reviewing: 'reviewing',
    synthesizing: 'synthesizing',
    complete: 'complete',
    failed: 'failed',
} as const;

/**
 * A round kind maps to the status the UI shows while it runs. The draft round
 * is 'responding'; review and revise are both the review loop, and the UI
 * distinguishes them by the round number it is told, not by a third status.
 */
export const STATUS_FOR_ROUND: Record<string, string> = {
    draft: RunStatus.responding,
    review: RunStatus.reviewing,
    revise: RunStatus.synthesizing,
};

/** A model name is its agent id here: there is exactly one tab per model. */
export const agentFor = (model: string) => ({ id: model, name: model, isLeader: false });
