import { z } from 'zod';
import { ensembleConfig } from '@/config';

export const ensembleRunSchema = z.object({
    /**
     * Trimmed before the length check so a prompt of only whitespace is
     * rejected here rather than reaching the browser and being typed into
     * three composers as an empty message.
     */
    prompt: z.string().trim().min(1).max(8000),
    /** Clamped server-side; a client cannot ask for an hour of browser time. */
    rounds: z.number().int().min(0).max(ensembleConfig.maxRounds).default(ensembleConfig.rounds),
});

export type EnsembleRunBody = z.infer<typeof ensembleRunSchema>;
