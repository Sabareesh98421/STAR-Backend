// ensemble.config.ts
import { DEFAULT_CDP_URL } from '@star/browser-ensemble/types';
import { envNumber } from './env.util';

export const ensembleConfig = {
    /**
     * CDP endpoint of the shared logged-in browser. Nothing has to be running
     * on it: `@star/browser-ensemble/chrome` starts Chrome here if the port is
     * silent, and reuses whatever is already there if it is not (`bun run
     * browser` for the recorder build).
     */
    cdpUrl: process.env.ENSEMBLE_CDP_URL ?? DEFAULT_CDP_URL,
    /**
     * Review+revise iterations after the initial draft. One round is already
     * three sequential waits on the slowest of three real chat UIs, so this is
     * minutes per increment, not seconds.
     */
    rounds: envNumber(process.env.ENSEMBLE_ROUNDS, 1),
    /** Hard ceiling on what a request may ask for, whatever the client sends. */
    maxRounds: envNumber(process.env.ENSEMBLE_MAX_ROUNDS, 3),
    /**
     * Where transcripts land. Same shape the CLI writes, so a UI run and a CLI
     * run can be read side by side — the whole point of keeping transcripts.
     */
    runsDir: process.env.ENSEMBLE_RUNS_DIR ?? 'runs',
    /**
     * How many earlier turns of a conversation are fed back into the next one.
     *
     * Capped because context is not free here the way it is against an API:
     * every round pastes the whole prompt into a real chat composer, so an
     * uncapped conversation eventually types tens of thousands of characters
     * into three browser tabs and fails in ways that look like the models
     * refusing to answer.
     */
    contextTurns: envNumber(process.env.ENSEMBLE_CONTEXT_TURNS, 4),
    /** How many sessions a history listing returns when asked for none. */
    sessionLimit: envNumber(process.env.ENSEMBLE_SESSION_LIMIT, 30),
    /** How many run summaries a history listing returns when asked for none. */
    historyLimit: envNumber(process.env.ENSEMBLE_HISTORY_LIMIT, 20),
    /** Hard ceiling, so a client cannot ask for every run ever recorded. */
    maxHistoryLimit: envNumber(process.env.ENSEMBLE_MAX_HISTORY_LIMIT, 100),
};
