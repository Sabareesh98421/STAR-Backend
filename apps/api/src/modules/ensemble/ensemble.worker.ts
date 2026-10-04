/**
 * Runs the ensemble in a Node child process and yields its events.
 *
 * Not a preference: Playwright's connectOverCDP hangs under Bun and connects in
 * ~100ms under Node (measured both ways), and this API is Bun/Elysia. So the
 * browser work happens in `@star/browser-ensemble/worker` and arrives here as
 * NDJSON. The boundary is this file; nothing else in the module knows there is
 * a subprocess at all.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { WorkerOutKind } from '@star/browser-ensemble/types';
import { logger } from '@/infrastructure/logger';
import type { WorkerIn, WorkerOut } from '@star/browser-ensemble/types';

/**
 * Resolved through the package's own export map rather than a relative path, so
 * it keeps working regardless of where this app is run from or how the
 * workspace is laid out on disk.
 */
const workerPath = createRequire(import.meta.url).resolve('@star/browser-ensemble/worker');

/** Enough of a bad line to recognise it. The longest thing the child writes is
 *  a transcript, and logs are not where that goes. */
const LINE_LOG_MAX = 200;

/** How much of the child's stderr is kept to explain a failure with. */
const STDERR_TAIL_MAX = 8_000;

/**
 * One line of the protocol, or null if the line is not ours.
 *
 * The child shares stdout with anything in its dependency tree that decides to
 * print, and a run that throws here has already spent its browser time.
 */
const parseEvent = (line: string): WorkerOut | null => {
    try {
        return JSON.parse(line) as WorkerOut;
    } catch {
        logger.warn(
            { line: line.slice(0, LINE_LOG_MAX) },
            'Ignored a line on the ensemble worker’s stdout that is not protocol',
        );
        return null;
    }
};

/**
 * Turns a stream of arbitrary chunks into whole protocol events.
 *
 * Stateful, because a chunk boundary falls wherever the pipe decides and the
 * `done` event is a whole transcript on one line. Splitting only once a newline
 * has arrived is what keeps that line from being re-copied per chunk.
 */
export function framer(): (chunk: string) => WorkerOut[] {
    let buffer = '';

    return (chunk: string): WorkerOut[] => {
        buffer += chunk;
        if (!buffer.includes('\n')) return [];

        const lines = buffer.split('\n');
        // A partial line, or ''. Kept either way so the next chunk completes it.
        buffer = lines.pop() ?? '';

        const events: WorkerOut[] = [];
        for (const line of lines) {
            if (!line.trim()) continue;
            const event = parseEvent(line);
            if (event) events.push(event);
        }
        return events;
    };
}

/**
 * Yields every event the run produces, in order, and ends when the child does.
 *
 * An async generator rather than callbacks: the caller drives a turn and
 * decides what to do with each event, and a reader that stops reading should
 * stop the iteration rather than pile events up in memory.
 */
export async function* runInWorker(request: WorkerIn): AsyncGenerator<WorkerOut> {
    const child = spawn('node', [workerPath], {
        // The prompt goes over stdin, never argv — argv is readable by any
        // process on the machine, and the prompt is the user's own text.
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // The tail, not the lot: Node plus Playwright plus Chrome over CDP, for
    // minutes. What a failure says is at the end of it.
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL_MAX);
    });

    child.stdin.end(JSON.stringify(request));

    const frame = framer();
    child.stdout.setEncoding('utf8');

    try {
        for await (const chunk of child.stdout) {
            for (const event of frame(chunk as string)) yield event;
        }
        // A last line that never got its newline is still an event.
        for (const event of frame('\n')) yield event;

        // A child that died without reporting a reason would otherwise look to
        // the caller like a run that simply produced nothing.
        const code = await new Promise<number>((resolve) => child.on('close', resolve));
        if (code !== 0) {
            yield {
                kind: WorkerOutKind.failed,
                message: stderr.trim() || `ensemble worker exited with code ${code}`,
            };
        }
    } finally {
        // Reached when the caller stops iterating early. The browser rounds in
        // the child cannot be safely interrupted mid-conversation, so the child
        // is left to finish; only our pipes are let go.
        child.stdout.destroy();
        child.stderr.destroy();
    }
}
