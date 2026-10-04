/**
 * The chat-session contract: what a conversation is, and what the two ends of
 * its socket say to each other.
 *
 * Separate from index.ts (one run as it happens) and history.ts (one run read
 * back) because this is the thing that holds many of them: a session is an
 * ordered list of turns, and a turn is one ensemble run.
 *
 * Both directions live here for the same reason the event names do: an
 * unrecognised message type is not an error on either side, so a rename in one
 * place produces silence rather than a failure.
 */
import type { RunEvent } from './index';
import type { RunSummary } from './history';

/**
 * A conversation, as the rail lists it. `title` is the first turn's question —
 * derived once at creation rather than on read, so renaming a session later is
 * a column update and not a change to how every list is computed.
 */
export interface ChatSessionSummary {
    readonly id: string;
    readonly title: string;
    readonly createdAt: string;
    /** Bumped by every turn, so the rail can order by recent activity. */
    readonly updatedAt: string;
    readonly turnCount: number;
}

/**
 * One turn is one run, and `RunSummary` already describes a run without its
 * transcript. The transcript is fetched per turn from `GET /ensemble/runs/:id`
 * when the user opens one — a session with twelve turns is otherwise hundreds
 * of kilobytes of markdown nobody has asked to read.
 */
export type ChatTurn = RunSummary;

/** GET /api/ensemble/sessions */
export interface SessionListResponse {
    readonly sessions: readonly ChatSessionSummary[];
}

/** GET /api/ensemble/sessions/:id — finished turns, oldest first. */
export interface SessionTurnsResponse {
    readonly session: ChatSessionSummary;
    readonly turns: readonly ChatTurn[];
}

/** POST /api/ensemble/sessions */
export interface SessionCreatedResponse {
    readonly session: ChatSessionSummary;
}

export const ChatClientMessageType = {
    /** Ask the ensemble the next question in this conversation. */
    turnStart: 'turn.start',
} as const;
export type ChatClientMessageType =
    (typeof ChatClientMessageType)[keyof typeof ChatClientMessageType];

/**
 * There is no `turn.cancel`. Cancel stops delivery, never the work: the models
 * are mid-conversation in three real chat tabs with nothing safe to interrupt,
 * so a client that cancels stops applying events and the server keeps going to
 * a complete transcript. A wire message that did nothing would claim otherwise.
 */
export type ChatClientMessage = {
    readonly type: typeof ChatClientMessageType.turnStart;
    readonly prompt: string;
    readonly rounds: number | null;
};

/** The one message type that is not a run event. */
export const CHAT_ERROR = 'error' as const;

/**
 * The same fields `failure()` produces from an `AppError`, so the project keeps
 * ONE error model rather than one for HTTP and another for the socket. Every
 * future handler inherits the answer to "which convention is this?".
 *
 * `details` is always present and null when there is none, where the HTTP body
 * omits the key: an omitted key reads as `undefined`, which this project does
 * not use anywhere.
 */
export interface ChatErrorMessage {
    readonly seq: number;
    readonly type: typeof CHAT_ERROR;
    readonly code: string;
    readonly message: string;
    readonly details: unknown;
}

/**
 * Carries `seq` on every variant — including the error — because a reconnect
 * resumes from the last seq it applied, and an error that arrived outside that
 * numbering would be replayed or skipped on every resume.
 */
export type ChatServerMessage = RunEvent | ChatErrorMessage;

/** Distributes over the union, so each variant keeps its own shape. */
type Unsequenced<T> = T extends unknown ? Omit<T, 'seq'> : never;

/**
 * A server message before it is numbered. The sequence belongs to whatever
 * holds the run's event log, since that is the only thing that can promise the
 * numbering is gapless — a producer that numbered its own events would start
 * again at 1 for every error path.
 */
export type ChatServerPayload = Unsequenced<ChatServerMessage>;
