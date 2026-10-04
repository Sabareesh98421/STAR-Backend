/**
 * The network boundary for a conversation. Nothing outside this folder knows
 * HTTP or WebSocket exist, mirroring the backend's rule that only
 * infrastructure/ names a vendor.
 *
 * One socket per chat, because a chat is a conversation the server talks back
 * in: a turn is asked for on it, and that turn's messages arrive on it. Reading
 * what a conversation already holds is a plain GET — history is not live, and a
 * socket is the wrong tool for a page of summaries.
 */
import { ChatClientMessageType } from '@star/run-protocol/chat';
import type { ChatServerMessage, ChatSessionSummary, ChatTurn } from '@star/run-protocol/chat';
import type { StoredRun } from '@star/run-protocol/history';
import type { LinkState } from '../domain/run';

/** Every API response is this envelope; `data` is the only part we want. */
interface Envelope<T> {
    readonly success: boolean;
    readonly message: string;
    readonly data: T;
}

/**
 * Why a request failed, in the server's own words — a failure carries the same
 * `message` as a success, and paraphrasing it here would invent a reason.
 *
 * Parsed by hand because an error body is not always ours: `res.json()` on a
 * gateway's 502 page throws over the top of the failure it is explaining.
 */
const reason = async (res: Response, method: string, url: string): Promise<string> => {
    const fallback = `${method} ${url} failed (${res.status})`;
    const body = await res.text().catch(() => '');
    try {
        const parsed = JSON.parse(body) as { message?: string };
        return parsed.message ?? fallback;
    } catch {
        return fallback;
    }
};

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(await reason(res, init?.method ?? 'GET', url));
    return ((await res.json()) as Envelope<T>).data;
};

/**
 * Opens a conversation. The title is the whole prompt; the server shortens it,
 * so two clients can never disagree about what a title is.
 */
export const createSession = (apiBase: string, title: string) =>
    json<{ session: ChatSessionSummary }>(`${apiBase}/ensemble/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
    }).then((payload) => payload.session);

export const listSessions = (apiBase: string) =>
    json<{ sessions: ChatSessionSummary[] }>(`${apiBase}/ensemble/sessions`).then(
        (payload) => payload.sessions,
    );

/** A conversation's turns, oldest first. Summaries: no transcripts. */
export const fetchSession = (apiBase: string, sessionId: string) =>
    json<{ session: ChatSessionSummary; turns: ChatTurn[] }>(
        `${apiBase}/ensemble/sessions/${sessionId}`,
    );

/** One turn's transcript, fetched when the user actually opens it. */
export const fetchRun = (apiBase: string, runId: string) =>
    json<StoredRun>(`${apiBase}/ensemble/runs/${runId}`);

/**
 * The part of WebSocket this uses.
 *
 * Narrowed to handler properties so a spec can hand over a fake in three
 * lines: the bugs worth testing here are ordering, a mid-run drop and a
 * resumed cursor, none of which need a real server to produce.
 */
export interface SocketLike {
    send(data: string): void;
    close(): void;
    onopen: null | (() => void);
    onmessage: null | ((event: { data: unknown }) => void);
    onclose: null | (() => void);
    onerror: null | (() => void);
}

export type SocketFactory = (url: string) => SocketLike;

export interface ChatConnection {
    /** False if the socket is not open, so the caller can say so rather than
     *  leaving the user looking at a prompt that silently went nowhere. */
    ask(prompt: string, rounds: number | null): boolean;
    /** Reconnects now, resuming from `cursor()`. For a hole in the sequence: a
     *  replay from the last applied seq is the only thing that can fill one. */
    resync(): void;
    close(): void;
}

export interface ChatOptions {
    readonly wsBase: string;
    readonly sessionId: string;
    readonly onMessage: (message: ChatServerMessage) => void;
    readonly onLink: (state: LinkState) => void;
    /**
     * The last seq applied, read at every connect. A reconnect mid-run resumes
     * from it: replaying from zero would duplicate what the client already
     * applied, and replaying nothing would leave a permanent hole in the turn.
     */
    readonly cursor: () => number;
    readonly factory?: SocketFactory;
}

/** Long enough not to hammer a server that is down, short enough to feel live. */
const RETRY_MS = 1_500;

/**
 * Capped, because not every close is a blip. A refused handshake — a session
 * that was deleted, an origin that is not allowed — closes exactly like a
 * dropped connection, and retrying it forever is a loop that looks like a bug
 * in the server rather than in the client.
 */
const RETRIES = 5;

/**
 * Stops a socket talking to us, before asking it to close. A WebSocket goes on
 * firing `onmessage` through CLOSING, and a late `run.status` landing after a
 * cancel overwrites the cancel.
 */
const detach = (socket: SocketLike): void => {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
};

export function openChat(options: ChatOptions): ChatConnection {
    const factory = options.factory ?? ((url) => new WebSocket(url) as unknown as SocketLike);

    let socket: SocketLike | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    /** Set by close(): a deliberate close must never trigger a reconnect. */
    let done = false;
    let live = false;
    /**
     * The first question of a new conversation is always asked before the
     * handshake finishes — the session is created, the socket opened and the
     * prompt sent in one gesture — and `send` on a CONNECTING socket throws.
     * One slot, not a queue: a second question while the first is in flight is
     * refused by the server anyway.
     */
    let pending: string | null = null;

    const connect = () => {
        const next = factory(
            `${options.wsBase}/chat/${options.sessionId}?since=${options.cursor()}`,
        );
        socket = next;

        next.onopen = () => {
            attempts = 0;
            live = true;
            options.onLink('live');
            if (pending === null) return;
            next.send(pending);
            pending = null;
        };

        next.onmessage = (event) => {
            try {
                options.onMessage(JSON.parse(String(event.data)) as ChatServerMessage);
            } catch {
                // A frame we cannot parse is one message lost, not a reason to
                // tear down a connection that is carrying a run.
            }
        };

        next.onclose = () => {
            live = false;
            if (done) return;
            if (attempts >= RETRIES) {
                // Nothing is going to send this now, and a prompt left in the
                // slot would be asked by a later reconnect the user never
                // associated with it.
                pending = null;
                // `ask` reads this to decide whether a question was accepted, so
                // a dead socket left here answers `true` for a prompt nothing
                // will send. Only if it is still ours — `resync` leaves a live
                // successor in the slot.
                if (socket === next) socket = null;
                detach(next);
                return options.onLink('offline');
            }
            attempts += 1;
            // The run outlives this socket — it is mid-conversation in three
            // real chat tabs — so reconnecting is how the client catches up,
            // not a way of restarting anything.
            options.onLink('reconnecting');
            timer = setTimeout(connect, RETRY_MS);
        };

        // A WebSocket always closes after an error, so the handling is there.
        next.onerror = () => {};
    };

    connect();

    return {
        ask(prompt, rounds) {
            if (!socket) return false;
            const message = JSON.stringify({
                type: ChatClientMessageType.turnStart,
                prompt,
                rounds,
            });

            if (!live) {
                // Held until the handshake completes, which is a question
                // accepted rather than one that failed.
                pending = message;
                return true;
            }

            try {
                socket.send(message);
                return true;
            } catch {
                // Sending on a socket that is closing throws. Reported as false
                // rather than swallowed: the question was not asked.
                return false;
            }
        },
        resync() {
            // Closing IS the reconnect — `onclose` schedules it and reads
            // `cursor()` then. It also counts as an attempt, which bounds a gap
            // that cannot be filled.
            if (!done) socket?.close();
        },
        close() {
            done = true;
            pending = null;
            if (timer) clearTimeout(timer);
            if (socket) {
                detach(socket);
                socket.close();
            }
            socket = null;
            live = false;
            options.onLink('offline');
        },
    };
}
