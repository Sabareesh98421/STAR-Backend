// ensemble.run.repository.prisma.ts
import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '../client';
import type { RunSummary, StoredResponse, StoredRound, StoredRun } from '@star/run-protocol/history';
import type { ChatSessionSummary, SessionTurnsResponse } from '@star/run-protocol/chat';
import type { IEnsembleRunRepository, SaveRunInput, SessionTurn } from './ensemble.run.repository';

/**
 * Exactly the columns a summary needs, shared by both reads so the list and the
 * detail view can never disagree about what a summary is. Notably absent:
 * `fileText`, which is the whole transcript — twenty of those in one list
 * response is hundreds of kilobytes for a sidebar.
 */
const SUMMARY_SELECT = {
    id: true,
    question: true,
    startedAt: true,
    finishedAt: true,
    status: true,
    modelCount: true,
    answeredCount: true,
    changedModels: true,
} as const;

type SummaryRow = Prisma.EnsembleRunGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(run: SummaryRow): RunSummary {
    return {
        id: run.id,
        question: run.question,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt === null ? null : run.finishedAt.toISOString(),
        status: run.status,
        modelCount: run.modelCount,
        answeredCount: run.answeredCount,
        changedModels: run.changedModels,
    };
}

/** Written by `save` below as a Record<string, string>; nothing else writes it.
 *  Shared by a round's `sent` and a run's `context`, both keyed by model. */
const toSent = (value: Prisma.JsonValue): Record<string, string> =>
    (value as Record<string, string> | null) ?? {};

const ROUND_SELECT = {
    kind: true,
    iteration: true,
    at: true,
    sent: true,
    responses: {
        // A model answers at most once per round, so this is a total order and
        // the array comes back the same way every read.
        orderBy: { model: 'asc' },
        select: { model: true, ok: true, text: true, ms: true, threadUrl: true, error: true },
    },
} as const;

type RoundRow = Prisma.EnsembleRoundGetPayload<{ select: typeof ROUND_SELECT }>;

function toRound(round: RoundRow): StoredRound {
    return {
        kind: round.kind,
        iteration: round.iteration,
        at: round.at.toISOString(),
        sent: toSent(round.sent),
        responses: round.responses.map(
            (r): StoredResponse => ({
                model: r.model,
                ok: r.ok,
                text: r.text,
                ms: r.ms,
                threadUrl: r.threadUrl,
                error: r.error,
            }),
        ),
    };
}

const SESSION_SELECT = {
    id: true,
    title: true,
    createdAt: true,
    updatedAt: true,
    // Counted in the query rather than by loading the turns: the rail wants the
    // number, and the turns are tens of kilobytes each.
    _count: { select: { runs: true } },
} as const;

type SessionRow = Prisma.ChatSessionGetPayload<{ select: typeof SESSION_SELECT }>;

const toSessionSummary = (row: SessionRow): ChatSessionSummary => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    turnCount: row._count.runs,
});

export class PrismaEnsembleRunRepository implements IEnsembleRunRepository {
    async save(input: SaveRunInput): Promise<string> {
        const t = input.transcript;
        const db = getDb();
        const create = db.ensembleRun.create({
            // Nested, so a run and its rounds land in one transaction: a run row
            // with no rounds would read as a run where nothing happened.
            data: {
                question: t.question,
                sessionId: input.sessionId,
                startedAt: new Date(t.startedAt),
                finishedAt: t.finishedAt === null ? null : new Date(t.finishedAt),
                status: input.status,
                modelCount: t.models.length,
                answeredCount: input.answered,
                changedModels: [...input.changedModels],
                context: t.context,
                fileName: input.file.name,
                fileText: input.file.text,
                rounds: {
                    create: t.rounds.map((round, seq) => ({
                        kind: round.kind,
                        iteration: round.iteration,
                        seq,
                        at: new Date(round.at),
                        sent: round.sent,
                        responses: {
                            create: round.responses.map((r) => ({
                                model: r.model,
                                ok: r.ok,
                                text: r.text,
                                ms: r.ms,
                                // '' would be indistinguishable from a URL we
                                // failed to record, and the URL is the only
                                // thing that makes the stored text verifiable.
                                threadUrl: r.url === null || r.url === '' ? null : r.url,
                                error: r.error,
                            })),
                        },
                    })),
                },
            },
            select: { id: true },
        });

        // One transaction with the turn itself, and an explicit timestamp: an
        // update with no data does NOT move @updatedAt (measured, not assumed),
        // so a touch written that way would leave a conversation sorting to the
        // bottom of the very list the new turn just changed.
        const [run] = await db.$transaction([
            create,
            db.chatSession.update({
                where: { id: input.sessionId },
                data: { updatedAt: new Date() },
            }),
        ]);

        return run.id;
    }

    async createSession(title: string): Promise<ChatSessionSummary> {
        const session = await getDb().chatSession.create({
            data: { title },
            select: SESSION_SELECT,
        });
        return toSessionSummary(session);
    }

    async listSessions(limit: number): Promise<ChatSessionSummary[]> {
        const sessions = await getDb().chatSession.findMany({
            select: SESSION_SELECT,
            orderBy: { updatedAt: 'desc' },
            take: limit,
        });
        return sessions.map(toSessionSummary);
    }

    async findSession(id: string): Promise<SessionTurnsResponse | null> {
        const session = await getDb().chatSession.findUnique({
            where: { id },
            select: {
                ...SESSION_SELECT,
                // Oldest first: a conversation is read in the order it was
                // held, unlike the session list, which is read by recency.
                runs: { select: SUMMARY_SELECT, orderBy: { startedAt: 'asc' } },
            },
        });
        if (!session) return null;

        return { session: toSessionSummary(session), turns: session.runs.map(toSummary) };
    }

    async sessionExists(id: string): Promise<boolean> {
        // One indexed lookup of one column. See the interface for why this is
        // not `findSession(id) !== null`.
        const session = await getDb().chatSession.findUnique({
            where: { id },
            select: { id: true },
        });
        return session !== null;
    }

    async recentTurns(sessionId: string, limit: number): Promise<SessionTurn[]> {
        const runs = await getDb().ensembleRun.findMany({
            where: { sessionId },
            // Newest first to take the right end of a long conversation, then
            // reversed into reading order.
            orderBy: { startedAt: 'desc' },
            take: limit,
            select: {
                question: true,
                // The closing round only. A run ends on a revise round, and
                // everything before it was superseded inside that same turn.
                rounds: {
                    orderBy: { seq: 'desc' },
                    take: 1,
                    select: { responses: { select: { model: true, ok: true, text: true } } },
                },
            },
        });

        return runs.reverse().map((run) => ({
            question: run.question,
            answers: run.rounds[0]?.responses ?? [],
        }));
    }

    async list(limit: number): Promise<RunSummary[]> {
        const runs = await getDb().ensembleRun.findMany({
            select: SUMMARY_SELECT,
            orderBy: { startedAt: 'desc' },
            take: limit,
        });
        return runs.map(toSummary);
    }

    async findById(id: string, withRounds: boolean): Promise<StoredRun | null> {
        const db = getDb();
        const run = await db.ensembleRun.findUnique({
            where: { id },
            // `context` only when the rounds are — it is what their prompts were
            // prepended with, and nothing to read on its own.
            select: {
                ...SUMMARY_SELECT,
                fileName: true,
                fileText: true,
                ...(withRounds ? { context: true } : {}),
            },
        });
        if (!run) return null;

        // A second query, not a conditional nested select: Prisma types that as
        // a union and the cast to unwrap it costs more than a round trip the
        // common path never makes.
        const rounds = withRounds
            ? await db.ensembleRound.findMany({
                  where: { runId: id },
                  // By stored position, not by `at`: two rounds in the same
                  // millisecond would otherwise come back in any order.
                  orderBy: { seq: 'asc' },
                  select: ROUND_SELECT,
              })
            : null;

        return {
            ...toSummary(run),
            rounds: rounds === null ? null : rounds.map(toRound),
            context: 'context' in run ? toSent(run.context) : null,
            file: { name: run.fileName, text: run.fileText },
        };
    }
}
