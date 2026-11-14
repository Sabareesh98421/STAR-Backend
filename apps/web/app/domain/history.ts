/**
 * The chat history as rows — the one list the rail and the `/history` spotlight
 * both draw.
 *
 * A flat array with `depth`, not a nested tree: Sheet A's ROW is the only
 * primitive either surface has, and the spotlight needs one sequence to filter
 * and arrow through. Nesting is carried by the indent, like the fs: results.
 *
 * Turns appear under the open conversation alone, because the open one is the
 * only conversation whose turns have been read.
 */
import type { ChatSessionSummary, ChatTurn } from '@star/run-protocol/chat';
import { isRunning } from './run';
import type { RunStatus } from './run';
import type { MarkerName, ObjectRow } from './workspace';

export interface HistoryRow extends ObjectRow {
    /**
     * A session opens a conversation, a turn opens its transcript, and a live
     * turn opens nothing: it has no stored run to read yet.
     */
    readonly kind: 'session' | 'turn' | 'live';
    /**
     * The session or run this row opens — NOT `id`, which is qualified by kind.
     * A conversation backfilled from a run carries that run's own id, so the
     * two rows collide on it and a list keyed by the bare id resolves a turn to
     * its session.
     */
    readonly target: string;
}

export interface HistoryView {
    readonly sessions: readonly ChatSessionSummary[];
    readonly sessionId: string | null;
    readonly turns: readonly ChatTurn[];
    /** The question being answered right now, if one is. */
    readonly asking: string | null;
    readonly status: RunStatus;
}

/**
 * Escalation by opacity, never by hue — the design is explicit that there is
 * "no red, no badges, no severity colours". A failed turn is `raised`, which
 * is the same marker a review finding gets.
 */
const MARKER_FOR_TERMINAL: Record<string, MarkerName> = {
    idle: 'idle',
    complete: 'closed',
    failed: 'raised',
    cancelled: 'idle',
};

/** Every working status is `running`; the table above covers the rest. */
const markerFor = (status: string): MarkerName =>
    isRunning(status as RunStatus) ? 'running' : (MARKER_FOR_TERMINAL[status] ?? 'idle');

/**
 * A turn that completed OR failed has been re-read from the server by then and
 * is a stored turn already — listing the live row too showed one turn twice.
 * Cancelled is the exception: delivery stopped, the run did not, and no stored
 * turn has taken its place yet.
 */
const hasLiveRow = (status: RunStatus): boolean => isRunning(status) || status === 'cancelled';

export function historyRows(view: HistoryView): HistoryRow[] {
    const rows: HistoryRow[] = [];

    for (const session of view.sessions) {
        const open = session.id === view.sessionId;
        rows.push({
            id: `session:${session.id}`,
            kind: 'session',
            target: session.id,
            // The open conversation is the current one; the rest are past.
            marker: open ? 'open' : 'closed',
            label: session.title,
            meta: `${session.turnCount}`,
            shortcut: null,
        });
        if (!open) continue;

        view.turns.forEach((turn, index) =>
            rows.push({
                id: `turn:${turn.id}`,
                kind: 'turn',
                target: turn.id,
                marker: markerFor(turn.status),
                label: turn.question,
                meta: `${index + 1}`,
                shortcut: null,
                depth: 1,
            }),
        );

        if (view.asking === null || !hasLiveRow(view.status)) continue;
        rows.push({
            id: `live:${session.id}`,
            kind: 'live',
            target: session.id,
            marker: markerFor(view.status),
            label: view.asking,
            meta: `${view.turns.length + 1}`,
            shortcut: null,
            depth: 1,
        });
    }

    return rows;
}
