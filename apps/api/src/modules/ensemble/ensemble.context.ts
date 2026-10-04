/**
 * What each model is told about the conversation so far. Per model, never
 * pooled: handed a peer's history a model reads as one that revised its
 * position. Same rule as the cross-review.
 */
import type { SessionTurn } from '@/infrastructure/database';

const asTurn = (question: string, answer: string) => `Question: ${question}\nYour answer: ${answer}`;

/** Empty for a first turn, and for a model that has not answered in one yet. */
export function conversationContext(turns: readonly SessionTurn[]): Record<string, string> {
    const said: Record<string, string[]> = {};

    for (const turn of turns) {
        for (const answer of turn.answers) {
            // A model that dropped out of a turn gets no entry for it: an empty
            // 'Your answer' reads as a model that was asked and said nothing.
            if (!answer.ok || !answer.text) continue;
            (said[answer.model] ??= []).push(asTurn(turn.question, answer.text));
        }
    }

    return Object.fromEntries(Object.entries(said).map(([model, answers]) => [model, answers.join('\n\n')]));
}
