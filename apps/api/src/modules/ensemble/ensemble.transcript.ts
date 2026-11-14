/**
 * Renders a run transcript as the file the editor opens.
 *
 * Pure and separate from the service so it can be read back against a stored
 * transcript without a browser or a run. Markdown rather than JSON because a
 * human reads this to judge whether peer review changed any answer — which is
 * the only question the whole harness exists to answer.
 */

import type { ModelResult, Round, Transcript } from '@star/browser-ensemble/types';

export type { Transcript };

const HEADING_FOR_ROUND: Record<string, string> = {
    draft: 'Draft',
    review: 'Cross-review',
    revise: 'Revised',
};

/**
 * A failed model is written down as a failure, never as an empty answer. Three
 * models agreeing and two models agreeing are different evidence, and a blank
 * section silently turns one into the other.
 */
function answer(r: ModelResult): string {
    if (r.ok && r.text) return r.text;
    return `_no answer — ${r.error ?? 'unknown failure'}_`;
}

function roundSection(round: Round): string[] {
    const heading = HEADING_FOR_ROUND[round.kind] ?? round.kind;
    const title = round.iteration > 0 ? `${heading} ${round.iteration}` : heading;
    return [
        `## ${title}`,
        '',
        ...round.responses.flatMap((r) => [`### ${r.model}`, '', answer(r), '']),
    ];
}

/** What a run actually found: how many models answered, and which ones moved. */
export interface Outcome {
    readonly answered: number;
    /** Models whose revised answer differs from their draft. */
    readonly changed: readonly string[];
}

/**
 * The result of the experiment, computed once.
 *
 * Both the markdown verdict below and the stored run summary need this, and two
 * implementations of it would let the list endpoint and the transcript disagree
 * about what a run found — a contradiction with no error on either side.
 *
 * A run with no draft round (one that died before the first answer) answered
 * nothing and changed nothing, which is the honest reading of it.
 */
export function outcome(t: Transcript): Outcome {
    const draft = t.rounds.find((r) => r.kind === 'draft') ?? null;
    if (!draft) return { answered: 0, changed: [] };

    const answered = draft.responses.filter((r) => r.ok && r.text);
    return {
        answered: answered.length,
        changed: answered
            .filter((r) => t.final[r.model] && t.final[r.model] !== r.text)
            .map((r) => r.model),
    };
}

/**
 * Whether revise actually changed anything is the result of the experiment, so
 * it is stated at the top rather than left for the reader to diff by eye.
 */
function verdict(t: Transcript): string[] {
    if (!t.rounds.some((r) => r.kind === 'draft')) return [];

    const { answered, changed } = outcome(t);
    return [
        `- models answered: ${answered} of ${t.models.length}`,
        `- changed after review: ${changed.length ? changed.join(', ') : 'none'}`,
        '',
    ];
}

export function toMarkdown(t: Transcript): string {
    return [
        `# ${t.question}`,
        '',
        `started ${t.startedAt}${t.finishedAt ? ` · finished ${t.finishedAt}` : ''}`,
        '',
        ...verdict(t),
        ...t.rounds.flatMap(roundSection),
    ].join('\n');
}

/** Filesystem-safe and sorts chronologically, matching the CLI's run files. */
export const transcriptFileName = (startedAt: string) =>
    `run-${startedAt.replace(/[:.]/g, '-')}.md`;
