// ensemble.config.ts
import { envNumber } from './env.util';

export const ensembleConfig = {
    /** CDP endpoint of the shared logged-in browser (`bun run dev:cdp`). */
    cdpUrl: process.env.ENSEMBLE_CDP_URL ?? 'http://localhost:9222',
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
};
