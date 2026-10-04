// No database. The format a model is handed its own history in used to be built
// inside the Prisma repository, so asserting any of this needed Postgres running
// and a saved run to read back.
import { test, expect } from '@playwright/test';
import { conversationContext } from './ensemble.context';
import type { SessionTurn } from '@/infrastructure/database';

const turn = (question: string, answers: SessionTurn['answers']): SessionTurn => ({ question, answers });
const answer = (model: string, text: string, ok = true) => ({ model, ok, text });

test('a model is given its own answers and never a peer\'s', () => {
    const context = conversationContext([
        turn('why is evict slow?', [answer('chatgpt', 'CG_ONE'), answer('claude', 'CL_ONE')]),
    ]);

    // The failure with no symptom: handed a peer's history a model reads as one
    // that revised its position, and the next turn's transcript looks fine.
    expect(context.chatgpt).toContain('CG_ONE');
    expect(context.chatgpt).not.toContain('CL_ONE');
    expect(context.claude).not.toContain('CG_ONE');
});

test('the question travels with the answer', () => {
    const context = conversationContext([turn('why is evict slow?', [answer('chatgpt', 'CG')])]);
    // Without it the model is handed its own words and no idea what they answered.
    expect(context.chatgpt).toContain('why is evict slow?');
});

test('turns accumulate in the order they were held', () => {
    const context = conversationContext([
        turn('first?', [answer('chatgpt', 'ONE')]),
        turn('second?', [answer('chatgpt', 'TWO')]),
    ]);
    expect(context.chatgpt!.indexOf('ONE')).toBeLessThan(context.chatgpt!.indexOf('TWO'));
});

test('a model that dropped out gets no entry for that turn', () => {
    const context = conversationContext([
        turn('q?', [answer('chatgpt', 'CG'), answer('gemini', '', false)]),
    ]);
    // An empty 'Your answer' reads as a model that was asked and said nothing,
    // which is different evidence from a model that never answered.
    expect(context.gemini ?? null).toBeNull();
});

test('a conversation with no turns hands the models nothing', () => {
    // Not an empty block and not a heading with no body: a first turn has to be
    // indistinguishable from a run with no conversation to continue.
    expect(conversationContext([])).toEqual({});
});
