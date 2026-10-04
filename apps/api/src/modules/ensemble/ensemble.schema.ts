import { z } from 'zod';
import { ensembleConfig } from '@/config';
import { ChatClientMessageType } from '@star/run-protocol/chat';

/** The longest question anyone may ask, in characters. The socket sizes its
 *  frame cap from this, so the two cannot drift. */
export const PROMPT_MAX = 8_000;

/**
 * Trimmed before the length check so a prompt of only whitespace is rejected
 * here rather than reaching the browser and being typed into three composers
 * as an empty message.
 */
const prompt = z.string().trim().min(1).max(PROMPT_MAX);

/**
 * A socket message, parsed here rather than by Elysia: the framework validates
 * bodies, and a socket has no body. An unparseable message answers with an
 * error — the one failure this module refuses to handle by ignoring, since a
 * silently dropped message is indistinguishable on the client from a server
 * that is merely slow.
 */
export const chatClientMessageSchema = z.object({
    type: z.literal(ChatClientMessageType.turnStart),
    prompt,
    /**
     * Clamped server-side; a client cannot ask for an hour of browser time.
     * Null means "whatever the server is configured for", which the handler
     * applies — the client has no business knowing the default.
     */
    rounds: z.number().int().min(0).max(ensembleConfig.maxRounds).nullable().default(null),
});

export const sessionCreateSchema = z.object({
    /**
     * Accepts a whole prompt, because that is what the client has when it
     * opens a conversation. Shortened to a title by the handler, so the rail
     * can never be handed eight thousand characters to render.
     */
    title: prompt,
});

export type SessionCreateBody = z.infer<typeof sessionCreateSchema>;

export const sessionListQuerySchema = z.object({
    /**
     * Coerced because a query string is always text. Clamped server-side for
     * the same reason `rounds` is: a listing is summaries, but ten thousand
     * summaries is still a page nobody asked for.
     */
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(ensembleConfig.maxHistoryLimit)
        .default(ensembleConfig.sessionLimit),
});

export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

export const runListQuerySchema = z.object({
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(ensembleConfig.maxHistoryLimit)
        .default(ensembleConfig.historyLimit),
});

export type RunListQuery = z.infer<typeof runListQuerySchema>;

/**
 * Whether a run's rounds come back with it — off by default, see
 * StoredRun.rounds. `stringbool`, not `coerce.boolean`, which reads 'false' as
 * true because it is a non-empty string.
 */
export const runDetailQuerySchema = z.object({
    rounds: z.stringbool().default(false),
});

export type RunDetailQuery = z.infer<typeof runDetailQuerySchema>;

/** Both a run id and a session id are uuids, and both are read the same way. */
export const idParamsSchema = z.object({ id: z.uuid() });

export type IdParams = z.infer<typeof idParamsSchema>;
