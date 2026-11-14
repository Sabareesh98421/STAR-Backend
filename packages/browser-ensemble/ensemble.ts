// ensemble.ts — the peer-review protocol over browser LLMs.
//
// Mirrors the round shape of the API spike (draft -> cross-review -> revise) so
// browser runs stay comparable with it. This file is the protocol only;
// delivery and collection live in broadcast.ts.
//
// Each round runs in a FRESH chat per model. A tab is one conversation, so
// reusing it would let a reviewer see its own earlier draft in context — the
// cross-review would then be self-review and the result would not mean anything.
// Context is passed explicitly in the prompt instead, which is also what makes
// the transcript a faithful record of what each model actually saw.

import { dispatch, TARGETS } from './broadcast.ts';
import type {
    ModelResult,
    Round,
    RoundKind,
    RunOptions,
    Transcript,
} from './types.ts';

export const MODELS: readonly string[] = TARGETS.map((t) => t.name);

const peersOf = (model: string): readonly string[] => MODELS.filter((m) => m !== model);

// Anonymised as "Answer A/B/C" rather than by vendor name: naming the model
// invites deference to a brand instead of judging the argument.
const label = (model: string, order: readonly string[]): string =>
    `Answer ${String.fromCharCode(65 + order.indexOf(model))}`;

const block = (heading: string, body: string): string => `--- ${heading} ---\n${body}`;

/** Absent text is '' and never undefined: a missing answer is an empty one. */
const textOf = (round: readonly ModelResult[], model: string): string =>
    round.find((r) => r.model === model)?.text ?? '';

function draftPrompt(question: string): string {
    return `${question}\n\nAnswer directly and concisely. State any assumption you had to make.`;
}

// Cross-share: every model receives its PEERS' drafts, never its own.
function reviewPrompt(
    question: string,
    drafts: readonly ModelResult[],
    reviewer: string,
    order: readonly string[],
): string {
    const peers = peersOf(reviewer)
        .map((p) => block(label(p, order), textOf(drafts, p)))
        .join('\n\n');
    return [
        `Question: ${question}`,
        '',
        'Below are answers from other models. Review each one.',
        '',
        peers,
        '',
        'For each answer: name any factual error, reasoning gap, or missing assumption.',
        'Be specific and brief. Do not rewrite the answers — critique them.',
    ].join('\n');
}

// Revise: a model sees its own draft plus what the peers said about it, and the
// peers' drafts, then produces its best answer.
function revisePrompt(
    question: string,
    drafts: readonly ModelResult[],
    reviews: readonly ModelResult[],
    model: string,
    order: readonly string[],
): string {
    const critiques = peersOf(model)
        .map((p) => block(`Review by ${label(p, order)}`, textOf(reviews, p)))
        .join('\n\n');
    const peerDrafts = peersOf(model)
        .map((p) => block(label(p, order), textOf(drafts, p)))
        .join('\n\n');
    return [
        `Question: ${question}`,
        '',
        block('Your previous answer', textOf(drafts, model)),
        '',
        block('Other answers', peerDrafts),
        '',
        critiques,
        '',
        'Weigh the critiques. Correct what is wrong, keep what is right, and give your best final answer.',
        'If a critique is mistaken, say so and explain why rather than conceding.',
    ].join('\n');
}

interface PromptContext {
    question: string;
    drafts: readonly ModelResult[];
    reviews: readonly ModelResult[];
    order: readonly string[];
    /**
     * Earlier turns of the same conversation, per model, keyed by model name.
     *
     * Per model and not one shared blob: a model continuing a conversation must
     * see its OWN previous answers and no peer's, which is the same rule the
     * cross-review follows. Handed a peer's history it would read as a model
     * that revised its position, when it is a model reading someone else's
     * conversation.
     *
     * Every round opens a fresh chat, so this is the only way context reaches
     * the model at all — a second turn carries its history in the prompt or
     * it carries none.
     */
    context: Record<string, string>;
}

/**
 * One seam for every round's prompt construction, so the cross-share rule
 * ("a model never sees its own draft in a review") is testable without a
 * browser — which is the only rule here that, if broken, still produces a
 * plausible-looking transcript.
 */
export function buildPrompts(
    kind: RoundKind,
    ctx: Partial<PromptContext> & Pick<PromptContext, 'question'>,
): { kind: RoundKind; prompts: Record<string, string> } {
    const { question, drafts = [], reviews = [], order = MODELS, context = {} } = ctx;
    const build: Record<RoundKind, (model: string) => string> = {
        draft: () => draftPrompt(question),
        review: (m) => reviewPrompt(question, drafts, m, order),
        revise: (m) => revisePrompt(question, drafts, reviews, m, order),
    };
    const make = build[kind];
    if (!make) throw new Error(`unknown round kind: ${kind}`);
    // An absent history prepends nothing at all, rather than an empty block: a
    // heading with no body tells the model a conversation happened and then
    // withholds it, which is worse than the first turn's plain prompt.
    const withContext = (model: string): string => {
        const prior = context[model] ?? '';
        return prior ? `${block('Conversation so far', prior)}\n\n${make(model)}` : make(model);
    };
    return { kind, prompts: Object.fromEntries(order.map((m) => [m, withContext(m)])) };
}

/**
 * `onRound` fires as each round lands; `onSettled` fires per MODEL inside a
 * round, tagged with which round it belongs to; `onRoundStart` fires before a
 * round's prompts are delivered. A full run is minutes of waiting on real chat
 * UIs, so a caller needs all three: the round is the unit of evidence, the
 * model is the unit of progress, and the start is the only one of the three
 * that arrives before anything is already finished.
 */
export async function run(question: string, options: Partial<RunOptions> = {}): Promise<Transcript> {
    const {
        rounds = 1,
        opts = {},
        context = {},
        onRound = null,
        onSettled = null,
        onRoundStart = null,
        deliver = null,
    } = options;
    const send = deliver ?? dispatch;
    const order = [...MODELS];
    const transcript: Transcript = {
        question,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        models: order,
        rounds: [],
        context,
        final: {},
    };

    const record = (
        kind: RoundKind,
        iteration: number,
        prompts: Record<string, string>,
        responses: readonly ModelResult[],
    ): readonly ModelResult[] => {
        const round: Round = {
            kind,
            iteration,
            at: new Date().toISOString(),
            sent: Object.fromEntries(order.map((m) => [m, prompts[m] ?? ''])),
            responses,
        };
        transcript.rounds.push(round);
        onRound?.(round);
        return responses;
    };

    // Everything each model has already said. Passed into every later round so a
    // stale render of an earlier answer can never be collected as a new one —
    // that failure is silent and corrupts the transcript rather than erroring.
    const seen = new Map<string, string[]>(order.map((m) => [m, []]));

    // Every round: build the per-model prompts, deliver them simultaneously in
    // fresh chats, record what was sent alongside what came back.
    const step = async (
        kind: RoundKind,
        iteration: number,
        ctx: Partial<PromptContext>,
    ): Promise<readonly ModelResult[]> => {
        // Announced before any delivery: onSettled cannot serve this, since the
        // earliest it fires is when one model has already finished, by which
        // point "this round is running" is stale news.
        onRoundStart?.({ kind, iteration, models: order });

        // Two builds, and the difference between them is the point: the context
        // is delivered to the models and recorded once on the run, never per
        // round. Do not "simplify" this by passing `context` to both.
        const { prompts: delivered } = buildPrompts(kind, { question, order, context, ...ctx });
        const { prompts: recorded } = buildPrompts(kind, { question, order, ...ctx });

        const responses = await send((m) => delivered[m] ?? '', {
            ...opts,
            fresh: true,
            staleFor: (m) => seen.get(m) ?? [],
            onSettled: onSettled ? (result) => onSettled({ kind, iteration, result }) : null,
        });
        for (const r of responses) if (r.text) seen.get(r.model)?.push(r.text);
        return record(kind, iteration, recorded, responses);
    };

    // Round 0 — the broadcast. Everyone gets the same question, at the same time.
    let drafts = await step('draft', 0, {});

    for (let i = 1; i <= rounds; i++) {
        const reviews = await step('review', i, { drafts });
        drafts = await step('revise', i, { drafts, reviews });
    }

    transcript.finishedAt = new Date().toISOString();
    transcript.final = Object.fromEntries(order.map((m) => [m, textOf(drafts, m)]));
    return transcript;
}

// CLI: bun run ensemble.ts [--rounds N] "your question"
//
// Transcripts belong to whoever ran the ensemble, not to this package — the CLI
// writes beside where it was invoked, the API writes wherever it is configured.
if (import.meta.main) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    const argv = process.argv.slice(2);
    const ri = argv.indexOf('--rounds');
    const rounds = ri === -1 ? 1 : Number(argv[ri + 1]);
    const question = (ri === -1 ? argv : [...argv.slice(0, ri), ...argv.slice(ri + 2)]).join(' ').trim();

    if (!question || !Number.isFinite(rounds) || rounds < 0) {
        console.error('usage: bun run ensemble.ts [--rounds N] "your question"');
        process.exit(1);
    }

    const transcript = await run(question, {
        rounds,
        onRound: (r) => {
            console.log(`\n${'='.repeat(60)}\n${r.kind.toUpperCase()}  (round ${r.iteration})\n${'='.repeat(60)}`);
            for (const res of r.responses) {
                console.log(`\n${res.ok ? '✓' : '✘'} ${res.model}${res.error ? ' — ' + res.error : ` (${res.ms}ms)`}`);
                if (res.text) console.log('  ' + res.text.replace(/\n/g, '\n  ').slice(0, 600));
            }
        },
    });

    const runsDir = process.env.RUNS_DIR ?? path.join(process.cwd(), 'runs');
    await mkdir(runsDir, { recursive: true });
    const file = path.join(runsDir, `${transcript.startedAt.replace(/[:.]/g, '-')}.json`);
    // Not pretty-printed, matching what the API writes: this is the machine
    // copy of a run, and the two have to stay comparable.
    await writeFile(file, JSON.stringify(transcript));
    console.log(`\ntranscript: ${path.relative(process.cwd(), file)}`);
}
