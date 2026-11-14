/**
 * The live turn, and who is listening to it.
 *
 * Deliberately NOT a connection registry keyed by run: there is one shared
 * browser, so there is at most one turn in flight in the whole process, and
 * this holds it in a single slot. The `inFlight` boolean the SSE endpoint used
 * to keep is that slot now — the lock and the thing it protects are one object
 * instead of two that can disagree.
 *
 * Nothing here knows what a socket is. A listener is a callback, which is what
 * lets the replay and fan-out be tested without a server.
 */
import { ConflictError } from '@/shared/errors';
import { logger } from '@/infrastructure/logger';
import { runTurnHandler } from './ensemble.service';
import type { ChatServerMessage } from '@star/run-protocol/chat';
import type { TurnRequest } from './ensemble.service';

/** Where one listener's messages go. One socket, usually. */
export type Sink = (message: ChatServerMessage) => void;

interface LiveTurn {
    readonly sessionId: string;
    /**
     * Every message this turn produced, in order — a run outlives the socket
     * that asked for it, and this is what a reconnect is replayed from.
     *
     * ponytail: `run.file` is in here, so this holds ~2x the last transcript
     * until the next turn replaces it. Bounded, deliberate. Upgrade path: drop
     * the file's text from the replay, costing the client that reconnects
     * between the file arriving and the turn ending.
     */
    readonly messages: ChatServerMessage[];
    running: boolean;
}

/**
 * The finished turn is kept rather than cleared, until the next one replaces
 * it. Clearing it on completion opens a window where a client that reconnects
 * in the same instant finds neither the live messages nor the stored run, and
 * concludes the turn produced nothing.
 */
let live: LiveTurn | null = null;

/**
 * Listeners per session, so a turn's messages reach the conversation they
 * belong to and no other. Empty sets are deleted rather than left behind: a
 * registry that only grows does not fail a test, it shows up as memory a week
 * later.
 */
const listeners = new Map<string, Set<Sink>>();

/** The only place a sink is called. A socket that closed mid-run must not cost
 *  the other listeners their messages, or the run its ending. */
const deliver = (sink: Sink, message: ChatServerMessage): void => {
    try {
        sink(message);
    } catch (error) {
        logger.warn({ err: error }, 'A chat listener rejected a message');
    }
};

/** Reads for the specs, which cannot otherwise see a leak or a stuck lock. */
export const liveState = () => ({
    sessionId: live?.sessionId ?? null,
    running: live?.running ?? false,
    messageCount: live?.messages.length ?? 0,
    listenerCount: [...listeners.values()].reduce((n, set) => n + set.size, 0),
});

/**
 * Subscribes to a conversation and replays what the live turn has already said.
 *
 * `since` is the last seq the caller applied, so a reconnect mid-run picks up
 * exactly where it stopped: replaying from zero would duplicate every event it
 * already has, and replaying nothing would leave a permanent gap.
 */
export function subscribe(sessionId: string, sink: Sink, since = 0): () => void {
    const set = listeners.get(sessionId) ?? new Set<Sink>();
    set.add(sink);
    listeners.set(sessionId, set);

    const off = () => {
        const current = listeners.get(sessionId);
        if (!current) return;
        current.delete(sink);
        if (current.size === 0) listeners.delete(sessionId);
    };

    // A sink in the registry whose caller never received `off` can never be
    // removed, so the replay cannot be allowed to throw past this.
    try {
        if (live?.sessionId === sessionId) {
            for (const message of live.messages) {
                if (message.seq > since) deliver(sink, message);
            }
        }
    } catch (error) {
        off();
        throw error;
    }

    return off;
}

/**
 * Starts a turn and returns at once; its messages arrive through `subscribe`.
 *
 * Refused rather than queued when one is already running: a second turn would
 * type into the same three composers as the first and both transcripts would be
 * worthless, and a queued turn that starts eight minutes later is not what the
 * caller asked for either.
 */
export function startTurn(request: TurnRequest): void {
    if (live?.running) {
        throw new ConflictError('An ensemble run is already in progress on the shared browser');
    }

    const turn: LiveTurn = { sessionId: request.sessionId, messages: [], running: true };
    live = turn;

    void runTurnHandler(request, (payload) => {
        // Numbered here because this is the only place that knows the whole
        // log, which is what makes the sequence gapless across the run AND its
        // error paths. A producer numbering its own messages would restart.
        const message = { ...payload, seq: turn.messages.length + 1 } as ChatServerMessage;
        turn.messages.push(message);
        for (const sink of listeners.get(turn.sessionId) ?? []) deliver(sink, message);
    }).finally(() => {
        // Released here and not on success only: a turn that threw would
        // otherwise hold the shared browser until the process restarted.
        turn.running = false;
    });
}
