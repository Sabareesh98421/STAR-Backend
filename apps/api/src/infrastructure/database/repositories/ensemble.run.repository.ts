// ensemble.run.repository.ts
import type { Transcript } from '@star/browser-ensemble/types';
import type { RunSummary, StoredRun } from '@star/run-protocol/history';
import type { ChatSessionSummary, SessionTurnsResponse } from '@star/run-protocol/chat';

/**
 * Everything a run needs to be written down, whether it finished or died.
 *
 * The transcript goes in whole rather than pre-mapped: the mapping from a run
 * to stored rows (including `ModelResult.url` to `threadUrl`) belongs in one
 * place, and that place is the implementation below, not every caller.
 */
export interface SaveRunInput {
    /** The conversation this turn belongs to. A run always has one. */
    readonly sessionId: string;
    /** Complete for a finished run; whatever rounds happened for a failed one. */
    readonly transcript: Transcript;
    /** A `RunStatus` value — 'complete' or 'failed'. */
    readonly status: string;
    /** The rendered transcript, stored as the editor opened it. */
    readonly file: { readonly name: string; readonly text: string };
    /** What the run found, from `outcome()`. Passed in rather than derived here:
     *  reading a transcript is the ensemble module's job, not the database's. */
    readonly answered: number;
    readonly changedModels: readonly string[];
}

/** One finished turn's closing answers — the last round's, which is where a
 *  turn's final answers are. Shaped for `conversationContext`, which turns it
 *  into what each model is told about the conversation so far. */
export interface SessionTurn {
    readonly question: string;
    readonly answers: readonly { readonly model: string; readonly ok: boolean; readonly text: string }[];
}

/**
 * Runs and the sessions that hold them, in one repository.
 *
 * Sessions do not get their own: every question asked of a session is a
 * question about its runs, and the two are written in the same transaction —
 * a turn that landed without touching its session's recency would sort to the
 * bottom of a history list it had just changed.
 */
export interface IEnsembleRunRepository {
    /** Returns the stored run's id. */
    save(input: SaveRunInput): Promise<string>;
    /** Summaries only — a transcript is tens of kilobytes. */
    list(limit: number): Promise<RunSummary[]>;
    /** One run with its transcript. `withRounds` adds every round's prompts and
     *  answers, which is several times the bytes — see StoredRun.rounds. */
    findById(id: string, withRounds: boolean): Promise<StoredRun | null>;

    createSession(title: string): Promise<ChatSessionSummary>;
    /** Most recently used first: a rail lists conversations, not creations. */
    listSessions(limit: number): Promise<ChatSessionSummary[]>;
    /** The session and its turns, oldest first. Null if there is no session. */
    findSession(id: string): Promise<SessionTurnsResponse | null>;
    /** Whether a conversation exists, without reading it. Not
     *  `findSession(id) !== null`, which loads every turn to answer yes. */
    sessionExists(id: string): Promise<boolean>;
    /** The newest `limit` turns of a conversation, oldest first. Rows only —
     *  `conversationContext` decides what a model is told about them. */
    recentTurns(sessionId: string, limit: number): Promise<SessionTurn[]>;
}
