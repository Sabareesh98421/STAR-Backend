/**
 * The stored-run contract: what the API persists and the web app reads back.
 *
 * Separate from the live event contract in index.ts because the two answer
 * different questions. Events describe a run as it happens and are gone once
 * applied; this describes a run that already finished and is being read again,
 * possibly weeks later, to compare against another one.
 *
 * `threadUrl` is the reason this exists at all. Every round opens a FRESH chat
 * per model — a reviewer must never see its own draft — so one run leaves nine
 * separate conversations scattered across three services. Without the URL of
 * each, the stored text is unverifiable: there is no way to go back and confirm
 * a model actually said it, or to read what else was on screen at the time.
 */

/** One model's answer in one round, as stored. */
export interface StoredResponse {
    readonly model: string;
    readonly ok: boolean;
    readonly text: string;
    readonly ms: number;
    /** The chat thread this answer was read from. Null if it never got that far. */
    readonly threadUrl: string | null;
    readonly error: string | null;
}

export interface StoredRound {
    readonly kind: string;
    readonly iteration: number;
    readonly at: string;
    /**
     * The round's own prompt per model, WITHOUT the conversation context. What a
     * model received is this plus `StoredRun.context[model]`; the context is the
     * same for every round, so storing it here meant nine copies of it per turn.
     */
    readonly sent: Record<string, string>;
    readonly responses: readonly StoredResponse[];
}

/**
 * Enough to list a run without loading its rounds. A run transcript is tens of
 * kilobytes and a list of twenty of them should not be.
 */
export interface RunSummary {
    readonly id: string;
    readonly question: string;
    readonly startedAt: string;
    /** Null while a run is still going, or if it died without finishing. */
    readonly finishedAt: string | null;
    readonly status: string;
    readonly modelCount: number;
    /** How many models produced an answer. Differs from modelCount on a dropout. */
    readonly answeredCount: number;
    /** Models whose revised answer differs from their draft. The result. */
    readonly changedModels: readonly string[];
}

export interface StoredRun extends RunSummary {
    /**
     * Every round, with its prompts and answers. Opt-in
     * (`?rounds=1`) because it is the transcript's own text three to five times
     * over and the editor reads `file` alone. Null means "not requested" — a
     * stored run with no rounds is not a thing that exists.
     */
    readonly rounds: readonly StoredRound[] | null;
    /** What each round's prompts were prepended with. Travels with the rounds,
     *  being unreadable without them. `{}` for a first turn. */
    readonly context: Record<string, string> | null;
    /** The rendered transcript, as the editor opens it. */
    readonly file: { readonly name: string; readonly text: string };
}

/** GET /api/ensemble/runs */
export interface RunListResponse {
    readonly runs: readonly RunSummary[];
}
