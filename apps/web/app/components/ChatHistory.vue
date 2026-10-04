<script setup lang="ts">
/**
 * Chat History, in the rail's own section — the slot the wireframes already
 * left for it.
 *
 * The rows come from `historyRows`, which the `/history` spotlight draws too:
 * one tree, two places it can be read. What is left here is the section the
 * rail wants around it.
 */
import { computed } from 'vue';
import type { ChatSessionSummary, ChatTurn } from '@star/run-protocol/chat';
import { historyRows } from '../domain/history';
import { SLASH_NEW } from '../domain/slash';
import type { RunStatus } from '../domain/run';

const props = defineProps<{
    sessions: ChatSessionSummary[];
    sessionId: string | null;
    turns: ChatTurn[];
    /** The question being answered right now, if one is. */
    asking: string | null;
    status: RunStatus;
    hint: boolean;
}>();
const emit = defineEmits<{
    'open-session': [string];
    'open-turn': [string];
    'new-chat': [];
}>();

const rows = computed(() => historyRows(props));
</script>

<template>
    <section class="flex flex-col gap-2">
        <h2 class="flex items-center gap-2 font-mono text-12 font-normal leading-none text-ink-40">
            <span>Chat History</span>
            <button
                type="button"
                class="ms-auto font-mono text-12 text-accent-60 hover:text-accent"
                :title="`${SLASH_NEW.label} (/${SLASH_NEW.name})`"
                @click="emit('new-chat')"
            >
                + {{ SLASH_NEW.label }}
            </button>
        </h2>

        <p v-if="!sessions.length" class="font-mono text-12 text-ink-30">empty</p>

        <!-- The turns of the open conversation sit under it, indented: a turn
             belongs to a chat and has to read as part of it rather than as a
             list of its own. A turn still being answered opens nothing. -->
        <component
            :is="row.kind === 'live' ? 'div' : 'button'"
            v-for="row in rows"
            :key="row.id"
            :type="row.kind === 'live' ? undefined : 'button'"
            class="text-start"
            @click="row.kind === 'session' ? emit('open-session', row.target)
                : row.kind === 'turn' && emit('open-turn', row.target)"
        >
            <ObjectRow
                :row="row"
                :hint="hint"
                :guide="row.kind !== 'session'"
                :select="row.kind === 'session' && row.target === sessionId ? 'subtle' : 'none'"
            />
        </component>
    </section>
</template>
