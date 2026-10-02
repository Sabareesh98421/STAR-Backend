// ensemble.mjs — the peer-review protocol over browser LLMs.
//
// Mirrors the round shape of ~/ensemblem/ensemble-spike/spike.ts (draft ->
// cross-review -> revise) so browser runs stay comparable with the API spike.
// This file is the protocol only; delivery and collection live in broadcast.mjs.
//
//   node ensemble.mjs "your question"
//   node ensemble.mjs --rounds 2 "your question"
//
// Each round runs in a FRESH chat per model. A tab is one conversation, so
// reusing it would let a reviewer see its own earlier draft in context — the
// cross-review would then be self-review and the result would not mean anything.
// Context is passed explicitly in the prompt instead, which is also what makes
// the transcript below a faithful record of what each model actually saw.

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { dispatch, TARGETS } from './broadcast.mjs';

// Transcripts belong to whoever ran the ensemble, not to this package — the
// CLI writes beside its own app, the API writes wherever it is configured to.
const RUNS_DIR = process.env.RUNS_DIR ?? path.join(process.cwd(), 'runs');

export const MODELS = TARGETS.map((t) => t.name);
const peersOf = (model) => MODELS.filter((m) => m !== model);

// Anonymised as "Answer A/B/C" rather than by vendor name: naming the model
// invites deference to a brand instead of judging the argument.
const label = (model, order) => `Answer ${String.fromCharCode(65 + order.indexOf(model))}`;

const block = (heading, body) => `--- ${heading} ---\n${body}`;

const textOf = (round, model) => round.find((r) => r.model === model)?.text ?? '';

function draftPrompt(question) {
    return `${question}\n\nAnswer directly and concisely. State any assumption you had to make.`;
}

// Cross-share: every model receives its PEERS' drafts, never its own.
function reviewPrompt(question, drafts, reviewer, order) {
    const peers = peersOf(reviewer)
        .map((p) => block(label(p, order), textOf(drafts, p)))
        .join('\n\n');
    return [
        `Question: ${question}`,
        '',
        `Below are answers from other models. Review each one.`,
        '',
        peers,
        '',
        'For each answer: name any factual error, reasoning gap, or missing assumption.',
        'Be specific and brief. Do not rewrite the answers — critique them.',
    ].join('\n');
}

// Revise: a model sees its own draft plus what the peers said about it, and the
// peers' drafts, then produces its best answer.
function revisePrompt(question, drafts, reviews, model, order) {
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

// One seam for every round's prompt construction, so the cross-share rule
// ("a model never sees its own draft in a review") is testable without a browser.
export function buildPrompts(kind, { question, drafts = [], reviews = [], order = MODELS }) {
    const build = {
        draft: () => draftPrompt(question),
        review: (m) => reviewPrompt(question, drafts, m, order),
        revise: (m) => revisePrompt(question, drafts, reviews, m, order),
    }[kind];
    if (!build) throw new Error(`unknown round kind: ${kind}`);
    return { kind, prompts: Object.fromEntries(order.map((m) => [m, build(m)])) };
}

// `onRound` fires as each round lands; `onSettled` fires per MODEL inside a
// round, tagged with which round it belongs to. A full run is minutes of waiting
// on real chat UIs, so a caller needs both: the round is the unit of evidence,
// the model is the unit of progress.
export async function run(question, { rounds = 1, opts = {}, onRound = null, onSettled = null, onRoundStart = null } = {}) {
    const order = [...MODELS];
    const transcript = {
        question,
        startedAt: new Date().toISOString(),
        models: order,
        rounds: [],
    };

    const record = (kind, iteration, prompts, responses) => {
        const round = {
            kind,
            iteration,
            at: new Date().toISOString(),
            // Keep the exact prompt each model saw — without it a disagreement
            // between rounds is impossible to diagnose after the fact.
            sent: Object.fromEntries(order.map((m) => [m, prompts[m]])),
            responses,
        };
        transcript.rounds.push(round);
        onRound?.(round);
        return responses;
    };

    // Everything each model has already said. Passed into every later round so a
    // stale render of an earlier answer can never be collected as a new one —
    // that failure is silent and corrupts the transcript rather than erroring.
    const seen = new Map(order.map((m) => [m, []]));

    // Every round: build the per-model prompts, deliver them simultaneously in
    // fresh chats, record what was sent alongside what came back.
    const step = async (kind, iteration, ctx) => {
        // Announced before any delivery: onSettled cannot serve this, since the
        // earliest it fires is when one model has already finished, by which
        // point "this round is running" is stale news.
        onRoundStart?.({ kind, iteration, models: order });
        const { prompts } = buildPrompts(kind, { question, order, ...ctx });
        const responses = await dispatch((m) => prompts[m], {
            ...opts,
            fresh: true,
            staleFor: (m) => seen.get(m) ?? [],
            onSettled: onSettled ? (result) => onSettled({ kind, iteration, result }) : null,
        });
        for (const r of responses) if (r.text) seen.get(r.model)?.push(r.text);
        return record(kind, iteration, prompts, responses);
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

if (import.meta.url === `file://${process.argv[1]}`) {
    const argv = process.argv.slice(2);
    const ri = argv.indexOf('--rounds');
    const rounds = ri === -1 ? 1 : Number(argv[ri + 1]);
    const question = (ri === -1 ? argv : [...argv.slice(0, ri), ...argv.slice(ri + 2)]).join(' ').trim();

    if (!question || !Number.isFinite(rounds) || rounds < 0) {
        console.error('usage: node ensemble.mjs [--rounds N] "your question"');
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

    await mkdir(RUNS_DIR, { recursive: true });
    const file = path.join(RUNS_DIR, `${transcript.startedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(file, JSON.stringify(transcript, null, 2));
    console.log(`\ntranscript: ${path.relative(process.cwd(), file)}`);
}
