/**
 * Maps a round of the browser ensemble onto the shared run protocol.
 *
 * The event names, phases and statuses themselves live in @star/run-protocol,
 * imported by the web app from the same place — so this file holds only the
 * mapping that is genuinely the API's own: which round means which status, and
 * what an agent is when a model is a browser tab.
 */
import { AgentPhase, RunStatus } from '@star/run-protocol';
import { CHAT_ERROR } from '@star/run-protocol/chat';
import { toAppError } from '@/shared/utils/try-catch';
import type { Agent, RunStatus as RunStatusValue } from '@star/run-protocol';
import type { ChatServerPayload } from '@star/run-protocol/chat';
import type { RoundKind } from '@star/browser-ensemble/types';

/**
 * A round kind maps to the status the UI shows while it runs. The draft round
 * is 'responding'; review and revise are both the review loop, and the UI
 * distinguishes them by the round number it is told, not by a third status.
 */
export const STATUS_FOR_ROUND: Record<RoundKind, RunStatusValue> = {
    draft: RunStatus.responding,
    review: RunStatus.reviewing,
    revise: RunStatus.synthesizing,
};

/**
 * The phase a model sits in for the duration of a round. Review is the only
 * round where a model is reading rather than answering.
 */
export const PHASE_FOR_ROUND: Record<RoundKind, typeof AgentPhase.responding | typeof AgentPhase.reviewing> = {
    draft: AgentPhase.responding,
    review: AgentPhase.reviewing,
    revise: AgentPhase.responding,
};

/** A model name is its agent id here: there is exactly one tab per model. */
export const agentFor = (model: string): Agent => ({ id: model, name: model, isLeader: false });

/**
 * An error as a socket message, carrying the same fields `failure()` puts in an
 * HTTP body. One error model for both transports: a second envelope would make
 * every future handler decide which convention it follows, and a client that
 * matched only one would drop the other and wait forever.
 *
 * Callers log before calling this. Normalising here would otherwise be the only
 * record of a non-AppError, and the normalised form has lost the original.
 */
export const toChatError = (error: unknown): ChatServerPayload => {
    const appError = toAppError(error);
    return {
        type: CHAT_ERROR,
        code: appError.code,
        message: appError.message,
        details: appError.details ?? null,
    };
};
