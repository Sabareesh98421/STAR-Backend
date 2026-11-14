/**
 * Reading conversations and finished runs back.
 *
 * Separate from ensemble.service.ts because the two have nothing in common at
 * runtime: that file holds the shared browser and drives a turn that is
 * happening, this one answers plain queries about turns that already did — and
 * about the sessions that hold them, which is what makes a chat resumable.
 */
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import { toResponse } from '@/shared/http/resolveAppError';
import { TryCatch } from '@/shared/utils/try-catch';
import { NotFoundError } from '@/shared/errors';
import { ensembleRunRepository } from '@/infrastructure/database';
import type { SessionAccess } from '@/infrastructure/database';
import type { RunListResponse, StoredRun } from '@star/run-protocol/history';
import type {
    SessionCreatedResponse,
    SessionListResponse,
    SessionTurnsResponse,
} from '@star/run-protocol/chat';
import type {
    IdParams,
    RunDetailQuery,
    RunListQuery,
    SessionCreateBody,
    SessionListQuery,
} from './ensemble.schema';

/** The resource name in a 404, so the message reads the same from both ends. */
export const RUN_RESOURCE = 'Ensemble run';
export const SESSION_RESOURCE = 'Chat session';

/**
 * Long enough to tell two conversations apart, short enough that the rail is
 * never handed a prompt to render. Applied here rather than at the client,
 * which would leave the stored title at whatever each caller felt like sending.
 */
const TITLE_MAX = 120;

/** One line, no runs of whitespace: a title sits in a single row. */
export function toTitle(text: string): string {
    const line = text.replace(/\s+/g, ' ').trim();
    return line.length <= TITLE_MAX ? line : `${line.slice(0, TITLE_MAX - 1)}…`;
}

export function createSessionHandler(body: SessionCreateBody, access: SessionAccess) {
    return TryCatch.of(() => createSession(body, access)).onError(toResponse);
}

async function createSession(body: SessionCreateBody, access: SessionAccess) {
    const session = await ensembleRunRepository.createSession(toTitle(body.title), access);
    return response(
        success<SessionCreatedResponse>({ session }, 'Chat session created', 201),
    );
}

export function listSessionsHandler(query: SessionListQuery, access: SessionAccess) {
    return TryCatch.of(() => listSessions(query, access)).onError(toResponse);
}

async function listSessions(query: SessionListQuery, access: SessionAccess) {
    const sessions = await ensembleRunRepository.listSessions(query.limit, access);
    return response(success<SessionListResponse>({ sessions }, 'Chat sessions listed', 200));
}

export function getSessionHandler(params: IdParams, access: SessionAccess) {
    return TryCatch.of(() => getSession(params, access)).onError(toResponse);
}

async function getSession(params: IdParams, access: SessionAccess) {
    const session = await ensembleRunRepository.findSession(params.id, access);
    // The turns may legitimately be empty — a conversation opened and never
    // asked anything — but the session itself either exists or it does not.
    if (!session) throw new NotFoundError(SESSION_RESOURCE, params.id);
    return response(success<SessionTurnsResponse>(session, 'Chat session fetched', 200));
}

export function listRunsHandler(query: RunListQuery, access: SessionAccess) {
    return TryCatch.of(() => listRuns(query, access)).onError(toResponse);
}

async function listRuns(query: RunListQuery, access: SessionAccess) {
    const runs = await ensembleRunRepository.list(query.limit, access);
    return response(success<RunListResponse>({ runs }, 'Ensemble runs listed', 200));
}

export function getRunHandler(params: IdParams, query: RunDetailQuery, access: SessionAccess) {
    return TryCatch.of(() => getRun(params, query, access)).onError(toResponse);
}

async function getRun(params: IdParams, query: RunDetailQuery, access: SessionAccess) {
    // Summary and transcript by default; the rounds only when asked for. The
    // editor opens `file` and reads nothing else, and the rounds are the same
    // text again several times over — see StoredRun.rounds.
    const run = await ensembleRunRepository.findById(params.id, query.rounds, access);
    // A 200 with an empty body would tell the client the run exists and holds
    // nothing, which is the one thing a stored run can never be.
    if (!run) throw new NotFoundError(RUN_RESOURCE, params.id);
    return response(success<StoredRun>(run, 'Ensemble run fetched', 200));
}
