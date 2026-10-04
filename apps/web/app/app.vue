<script setup lang="ts">
// Frames 1-3 of Sheet B are one screen in three states: default, focus mode
// (⌥⇧F), and go-live. The shell holds that state; the layers read it.
//
// The ensemble is the part the wireframes do not cover. It renders through the
// primitives they do define: Sheet A lists "agent thread" as a ROW.
import { computed, onMounted, ref, watch } from 'vue';
import { historyRows } from './domain/history';
import { slashRow, slashRowAction, SLASH_NEW, SLASH_STOP, type SlashActionName } from './domain/slash';

/** The FIELD owns what is typed in it; this is how a new chat empties it. */
const field = ref<{ clear: () => void } | null>(null);

const shell = useShell();
const buffer = useBuffer();
const chat = useChat();

/**
 * Anything the chat does over the network, with its failure put in front of the
 * user. Uncaught, a rejection is the same to them as nothing happening.
 */
function attempt(work: Promise<unknown>) {
    void work.catch((error: unknown) => {
        shell.showToast(error instanceof Error ? error.message : 'The chat could not be reached');
    });
}

function submit(prompt: string) {
    attempt(chat.send(prompt));
}

// A finished turn hands back its transcript, and that is what the editor opens.
// Watched rather than awaited after send: the turn is a stream, and the file
// arrives as one of its messages, not as a return value.
watch(chat.file, (file) => {
    if (!file) return;
    buffer.open(file.name, file.text);
    shell.showToast(`Opened ${file.name}`);
});

// Refusals are the server's own wording — "already in progress on the shared
// browser" is the common one, and paraphrasing it here would invent a reason.
watch(chat.problem, (message) => {
    if (message) shell.showToast(message);
});

// The conversations exist before this page did: the rail is populated on load
// rather than by the first question, which is what makes a chat resumable at
// all.
onMounted(() => attempt(chat.refresh()));

/**
 * Starting a fresh conversation. Reachable three ways — the rail's button, the
 * row the `/history` spotlight puts above the list, and `/new` typed into the
 * composer — because all three are places someone is already looking at the
 * history when they decide to leave it.
 *
 * Leaving a turn that is still running says so. The turn is not interrupted —
 * nothing here can interrupt it — and a fresh composer with the live row gone
 * otherwise reads as if the question had been thrown away.
 */
function newChat() {
    const live = chat.running.value;
    chat.start();
    // The open transcript belongs to the conversation being left, the same way
    // the typed prompt does. Without this a new chat starts with the previous
    // chat's file still in the editor and reloading the page was the only way
    // to clear it.
    buffer.close();
    // Half a prompt left in the composer belongs to the conversation that was
    // open, not to the empty one that replaces it.
    field.value?.clear();
    shell.rest();
    shell.showToast(live ? `${SLASH_NEW.label} · the last turn finishes server-side` : SLASH_NEW.label);
}

/**
 * Stops delivery of the open turn. The run itself finishes server-side, so the
 * toast says that rather than claiming the work was cancelled — reopening the
 * conversation picks the same turn back up.
 */
function stop() {
    if (!chat.running.value) return;
    chat.cancel();
    shell.rest();
    shell.showToast('Stopped · the turn finishes server-side');
}

/**
 * What each slash action does. The registry says a command exists and has no
 * list; this says what it runs. Keyed by the entry's own name so the two
 * cannot drift, and the only place in the app that binds one.
 *
 * `Record<SlashActionName, ...>` is exhaustive on purpose: adding an action to
 * the registry and not binding it here stops compiling, rather than shipping a
 * command that empties the composer and does nothing.
 */
const SLASH_ACTIONS: Record<SlashActionName, () => void> = {
    [SLASH_NEW.name]: newChat,
    [SLASH_STOP.name]: stop,
};

/** Reopening a conversation does not open a transcript; the user picks a turn. */
function openSession(id: string) {
    attempt(chat.open(id));
}

/** A stored turn opens in the editor, like a finished run always has. */
async function openTurn(runId: string) {
    const run = await chat.transcript(runId);
    buffer.open(run.file.name, run.file.text);
    shell.showToast(`Opened ${run.file.name}`);
}

/**
 * `/history` lists the same tree the rail draws, in the FIELD's own spotlight.
 * The rows are built here because this is where opening one is decided: a
 * conversation expands into its turns in place, and only a turn — which opens
 * a transcript in the editor — closes the spotlight.
 */
const history = computed(() =>
    historyRows({
        sessions: chat.sessions.value,
        sessionId: chat.sessionId.value,
        turns: chat.turns.value,
        asking: chat.asking.value,
        status: chat.status.value,
    }),
);

/**
 * The actions the history offers: a new chat always, and stopping the open turn
 * only while there is one to stop. They sit above the list because both are
 * ways of leaving it.
 */
const spotlightRows = computed(() => {
    if (shell.spotlightPrefix.value !== 'history') return [];
    const actions = [slashRow(SLASH_NEW)];
    if (chat.running.value) actions.push(slashRow(SLASH_STOP));
    return [...actions, ...history.value];
});

function openRow(id: string) {
    const action = slashRowAction(id);
    if (action) return SLASH_ACTIONS[action]?.();
    const row = history.value.find((candidate) => candidate.id === id) ?? null;
    if (row?.kind === 'session') return openSession(row.target);
    if (row?.kind === 'turn') {
        shell.rest();
        attempt(openTurn(row.target));
    }
}

function adopt() {
    const line = buffer.adopt();
    // Named from the buffer, not a literal: the toast used to claim a file name
    // that had nothing to do with what was actually open.
    if (line) shell.showToast(`Adopted into ${buffer.name.value ?? 'the buffer'}`);
}
</script>

<template>
    <UApp>
        <div class="fixed inset-0 overflow-hidden bg-bg">
            <EditorSurface
                :text="buffer.text.value"
                :lines="buffer.lines.value"
                :peek="buffer.peek.value"
                :dirty="buffer.dirty.value"
                :name="buffer.name.value"
                :rendered="shell.rendered.value"
                @adopt="adopt"
                @dismiss="buffer.dismiss()"
                @edit="buffer.edit"
                @toggle-rendered="shell.rendered.value = !shell.rendered.value"
            />

            <BoosterRail
                :focus-mode="shell.focusMode.value"
                :go-live="shell.goLive.value"
                :hint="shell.hintHeld.value"
                :agents="chat.agents.value"
                :runtime="chat.runtime.value"
                :reviews="chat.reviews.value"
                :status="chat.status.value"
                :link="chat.link.value"
                :leader-note="chat.leaderNote.value"
                :sessions="chat.sessions.value"
                :session-id="chat.sessionId.value"
                :turns="chat.turns.value"
                :asking="chat.asking.value"
                @toggle-go-live="shell.goLive.value = !shell.goLive.value"
                @execute-review="shell.runConsole()"
                @open-session="openSession"
                @open-turn="(id: string) => attempt(openTurn(id))"
                @new-chat="newChat"
            />

            <ConsolePanel v-if="shell.layer.value === 'console'" @close="shell.rest()" />

            <TravelingField
                ref="field"
                :layer="shell.layer.value"
                :focus-mode="shell.focusMode.value"
                :prefix="shell.spotlightPrefix.value"
                :hint="shell.hintHeld.value"
                :busy="chat.running.value"
                :rows="spotlightRows"
                @submit="submit"
                @command="shell.openSpotlight"
                @action="SLASH_ACTIONS[$event]?.()"
                @open="openRow"
            />

            <ToastStack :message="shell.toast.value" />

            <p class="sr-only">
                Control P opens spotlight. Alt M toggles the rendered markdown view. Alt Shift F
                toggles focus mode. Hold Alt to reveal shortcuts.
            </p>
        </div>
    </UApp>
</template>
