/**
 * Renders a run transcript as the file the editor opens.
 *
 * Pure and separate from the service so it can be read back against a stored
 * transcript without a browser or a run. Markdown rather than JSON because a
 * human reads this to judge whether peer review changed any answer — which is
 * the only question the whole harness exists to answer.
 */

/** One model's result inside a round, as `dispatch` reports it. */
interface RoundResponse {
    model: string;
    ok: boolean;
    text: string;
    error?: string | null;
}

interface Round {
    kind: string;
    iteration: number;
    responses: RoundResponse[];
}

export interface Transcript {
    question: string;
    startedAt: string;
    finishedAt?: string;
    models: string[];
    rounds: Round[];
    final?: Record<string, string>;
}

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
function answer(r: RoundResponse): string {
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

/**
 * Whether revise actually changed anything is the result of the experiment, so
 * it is stated at the top rather than left for the reader to diff by eye.
 */
function verdict(t: Transcript): string[] {
    const draft = t.rounds.find((r) => r.kind === 'draft');
    if (!draft || !t.final) return [];

    const changed = draft.responses
        .filter((r) => r.ok && r.text && t.final![r.model] && t.final![r.model] !== r.text)
        .map((r) => r.model);
    const answered = draft.responses.filter((r) => r.ok && r.text).length;

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
