import { computed, onBeforeUnmount, reactive, ref, toRefs } from 'vue';
import { CHAT_ERROR } from '@star/run-protocol/chat';
import { applyEvent, emptyRunState, isRunning, type LinkState } from '../domain/run';
import {
    createSession,
    fetchRun,
    fetchSession,
    listSessions,
    openChat,
    type ChatConnection,
    type SocketFactory,
} from '../transport/chat.transport';
import type { ChatServerMessage, ChatSessionSummary, ChatTurn } from '@star/run-protocol/chat';

/**
 * Holds one conversation, and the list of the others.
 *
 * A chat is a socket and a list of turns. The turns that already finished are
 * read over HTTP, the one that is running arrives on the socket, and the two
 * are deliberately different shapes: a stored turn has an id and a transcript,
 * a running turn has neither yet.
 *
 * Run state stays plainly reactive rather than shallow. It is bounded by the
 * agent count and carries no token text, so there is nothing here worth the
 * identity bugs that shallowRef plus triggerRef invites.
 */
export function useChat(factory?: SocketFactory) {
    // Read here rather than at module level: runtime config only exists inside
    // a Nuxt setup context. A spec passes a socket factory and a base it owns.
    const config = useRuntimeConfig().public;
    const apiBase = config.apiBase;

    const state = reactive(emptyRunState());
    /** Our connection, not the run. A drop moves this and nothing else. */
    const link = ref<LinkState>('offline');

    const sessions = ref<ChatSessionSummary[]>([]);
    const sessionId = ref<string | null>(null);
    /** Finished turns of the open conversation, oldest first. */
    const turns = ref<ChatTurn[]>([]);
    /** The question of the turn being answered right now, if there is one. */
    const asking = ref<string | null>(null);
    /** The last refusal the server sent, as it worded it. */
    const problem = ref<string | null>(null);

    let connection: ChatConnection | null = null;

    const running = computed(() => isRunning(state.status));

    function apply(message: ChatServerMessage) {
        // A hole in the sequence — a message the server could not get out. Not
        // applied, so the cursor stays put and the replay fills the gap.
        if (message.seq > state.cursor + 1) return connection?.resync();

        applyEvent(state, message);

        if (message.type === CHAT_ERROR) {
            problem.value = message.message;
            // Only a turn in progress can be failed by this. A refusal that
            // arrives between turns — the shared browser is busy elsewhere —
            // must not mark the last finished turn as broken.
            if (running.value) state.status = 'failed';
            return;
        }

        if (message.type === 'run.started') asking.value = message.prompt;
        // A finished turn is a stored turn: re-read so it arrives with the id
        // and summary that only the server can give it, and so the rail's
        // ordering and turn counts come from one source.
        if (message.type === 'run.status' && !running.value) void refresh();
    }

    /** The conversation list and the open conversation's turns. */
    async function refresh() {
        sessions.value = await listSessions(apiBase);
        if (!sessionId.value) return;
        turns.value = (await fetchSession(apiBase, sessionId.value)).turns;
    }

    function disconnect() {
        connection?.close();
        connection = null;
    }

    /**
     * Opens a conversation: its turns, then its socket.
     *
     * The socket replays whatever a turn still in flight has already said, so
     * reopening a chat mid-run shows that run still running rather than a
     * finished turn with nothing in it.
     */
    async function open(id: string) {
        // Read before anything on screen moves: a fetch that fails must not
        // leave this conversation's id beside the last one's turns.
        const session = await fetchSession(apiBase, id);

        disconnect();
        Object.assign(state, emptyRunState());
        asking.value = null;
        problem.value = null;
        sessionId.value = id;
        turns.value = session.turns;

        connection = openChat({
            wsBase: config.wsBase,
            sessionId: id,
            onMessage: apply,
            onLink: (next) => (link.value = next),
            // Read at every connect, so a reconnect resumes rather than
            // replaying what has already been applied.
            cursor: () => state.cursor,
            factory,
        });
    }

    /** Leaves the conversation open but starts a fresh one on the next send. */
    function start() {
        disconnect();
        Object.assign(state, emptyRunState());
        sessionId.value = null;
        turns.value = [];
        asking.value = null;
        problem.value = null;
    }

    /**
     * Asks the next question of the open conversation, opening one first if
     * there is none. The first prompt is also the conversation's title, which
     * is why the session is created from it rather than named separately.
     */
    async function send(prompt: string) {
        problem.value = null;

        if (!sessionId.value) {
            const session = await createSession(apiBase, prompt);
            sessions.value = [session, ...sessions.value];
            await open(session.id);
        }

        Object.assign(state, emptyRunState());
        state.status = 'responding';
        asking.value = prompt;

        // The socket may still be handshaking on a brand new conversation; the
        // transport holds the question until it opens. False means there is no
        // socket at all, and the turn never left the page.
        if (!connection?.ask(prompt, null)) {
            state.status = 'failed';
            problem.value = 'Not connected to the chat';
        }
    }

    /**
     * Stops delivery, never the work. The rounds are mid-conversation in three
     * real chat tabs with nothing safe to interrupt, so the turn finishes
     * server-side and reopening the conversation picks it up again.
     */
    function cancel() {
        if (!running.value) return;
        disconnect();
        state.status = 'cancelled';
    }

    /** A stored turn's transcript, which is the file the editor opens. */
    const transcript = (runId: string) => fetchRun(apiBase, runId);

    // Leaving must not leave a socket open against a dead component.
    onBeforeUnmount(disconnect);

    return {
        ...toRefs(state),
        link,
        sessions,
        sessionId,
        turns,
        asking,
        problem,
        running,
        refresh,
        open,
        start,
        send,
        cancel,
        transcript,
    };
}
