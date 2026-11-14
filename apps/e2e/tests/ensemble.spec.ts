// Covers the cross-share wiring only — no browser, no network. The rule that
// actually matters for peer review is that a model never reviews its own draft;
// that is pure prompt-construction, so it is checkable without burning a run.
import { test, expect } from '@playwright/test';
import { buildPrompts, MODELS, run } from '@star/browser-ensemble';
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

// Continuing a conversation: every round opens a fresh chat, so a second turn
// carries its history in the prompt or it carries none at all. The failure is
// invisible — the models answer the new question well, in isolation, and only a
// follow-up that depends on the first turn exposes it.
test('a model continuing a conversation is given its own history and no peer\'s', () => {
    const context = Object.fromEntries(MODELS.map((m: string) => [m, `PRIOR_${m.toUpperCase()}`]));
    const { prompts } = buildPrompts('draft', { question: 'Q?', context });

    for (const model of MODELS) {
        expect(prompts[model]).toContain(`PRIOR_${model.toUpperCase()}`);
        for (const peer of MODELS.filter((m: string) => m !== model)) {
            expect(prompts[model]).not.toContain(`PRIOR_${peer.toUpperCase()}`);
        }
    }
});

test('history reaches the review and revise rounds too, not only the draft', () => {
    const drafts = draftsOf((m) => `DRAFT_${m.toUpperCase()}`);
    const reviews = draftsOf((m) => `REVIEW_BY_${m.toUpperCase()}`);
    const context = Object.fromEntries(MODELS.map((m: string) => [m, `PRIOR_${m.toUpperCase()}`]));

    for (const kind of ['review', 'revise'] as const) {
        const { prompts } = buildPrompts(kind, { question: 'Q?', drafts, reviews, context });
        for (const model of MODELS) {
            expect(prompts[model]).toContain(`PRIOR_${model.toUpperCase()}`);
        }
    }
});

test('a first turn gets no history block at all, not an empty one', () => {
    const { prompts } = buildPrompts('draft', { question: 'Q?' });
    // A heading with no body tells the model a conversation happened and then
    // withholds it, which is worse than the plain prompt it should be getting.
    for (const model of MODELS) {
        expect(prompts[model]).not.toContain('Conversation so far');
    }
});

// A whole run, delivered by a stand-in instead of three browser tabs.
//
// What is under test is the difference between what a round DELIVERS and what it
// RECORDS: the models are given the conversation context, the transcript stores
// the round without it and keeps the context once for the run. Getting that
// backwards is the kind of failure this project keeps warning about — the models
// answer a follow-up perfectly, in isolation, never having been told there was a
// conversation, and nothing errors.
test('a run delivers the context to the models and records it once, not per round', async () => {
    const context = Object.fromEntries(MODELS.map((m: string) => [m, `PRIOR_${m.toUpperCase()}`]));
    const delivered: string[] = [];

    const transcript = await run('Q?', {
        rounds: 1,
        context,
        deliver: async (promptFor) => {
            for (const m of MODELS) delivered.push(promptFor(m));
            return MODELS.map((m: string) => ({
                model: m,
                ok: true,
                text: `ANSWER_${m.toUpperCase()}`,
                ms: 1,
                attempts: 1,
                url: null,
                error: null,
            }));
        },
    });

    // draft, review, revise — three rounds, every one of them delivered with the
    // asking model's own history in front of it.
    expect(transcript.rounds.map((r) => r.kind)).toEqual(['draft', 'review', 'revise']);
    expect(delivered).toHaveLength(MODELS.length * 3);
    for (const model of MODELS) {
        const mine = delivered.filter((p) => p.includes(`PRIOR_${model.toUpperCase()}`));
        expect(mine).toHaveLength(3);
    }

    // Once on the run.
    expect(transcript.context).toEqual(context);
    // And nowhere in the rounds. Stored per round this was one copy per model
    // per round — nine copies of the previous turns' answers for one turn, which
    // was most of the bytes a stored run weighed.
    for (const round of transcript.rounds) {
        expect(JSON.stringify(round.sent)).not.toContain('PRIOR_');
        // The round's own prompt is still there in full: without it a
        // disagreement between rounds cannot be diagnosed after the fact.
        expect(round.sent[MODELS[0]!]).toContain('Q?');
    }
});

// Guards the UI artifact where a response element renders its first line twice
// (heading node + body); innerText returns both and it lands in the transcript.
test('collapseRepeats drops consecutive duplicate lines, keeps real content', () => {
    expect(collapseRepeats('Weighing it.\nWeighing it.\n\nThe answer.')).toBe('Weighing it.\n\nThe answer.');
    expect(collapseRepeats('a\nb\na')).toBe('a\nb\na');
    expect(collapseRepeats('x\n\n\ny')).toBe('x\n\n\ny');
});
