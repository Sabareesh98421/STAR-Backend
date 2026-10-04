import { expect, test } from '@playwright/test';
import type { ChatSessionSummary, ChatTurn } from '@star/run-protocol/chat';
import { historyRows, type HistoryView } from './history';

const session = (id: string, turnCount = 1): ChatSessionSummary => ({
    id,
    title: `title ${id}`,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    turnCount,
});

const turn = (id: string, status: string): ChatTurn => ({
    id,
    question: `question ${id}`,
    startedAt: '2026-10-03T00:00:00.000Z',
    finishedAt: null,
    status,
    modelCount: 3,
    answeredCount: 3,
    changedModels: [],
});

const view = (patch: Partial<HistoryView>): HistoryView => ({
    sessions: [session('a'), session('b')],
    sessionId: 'a',
    turns: [],
    asking: null,
    status: 'idle',
    ...patch,
});

test('only the open conversation shows its turns', () => {
    const rows = historyRows(view({ turns: [turn('t1', 'complete')] }));

    expect(rows.map((row) => [row.kind, row.target])).toEqual([
        ['session', 'a'],
        ['turn', 't1'],
        ['session', 'b'],
    ]);
    // The turn reads as part of its chat, not as a list of its own.
    expect(rows[1]?.depth).toBe(1);
});

test('the turn being answered is listed only while it is still the live one', () => {
    const live = historyRows(view({ asking: 'now', status: 'responding' }));
    expect(live.map((row) => row.kind)).toEqual(['session', 'live', 'session']);
    expect(live[1]?.label).toBe('now');

    // Complete means the server has re-read it as a stored turn: listing the
    // live row too would show one turn twice.
    const done = historyRows(
        view({ asking: 'now', status: 'complete', turns: [turn('t1', 'complete')] }),
    );
    expect(done.map((row) => row.kind)).toEqual(['session', 'turn', 'session']);
});

test('a failed turn escalates by marker, not by hue', () => {
    const rows = historyRows(view({ turns: [turn('t1', 'failed')] }));
    expect(rows[1]?.marker).toBe('raised');
});

test('a turn and its conversation stay distinct rows when they share an id', () => {
    // Conversations backfilled from a run carry that run's own id, so a session
    // and its first turn really do collide — a list keyed by the bare id
    // resolved that turn to its session and reopened the chat instead of the
    // transcript.
    const rows = historyRows(
        view({ asking: 'now', status: 'responding', turns: [turn('a', 'complete')] }),
    );

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    const picked = rows.find((row) => row.id === 'turn:a') ?? null;
    expect(picked?.kind).toBe('turn');
    expect(picked?.target).toBe('a');
});
