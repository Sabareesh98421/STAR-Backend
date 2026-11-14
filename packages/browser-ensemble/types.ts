/**
 * Shapes shared by the transport and the protocol.
 *
 * No optional fields anywhere: an absent value is `null` and every caller has
 * to state it. `error?: string` would let a result be constructed with no
 * mention of whether it failed, and "no error property" and "error: null" would
 * then mean the same thing in two different ways.
 */
import type { Page } from 'playwright';

/**
 * The CDP endpoint the ensemble drives, and the only one `chrome.ts` will
 * start a browser on itself.
 *
 * Here rather than in chrome.ts so the API's config can name it without
 * pulling playwright into a Bun process that deliberately never drives a
 * browser in-process — this file's only import is type-only and erased.
 */
export const DEFAULT_CDP_URL = 'http://localhost:9222';

/** One browser-based model: where its chat lives and how to read it. */
export interface Target {
    readonly name: string;
    /** Matches an already-open tab's URL, so a run reuses it. */
    readonly match: RegExp;
    readonly newChat: string;
    readonly composer: string;
    readonly response: string;
}

/** What one model produced for one prompt. */
export interface ModelResult {
    readonly model: string;
    /** True only for real answer text: not a timeout, not a provider error. */
    readonly ok: boolean;
    readonly text: string;
    readonly ms: number;
    /** How many sends it took. 1 unless a provider error forced a retry. */
    readonly attempts: number;
    /** The thread the answer was read from, for auditing a transcript. */
    readonly url: string | null;
    readonly error: string | null;
}

/** The outcome of watching one response element settle. */
export interface ReadResult {
    readonly text: string;
    readonly ms: number;
    /** The service answered with its own error rather than the model's answer. */
    readonly providerError: boolean;
    readonly timedOut: boolean;
}

export interface ReadOptions {
    /** Response count before the prompt was sent; anything at or below is old. */
    readonly before: number;
    /** Texts already produced, which therefore cannot be this round's answer. */
    readonly stale: readonly string[];
    readonly settleMs: number;
    readonly timeoutMs: number;
}

export interface DispatchOptions {
    readonly cdpUrl: string;
    /** Open a new thread per model before sending. Every round needs this. */
    readonly fresh: boolean;
    /** False sends without waiting for answers. */
    readonly collect: boolean;
    readonly retries: number;
    readonly staleFor: (model: string) => readonly string[];
    /** Fires per model as it settles, including on failure. */
    readonly onSettled: ((result: ModelResult) => void) | null;
}

/** A prepared tab, waiting for its Enter. */
export interface Prepared {
    readonly target: Target;
    readonly page: Page;
    readonly before: number;
    readonly stale: readonly string[];
}

export type RoundKind = 'draft' | 'review' | 'revise';

export interface Round {
    readonly kind: RoundKind;
    /** 0 for the draft; 1..n for each review/revise pass. */
    readonly iteration: number;
    readonly at: string;
    /**
     * The round's own prompt per model, WITHOUT the conversation context — a
     * disagreement between rounds cannot be diagnosed without it. What a model
     * received is this plus the run's `context` for that model.
     */
    readonly sent: Record<string, string>;
    readonly responses: readonly ModelResult[];
}

export interface Transcript {
    readonly question: string;
    readonly startedAt: string;
    /** Null until the run ends, including when it ends by failing. */
    finishedAt: string | null;
    readonly models: readonly string[];
    readonly rounds: Round[];
    /**
     * Earlier turns as each model was given them, once for the whole run — every
     * round prepends the same block, and recording it per round made a turn's
     * `sent` nine copies of it. Empty on a first turn.
     */
    readonly context: Record<string, string>;
    /** Each model's last answer. Empty until the run finishes. */
    final: Record<string, string>;
}

export interface RoundStart {
    readonly kind: RoundKind;
    readonly iteration: number;
    readonly models: readonly string[];
}

export interface SettledInRound {
    readonly kind: RoundKind;
    readonly iteration: number;
    readonly result: ModelResult;
}

export interface RunOptions {
    readonly rounds: number;
    readonly opts: Partial<DispatchOptions>;
    /**
     * Earlier turns of the same conversation, keyed by model, prepended to
     * every prompt that model receives. Each model sees only its own history:
     * see PromptContext.context in ensemble.ts for why that is not optional.
     */
    readonly context: Record<string, string>;
    readonly onRound: ((round: Round) => void) | null;
    readonly onSettled: ((event: SettledInRound) => void) | null;
    readonly onRoundStart: ((event: RoundStart) => void) | null;
    /**
     * How a round is delivered. Defaults to `dispatch`, which drives three real
     * browser tabs; a spec passes one that answers at once.
     *
     * The rule worth testing is what a round DELIVERS against what it RECORDS,
     * and getting that backwards is silent — the models answer a follow-up well,
     * in isolation, never told there was a conversation.
     */
    readonly deliver:
        | ((
              promptFor: (model: string) => string,
              options?: Partial<DispatchOptions>,
          ) => Promise<ModelResult[]>)
        | null;
}

/**
 * The worker protocol.
 *
 * Playwright's connectOverCDP does not work under Bun — it hangs on the
 * websocket upgrade and times out, while the identical call under Node connects
 * in ~100ms. The API is Bun/Elysia, so it cannot drive a browser in-process and
 * runs the ensemble in a Node child instead, one NDJSON line per event.
 *
 * Measured, not assumed: `bun -e "chromium.connectOverCDP(...)"` fails at 20s,
 * `node --input-type=module -e` with the same body succeeds. Revisit when Bun's
 * node:http upgrade handling catches up.
 */
export const WorkerOutKind = {
    roundStart: 'round-start',
    settled: 'settled',
    done: 'done',
    failed: 'failed',
} as const;

/** Sent on stdin as one JSON line. The prompt is NOT an argv value: it is the
 *  user's own text and argv is world-readable in the process list. */
export interface WorkerIn {
    readonly prompt: string;
    readonly rounds: number;
    readonly cdpUrl: string;
    /** `RunOptions.context`, over the wire. `{}` for the first turn. */
    readonly context: Record<string, string>;
}

export type WorkerOut =
    | { kind: typeof WorkerOutKind.roundStart; event: RoundStart }
    | { kind: typeof WorkerOutKind.settled; event: SettledInRound }
    | { kind: typeof WorkerOutKind.done; transcript: Transcript }
    | { kind: typeof WorkerOutKind.failed; message: string };
