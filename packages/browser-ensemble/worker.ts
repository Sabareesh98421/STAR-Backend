// worker.ts — runs one ensemble under Node, for a caller that cannot.
//
// Exists because Playwright's connectOverCDP hangs under Bun (see WorkerOutKind
// in types.ts for the measurement). The API is Bun/Elysia, so it spawns this
// and reads events back as NDJSON rather than driving the browser itself.
//
// Deliberately thin: it owns no policy, writes no files, and decides nothing.
// The run is still the package's, the transcript is still the caller's.
//
//   echo '{"prompt":"...","rounds":1,"cdpUrl":"<DEFAULT_CDP_URL>"}' | node worker.ts

import { run } from './ensemble.ts';
import { WorkerOutKind } from './types.ts';
import type { WorkerIn, WorkerOut } from './types.ts';

const emit = (message: WorkerOut): void => {
    process.stdout.write(`${JSON.stringify(message)}\n`);
};

async function readRequest(): Promise<WorkerIn> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as WorkerIn;
}

const request = await readRequest();

try {
    const transcript = await run(request.prompt, {
        rounds: request.rounds,
        context: request.context,
        opts: { cdpUrl: request.cdpUrl },
        onRoundStart: (event) => emit({ kind: WorkerOutKind.roundStart, event }),
        onSettled: (event) => emit({ kind: WorkerOutKind.settled, event }),
    });
    emit({ kind: WorkerOutKind.done, transcript });
} catch (error) {
    // Reported as a message, not just a non-zero exit: the parent needs the
    // reason to put in front of the user, and an exit code carries none.
    emit({ kind: WorkerOutKind.failed, message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
}
