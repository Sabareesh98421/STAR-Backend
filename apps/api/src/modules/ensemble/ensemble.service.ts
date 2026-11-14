// ensemble.service.ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MODELS } from '@star/browser-ensemble';
import { WorkerOutKind } from '@star/browser-ensemble/types';
import { ensembleConfig } from '@/config';
import { logger } from '@/infrastructure/logger';
import { ensembleRunRepository } from '@/infrastructure/database';
import { TryCatch } from '@/shared/utils/try-catch';
import { AgentPhase, RunEventType, RunStatus } from '@star/run-protocol';
import { PHASE_FOR_ROUND, STATUS_FOR_ROUND, agentFor, toChatError } from './ensemble.events';
import { runInWorker } from './ensemble.worker';
import { conversationContext } from './ensemble.context';
import { outcome, toMarkdown, transcriptFileName } from './ensemble.transcript';
import type { ModelResult, RoundKind, Transcript } from '@star/browser-ensemble/types';
import type { ChatServerPayload } from '@star/run-protocol/chat';
import type { SaveRunInput } from '@/infrastructure/database';

/** The rendered transcript, as both the stored run and the client receive it. */
type RunFile = SaveRunInput['file'];

/** One turn: a question asked of one conversation. */
export interface TurnRequest {
    readonly sessionId: string;
    /** The user's own text. What the models receive also carries their history. */
    readonly prompt: string;
    /** Review+revise iterations after the draft. Already clamped by the caller. */
    readonly rounds: number;
}

/**
 * Where a turn's messages go.
 *
 * Injected rather than written to a socket here, which is what keeps this file
 * free of any transport: a spec passes a function that collects into an array
 * and asserts on the sequence with no server, no socket and no network. The
 * `seq` is deliberately NOT this file's to assign — see ChatServerPayload.
 */
export type Emit = (message: ChatServerPayload) => void;

/**
 * The only way in. The run reports its own failures as events — by the time
 * one happens the client is already streaming and there is no status code left
 * to use — so this resolver catches what the run itself could not: a defect in
 * the reporting, which would otherwise be a turn that silently stops.
 */
export function runTurnHandler(request: TurnRequest, emit: Emit): Promise<null> {
    return TryCatch.of(() => runTurn(request, emit)).onError((error) => {
        logger.error(error, 'Ensemble turn failed outside its own reporting');
        emit(toChatError(error));
        return null;
    });
}

async function runTurn(request: TurnRequest, emit: Emit): Promise<null> {
    const startedAt = new Date().toISOString();

    const send = (type: string, payload: Record<string, unknown>) =>
        emit({ type, ...payload } as ChatServerPayload);

    /**
     * Rebuilt from the event stream as it arrives, because the worker only
     * reports a full transcript when the run succeeds. A run costs minutes of
     * browser time and cannot be repeated identically, so a run that happened
     * and left no record is an experiment that has to be run again — and the
     * evidence most worth keeping is exactly the run where a model dropped out.
     */
    const partialRounds: {
        kind: RoundKind;
        iteration: number;
        at: string;
        responses: ModelResult[];
    }[] = [];

    // Both are read by the failure path below, so neither can live in the try.
    let transcript: Transcript | null = null;
    let context: Record<string, string> = {};

    try {
        send(RunEventType.started, {
            agents: MODELS.map(agentFor),
            prompt: request.prompt,
        });

        // Read before the run and not after: these are the turns this one is
        // continuing, and the turn being asked now must not be among them.
        context = conversationContext(
            await ensembleRunRepository.recentTurns(request.sessionId, ensembleConfig.contextTurns),
        );

        for await (const message of runInWorker({
            prompt: request.prompt,
            rounds: request.rounds,
            cdpUrl: ensembleConfig.cdpUrl,
            context,
        })) {
            if (message.kind === WorkerOutKind.roundStart) {
                const { kind, iteration, models } = message.event;
                partialRounds.push({
                    kind,
                    iteration,
                    at: new Date().toISOString(),
                    responses: [],
                });
                send(RunEventType.status, { status: STATUS_FOR_ROUND[kind] });
                // Everyone is working the moment the round starts; the phase a
                // model sits in is the round's own kind.
                const phase = PHASE_FOR_ROUND[kind];
                for (const model of models) {
                    send(RunEventType.agentPhase, { agentId: model, phase });
                }
            } else if (message.kind === WorkerOutKind.settled) {
                const { kind, iteration, result } = message.event;
                const round =
                    partialRounds.find((r) => r.kind === kind && r.iteration === iteration) ?? null;
                if (round) round.responses.push(result);
                send(RunEventType.agentResponse, {
                    agentId: result.model,
                    round: kind,
                    iteration,
                    text: result.text,
                    ok: result.ok,
                    error: result.error,
                });
                send(RunEventType.agentPhase, {
                    agentId: result.model,
                    phase: result.ok ? AgentPhase.done : AgentPhase.failed,
                });
            } else if (message.kind === WorkerOutKind.done) {
                transcript = message.transcript;
                // A second copy of every answer, now that the real one is here.
                partialRounds.length = 0;
            } else {
                // Thrown rather than sent straight through, so the one failure
                // path below handles worker failures and local ones identically.
                throw new Error(message.message);
            }
        }

        if (!transcript) throw new Error('the ensemble worker ended without a transcript');

        const file = render(transcript);
        await saveTranscript(transcript, file);
        await saveRun({ sessionId: request.sessionId, transcript, status: RunStatus.complete, file });

        send(RunEventType.file, file);
        send(RunEventType.status, { status: RunStatus.complete });
    } catch (error) {
        // A socket has no status code to fail with once a turn has started, so
        // this has to arrive as an event or the client waits forever on a run
        // that will never produce another message.
        logger.error(error, 'Ensemble run failed');

        // The answers this run did get are still evidence, and a failed run is
        // the most interesting kind to read back. The worker's own transcript
        // whenever there is one: a failure after the browser work finished still
        // produced every answer, and the events cannot reconstruct the prompts.
        const failed: Transcript = transcript ?? {
            question: request.prompt,
            startedAt,
            // Null, not now: this run never finished.
            finishedAt: null,
            models: MODELS,
            // `sent` is empty for these rounds. The worker reports the prompts
            // it sent only in its final transcript, which a failed run never
            // produced — so the alternative to an empty `sent` here is no
            // record of the round at all.
            rounds: partialRounds.map((r) => ({ ...r, sent: {} })),
            context,
            // No final answers: nothing was revised to completion, and
            // inventing one here would report a change that never happened as
            // the result of the experiment.
            final: {},
        };
        await saveRun({
            sessionId: request.sessionId,
            transcript: failed,
            status: RunStatus.failed,
            file: render(failed),
        });

        send(RunEventType.status, { status: RunStatus.failed });
    }

    return null;
}

/** The file a run opens as, rendered once and then stored, sent and written. */
const render = (transcript: Transcript): RunFile => ({
    name: transcriptFileName(transcript.startedAt),
    text: toMarkdown(transcript),
});

/**
 * Written in both shapes on purpose: the JSON matches what the CLI writes, so a
 * UI run and a CLI run are comparable; the markdown is what the editor opens.
 */
async function saveTranscript(transcript: Transcript, file: RunFile) {
    const dir = path.resolve(ensembleConfig.runsDir);

    await TryCatch.of(async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(
            path.join(dir, `${transcript.startedAt.replace(/[:.]/g, '-')}.json`),
            // The machine copy; the markdown beside it is the one a human reads.
            JSON.stringify(transcript),
        );
        await writeFile(path.join(dir, file.name), file.text);
        return null;
    }).onError((error) => {
        // A transcript we could not store is a loss, not a failed run: the
        // answers are already in hand and the caller still gets its file.
        // Resolving to null rather than NEXT is what keeps it non-fatal.
        logger.error(error, 'Could not persist ensemble transcript');
        return null;
    });
}

/**
 * Same bargain as the disk write above, for the same reason: by the time this
 * runs the answers are already in hand, and failing the run over a database
 * that is down would throw away minutes of real browser time that cannot be
 * reproduced. Logged and non-fatal — resolving to null rather than NEXT — but
 * never silent, because a history that quietly stops recording looks exactly
 * like a user who stopped running experiments.
 */
async function saveRun(input: Omit<SaveRunInput, 'answered' | 'changedModels'>) {
    // One implementation of what a run found, shared with the rendered markdown:
    // two would let the summary and the file disagree with no error on either.
    const { answered, changed } = outcome(input.transcript);

    await TryCatch.of(async () => {
        await ensembleRunRepository.save({ ...input, answered, changedModels: changed });
        return null;
    }).onError((error) => {
        logger.error(error, 'Could not record ensemble run in the database');
        return null;
    });
}
