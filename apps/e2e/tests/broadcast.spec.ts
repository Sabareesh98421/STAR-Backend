// Covers the transport layer's reader — no browser, no network. `readWhenSettled`
// is where the harness decides a response is finished and is this round's, and
// both halves of that have silently been wrong before (see README). A fake
// locator feeding a scripted sequence of frames exercises it in milliseconds.
import { test, expect } from '@playwright/test';
import { readWhenSettled } from '@star/browser-ensemble/broadcast';
import type { Page } from 'playwright';

const target = { name: 'fake', response: '.response' };

// One frame per poll. `null` = no response element in the DOM yet; a function
// gets the poll index, for a response that never stops changing.
const fakePage = (frames: (string | null)[] | ((i: number) => string)) => {
    let i = -1;
    const at = () =>
        typeof frames === 'function' ? frames(i) : frames[Math.min(i, frames.length - 1)];
    return {
        waitForTimeout: async () => { i++; },
        locator: () => ({
            count: async () => (at() === null ? 0 : 1),
            last: () => ({ innerText: async () => at() ?? '' }),
        }),
    };
};

// settleMs 0 still requires two consecutive identical reads, which is the
// quiescence rule itself — it just drops the wall-clock wait.
// The fake implements only the three calls readWhenSettled makes, so the cast
// is the honest description of it rather than a gap in the types.
const asPage = (frames: Parameters<typeof fakePage>[0]) => fakePage(frames) as unknown as Page;

const read = (frames: Parameters<typeof fakePage>[0], stale: string[] = []) =>
    readWhenSettled(asPage(frames), target, { before: 0, stale, settleMs: 0, timeoutMs: 2000 });

test('returns the answer once its text stops changing', async () => {
    expect(await read([null, 'par', 'partial', 'partial answer', 'partial answer'])).toMatchObject({
        text: 'partial answer',
    });
});

// The re-hydration case: /new reports an empty thread, then the PREVIOUS
// conversation mounts as the first and only response element. Count says fresh,
// content says stale — this is the round-bleed the README describes.
test('skips a re-hydrated stale response and waits for the real answer', async () => {
    expect(await read([null, 'OLD', 'OLD', 'OLD', 'NEW', 'NEW'], ['OLD'])).toMatchObject({
        text: 'NEW',
    });
});

// Pins why the guard has to key off content: with the same frames and no stale
// list, the stale text settles and gets returned as this round's answer.
test('without the stale list the same frames yield last rounds answer', async () => {
    expect(await read([null, 'OLD', 'OLD', 'OLD', 'NEW', 'NEW'])).toMatchObject({ text: 'OLD' });
});

// A service error settles like a normal response, so it has to be flagged or it
// lands in the transcript as if the model had answered.
test('flags a provider error instead of accepting it as an answer', async () => {
    expect(await read(['Sorry, something went wrong.', 'Sorry, something went wrong.']))
        .toMatchObject({ providerError: true });
});

// The duplicate-line collapse still happens — it moved off the poll loop and on
// to the one reading that is returned, and a transcript that kept the repeat
// would carry it into every diff between rounds.
test('a settled answer has its repeated lines collapsed', async () => {
    expect(await read(['head\nhead\nbody', 'head\nhead\nbody'])).toMatchObject({
        text: 'head\nbody',
    });
});

test('a response that never settles times out', async () => {
    expect(await read((i) => `token ${i}`)).toMatchObject({ timedOut: true });
});

// Responses already on screen before the send must not be read back; only an
// element beyond `before` counts.
test('ignores responses that were present before the prompt was sent', async () => {
    const r = await readWhenSettled(asPage(['prior', 'prior']), target, {
        before: 1, settleMs: 0, timeoutMs: 300,
    });
    expect(r).toMatchObject({ text: '', timedOut: true });
});
