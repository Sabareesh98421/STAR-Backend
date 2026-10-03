// ensemble.service.ts
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
// @ts-expect-error — .mjs engine module, no types
import { run as runRounds, MODELS } from '@star/browser-ensemble';
import { ensembleConfig } from '@/config';
import { logger } from '@/infrastructure/logger';
import { ConflictError } from '@/shared/errors';
import { toResponse } from '@/shared/http/resolveAppError';
import { TryCatch } from '@/shared/utils/try-catch';
import {
    AgentPhase,
    RunEventType,
    RunStatus,
    STATUS_FOR_ROUND,
    agentFor,
} from './ensemble.events';
import { toMarkdown, transcriptFileName, type Transcript } from './ensemble.transcript';
import type { EnsembleRunBody } from './ensemble.schema';

export function runEnsembleHandler(body: EnsembleRunBody) {
    return TryCatch.of(() => runEnsemble(body)).onError(toResponse);
}

/**
 * One shared browser means one run. A second run would type into the same three
 * composers as the first and both transcripts would be worthless — so this is
 * refused up front rather than queued, because a queued run that starts eight
 * minutes later is not what the caller asked for either.
 */
let inFlight = false;

const SSE_HEADERS = {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
};

async function runEnsemble(body: EnsembleRunBody) {
    if (inFlight) {
        throw new ConflictError('An ensemble run is already in progress on the shared browser');
    }
    inFlight = true;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let seq = 0;
            // Every event the client sees goes through here, so the seq is
            // genuinely monotonic and a reconnect can resume from the last one.
            const send = (type: string, payload: Record<string, unknown>) => {
                const event = { seq: ++seq, type, ...payload };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            try {
                send(RunEventType.started, {
                    agents: MODELS.map(agentFor),
                    prompt: body.prompt,
                });

                const transcript: Transcript = await runRounds(body.prompt, {
                    rounds: body.rounds,
                    opts: { cdpUrl: ensembleConfig.cdpUrl },

                    onRoundStart: ({ kind, models }: { kind: string; models: string[] }) => {
                        send(RunEventType.status, { status: STATUS_FOR_ROUND[kind] ?? RunStatus.responding });
                        // Everyone is working the moment the round starts; the
                        // phase a model sits in is the round's own kind.
                        const phase = kind === 'review' ? AgentPhase.reviewing : AgentPhase.responding;
                        for (const model of models) {
                            send(RunEventType.agentPhase, { agentId: model, phase });
                        }
                    },

                    onSettled: ({ kind, iteration, result }: {
                        kind: string;
                        iteration: number;
                        result: { model: string; ok: boolean; text: string; error?: string | null };
                    }) => {
                        send(RunEventType.agentResponse, {
                            agentId: result.model,
                            round: kind,
                            iteration,
                            text: result.text,
                            ok: result.ok,
                            error: result.error ?? null,
                        });
                        send(RunEventType.agentPhase, {
                            agentId: result.model,
                            phase: result.ok ? AgentPhase.done : AgentPhase.failed,
                        });
                    },
                });

                const file = await saveTranscript(transcript);
                send(RunEventType.file, file);
                send(RunEventType.status, { status: RunStatus.complete });
            } catch (error) {
                // Headers are long gone by now, so a failure cannot be an HTTP
                // status. It has to arrive as an event or the client waits
                // forever on a stream that will never produce another byte.
                logger.error(error, 'Ensemble run failed');
                send(RunEventType.status, { status: RunStatus.failed });
            } finally {
                // Releasing here and not after a successful run: a run that
                // threw would otherwise wedge the endpoint until a restart.
                inFlight = false;
                controller.close();
            }
        },

        // The client navigating away or hitting cancel lands here. The browser
        // rounds keep going to completion — they are mid-conversation in three
        // real chat tabs and there is nothing safe to interrupt — but the lock
        // must not be held by a stream nobody is reading.
        cancel() {
            inFlight = false;
        },
    });

    return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * Written in both shapes on purpose: the JSON matches what the CLI writes, so a
 * UI run and a CLI run are comparable; the markdown is what the editor opens.
 */
async function saveTranscript(transcript: Transcript) {
    const dir = path.resolve(ensembleConfig.runsDir);
    const name = transcriptFileName(transcript.startedAt);
    const text = toMarkdown(transcript);

    await TryCatch.of(async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, `${transcript.startedAt.replace(/[:.]/g, '-')}.json`),
            JSON.stringify(transcript, null, 2));
        await writeFile(path.join(dir, name), text);
    }).onError((error) => {
        // A transcript we could not store is a loss, not a failed run: the
        // answers are already in hand and the caller still gets its file.
        logger.error(error, 'Could not persist ensemble transcript');
        return undefined;
    });

    return { name, text };
}
