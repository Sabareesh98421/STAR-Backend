// Covers the cross-share wiring only — no browser, no network. The rule that
// actually matters for peer review is that a model never reviews its own draft;
// that is pure prompt-construction, so it is checkable without burning a run.
import { test, expect } from '@playwright/test';
// @ts-expect-error — .mjs protocol module, no types
import { buildPrompts, MODELS } from '@star/browser-ensemble';
// @ts-expect-error — .mjs transport module, no types
import { collapseRepeats } from '@star/browser-ensemble/broadcast';

const draftsOf = (text: (m: string) => string) =>
    MODELS.map((m: string) => ({ model: m, ok: true, text: text(m) }));

test('draft round sends every model the same question', () => {
    const { prompts } = buildPrompts('draft', { question: 'Q?' });
    const sent = MODELS.map((m: string) => prompts[m]);
    expect(new Set(sent).size).toBe(1);
    expect(sent[0]).toContain('Q?');
});

test('review round gives each model its peers drafts and never its own', () => {
    const drafts = draftsOf((m) => `DRAFT_${m.toUpperCase()}`);
    const { prompts } = buildPrompts('review', { question: 'Q?', drafts });

    for (const model of MODELS) {
        expect(prompts[model]).not.toContain(`DRAFT_${model.toUpperCase()}`);
        for (const peer of MODELS.filter((m: string) => m !== model)) {
            expect(prompts[model]).toContain(`DRAFT_${peer.toUpperCase()}`);
        }
    }
});

test('revise round shows a model its own draft plus peer critiques', () => {
    const drafts = draftsOf((m) => `DRAFT_${m.toUpperCase()}`);
    const reviews = draftsOf((m) => `REVIEW_BY_${m.toUpperCase()}`);
    const { prompts } = buildPrompts('revise', { question: 'Q?', drafts, reviews });

    for (const model of MODELS) {
        expect(prompts[model]).toContain(`DRAFT_${model.toUpperCase()}`);
        expect(prompts[model]).not.toContain(`REVIEW_BY_${model.toUpperCase()}`);
        for (const peer of MODELS.filter((m: string) => m !== model)) {
            expect(prompts[model]).toContain(`REVIEW_BY_${peer.toUpperCase()}`);
        }
    }
});

test('models are anonymised as Answer A/B/C, not named by vendor', () => {
    const drafts = draftsOf((m) => `DRAFT_${m.toUpperCase()}`);
    const { prompts } = buildPrompts('review', { question: 'Q?', drafts });
    for (const model of MODELS) {
        for (const peer of MODELS.filter((m: string) => m !== model)) {
            expect(prompts[model]).not.toContain(peer);
        }
    }
});

// Guards the UI artifact where a response element renders its first line twice
// (heading node + body); innerText returns both and it lands in the transcript.
test('collapseRepeats drops consecutive duplicate lines, keeps real content', () => {
    expect(collapseRepeats('Weighing it.\nWeighing it.\n\nThe answer.')).toBe('Weighing it.\n\nThe answer.');
    expect(collapseRepeats('a\nb\na')).toBe('a\nb\na');
    expect(collapseRepeats('x\n\n\ny')).toBe('x\n\n\ny');
});
