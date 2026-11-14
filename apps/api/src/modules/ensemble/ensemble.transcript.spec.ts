// Covers the file a finished run opens in the editor. Pure rendering, no
// browser: the question this answers — did peer review change any answer — is
// the whole point of the harness, so getting it wrong misreports the result.
import { test, expect } from '@playwright/test';
import { toMarkdown, transcriptFileName } from './ensemble.transcript';
import type { ModelResult, Transcript } from '@star/browser-ensemble/types';

const result = (model: string, text: string, ok = true): ModelResult => ({
    model,
    ok,
    text,
    ms: 10,
    attempts: 1,
    url: null,
    error: ok ? null : 'timed out waiting for response',
});

const transcript = (over: Partial<Transcript> = {}): Transcript => ({
    question: 'why is evict slow?',
    startedAt: '2026-10-02T12:00:00.000Z',
    finishedAt: '2026-10-02T12:04:00.000Z',
    models: ['chatgpt', 'claude', 'gemini'],
    // A first turn: no earlier conversation to put in front of the prompts.
    context: {},
    rounds: [
        {
            kind: 'draft',
            iteration: 0,
            at: '2026-10-02T12:01:00.000Z',
            sent: { chatgpt: 'Q', claude: 'Q', gemini: 'Q' },
            responses: [result('chatgpt', 'DRAFT_CG'), result('claude', 'DRAFT_CL'), result('gemini', 'DRAFT_GM')],
        },
    ],
    final: { chatgpt: 'FINAL_CG', claude: 'DRAFT_CL', gemini: 'FINAL_GM' },
    ...over,
});

test('names which models changed their answer after review', () => {
    // claude's final matches its draft, so it did not move. Stating this is the
    // experiment's result; leaving the reader to diff three answers by eye is
    // how a null result gets mistaken for a positive one.
    const md = toMarkdown(transcript());
    expect(md).toContain('changed after review: chatgpt, gemini');
    expect(md).toContain('models answered: 3 of 3');
});

test('reports no change rather than omitting the line', () => {
    const t = transcript({ final: { chatgpt: 'DRAFT_CG', claude: 'DRAFT_CL', gemini: 'DRAFT_GM' } });
    expect(toMarkdown(t)).toContain('changed after review: none');
});

test('a failed model is written down as a failure, not as an empty answer', () => {
    const base = transcript();
    const draft = base.rounds[0]!;
    const t: Transcript = {
        ...base,
        rounds: [{ ...draft, responses: [result('chatgpt', 'DRAFT_CG'), result('claude', '', false)] }],
    };
    const md = toMarkdown(t);

    // Two models agreeing and three models agreeing are different evidence. A
    // blank section silently turns one into the other.
    expect(md).toContain('timed out waiting for response');
    expect(md).toContain('models answered: 1 of 3');
});

test('every round is rendered under its own heading, in order', () => {
    const t = transcript();
    t.rounds.push({
        kind: 'review',
        iteration: 1,
        at: '2026-10-02T12:02:00.000Z',
        sent: { chatgpt: 'R', claude: 'R', gemini: 'R' },
        responses: [result('chatgpt', 'REVIEW_CG')],
    });
    const md = toMarkdown(t);
    expect(md.indexOf('## Draft')).toBeGreaterThanOrEqual(0);
    expect(md.indexOf('## Cross-review 1')).toBeGreaterThan(md.indexOf('## Draft'));
});

test('the file name is filesystem-safe and sorts chronologically', () => {
    const name = transcriptFileName('2026-10-02T12:00:00.000Z');
    expect(name).toBe('run-2026-10-02T12-00-00-000Z.md');
    expect(name).not.toMatch(/[:]/);
});
