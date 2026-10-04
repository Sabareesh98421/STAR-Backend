// Covers the framing only — the part of the worker boundary that can be wrong
// without a browser, a child process or a run.
//
// All three cases here produced the same symptom before they were handled: a
// run that had already collected its answers ended with nothing to show for
// minutes of real browser time.
import { test, expect } from '@playwright/test';
import { WorkerOutKind } from '@star/browser-ensemble/types';
import { framer } from './ensemble.worker';

const line = (kind: string) => `${JSON.stringify({ kind })}\n`;

test('an event split across chunks is yielded once, whole', () => {
    const frame = framer();
    const whole = line(WorkerOutKind.done);

    // A chunk boundary falls wherever the pipe decides, and the `done` event is
    // an entire transcript on one line.
    expect(frame(whole.slice(0, 7))).toEqual([]);
    expect(frame(whole.slice(7, 12))).toEqual([]);
    expect(frame(whole.slice(12))).toEqual([{ kind: WorkerOutKind.done }]);
});

test('several events in one chunk come back in order', () => {
    const frame = framer();
    expect(frame(line('a') + line('b') + line('c')).map((e) => e.kind)).toEqual(['a', 'b', 'c']);
});

test('a line that is not protocol is skipped, not thrown', () => {
    const frame = framer();
    // Anything in the child's dependency tree can write to stdout. This used to
    // throw out of the generator and end the run.
    const events = frame(`${line('a')}Debugger attached.\n{half an obj\n${line('b')}`);
    expect(events.map((e) => e.kind)).toEqual(['a', 'b']);
});

test('a last line with no newline is still an event', () => {
    const frame = framer();
    expect(frame('{"kind":"done"')).toEqual([]);
    // What the caller sends at end of stream.
    expect(frame('}\n')).toEqual([{ kind: 'done' }]);
});

test('blank lines carry nothing', () => {
    const frame = framer();
    expect(frame(`\n\n${line('a')}\n`).map((e) => e.kind)).toEqual(['a']);
});
