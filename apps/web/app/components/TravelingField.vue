<script setup lang="ts">
/**
 * Sheet A · FIELD, Sheet C · Morph.
 *
 * "one persistent object · travels, never duplicates". One element, one input.
 * The same <input> is the composer, the spotlight query and the focus-mode
 * pill; it is never unmounted and remounted, so the caret and any typed text
 * survive the morph.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { prefixLabel, SLASH, slashEntry, SLASH_STOP, type SlashActionName, type SlashCommand } from '../domain/slash';
import {
    RESERVED_PREFIXES,
    type ObjectRow as ObjectRowType,
    type ShellLayer,
    type SpotlightPrefix,
} from '../domain/workspace';

const props = defineProps<{
    layer: ShellLayer;
    focusMode: boolean;
    prefix: SpotlightPrefix | null;
    hint: boolean;
    busy: boolean;
    /** What the open prefix lists. The parent owns the data; this lists it. */
    rows: readonly ObjectRowType[];
}>();

const emit = defineEmits<{
    submit: [string];
    open: [string];
    command: [SpotlightPrefix];
    /** A slash command with no list of its own. Carries the entry's name,
     *  narrowed to the registry so the parent's handler map stays exhaustive. */
    action: [SlashActionName];
}>();

const text = ref('');
const input = ref<HTMLInputElement | null>(null);
const active = ref(0);

const state = computed(() =>
    props.layer === 'spotlight' ? 'spotlight' : props.focusMode ? 'pill' : 'rest',
);

// fs: and cmd: are still unfed — the project tree and the command list are
// data this app has no source for — so they show the same empty state they
// always did. /history has a source, and it arrives through the same door.
const source = computed(() => props.rows);

/** Typing filters. This is the whole point of the spotlight. */
const results = computed(() => {
    const q = text.value.trim().toLowerCase();
    if (!q) return source.value;
    return source.value.filter(
        (r) => r.label.toLowerCase().includes(q) || (r.meta ?? '').toLowerCase().includes(q),
    );
});

watch(results, () => (active.value = 0));

/**
 * Runs a slash command: one that names a list travels the field up to it, the
 * way `fs:` does; one that names none fires as an action and leaves the field
 * where it is. Which it is comes from the registry, so adding a command here
 * is adding a line to `domain/slash.ts`.
 */
function run(entry: SlashCommand) {
    text.value = '';
    if (entry.prefix) emit('command', entry.prefix);
    else emit('action', entry.name);
}

/**
 * A command fires as it is finished typing, on the whole name rather than on
 * the bare slash, so the field does not jump out from under a prompt that
 * merely starts with one.
 */
watch(text, (typed) => {
    if (state.value !== 'rest') return;
    const entry = slashEntry(typed);
    if (entry) run(entry);
});

// The field takes focus whenever it changes role, so it is always typeable.
watch(
    () => state.value,
    async (next) => {
        if (next === 'pill') return;
        if (next === 'spotlight') text.value = '';
        await nextTick();
        input.value?.focus();
    },
    { immediate: true },
);

function move(delta: number) {
    if (!results.value.length) return;
    active.value = (active.value + delta + results.value.length) % results.value.length;
}

function commit() {
    if (state.value === 'spotlight') {
        // The id, not the label: the parent owns these rows and is the only
        // side that knows what opening one means.
        const chosen = results.value[active.value];
        if (chosen) emit('open', chosen.id);
        return;
    }
    const prompt = text.value.trim();
    if (!prompt) return;

    // The watch above has normally fired already. Not always: text pasted and
    // submitted inside one tick arrives here untouched, and a command sent to
    // the ensemble as a question is a turn nobody asked for. The composer is
    // the last gate, so it is checked here too.
    const entry = slashEntry(prompt);
    if (entry) return run(entry);

    text.value = '';
    emit('submit', prompt);
}

/**
 * Emptied from outside when what was typed no longer belongs to the field —
 * starting a new chat is the case. The text lives here because the field is
 * never unmounted, so the parent cannot clear it by any other means.
 */
defineExpose({ clear: () => (text.value = '') });

/** Rest sits 24px off the bottom; spotlight anchors 18% down and grows from there. */
const y = computed(() => (state.value === 'spotlight' ? '18dvh' : 'calc(100dvh - 52px - 24px)'));
</script>

<template>
    <GlassPanel
        :variant="state === 'spotlight' ? 'spotlight' : 'panel'"
        class="fixed start-1/2 top-0 flex max-h-[60dvh] flex-col overflow-hidden [will-change:transform] transition-[transform,width,height,border-radius]"
        :class="[
            state === 'spotlight' ? 'z-50 w-[min(640px,100vw-32px)]' : 'z-30',
            state === 'pill' ? 'size-11 duration-[180ms] ease-collapse' : 'duration-[240ms] ease-morph',
            state === 'rest' && 'w-[min(720px,100vw-32px)]',
        ]"
        :style="{ transform: `translate(-50%, ${y})` }"
    >
        <div
            class="box-border flex shrink-0 items-center gap-3"
            :class="state === 'pill' ? 'h-[43px] justify-center' : 'h-[51px] px-4'"
        >
            <button
                v-if="state === 'rest'"
                type="button"
                class="shrink-0 rounded-chip bg-accent-18 px-2 py-[5px] font-mono text-12 font-medium leading-none text-accent"
                :title="busy ? SLASH_STOP.hint : 'Send to the ensemble'"
                @click="busy ? emit('action', SLASH_STOP.name) : commit()"
            >{{ busy ? SLASH_STOP.name : 'agent' }}</button>

            <span v-if="prefix && state === 'spotlight'" class="shrink-0 font-mono text-13 leading-none">
                {{ prefixLabel(prefix) }}
            </span>

            <!-- One input for every role the field plays. Hidden, not removed,
                 in the pill: unmounting it would lose whatever was typed. -->
            <input
                ref="input"
                v-model="text"
                type="text"
                :class="[
                    'min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-40',
                    state === 'spotlight' ? 'font-mono text-13' : 'text-13',
                    state === 'pill' && 'sr-only',
                ]"
                :placeholder="state === 'spotlight' ? '' : 'describe an edit'"
                :aria-label="state === 'spotlight' ? 'Search' : 'Message the ensemble'"
                autocomplete="off"
                spellcheck="false"
                @keydown.enter.prevent="commit"
                @keydown.down.prevent="move(1)"
                @keydown.up.prevent="move(-1)"
            >

            <span
                v-if="state === 'pill'"
                class="h-3.5 w-px shrink-0 bg-accent-60"
                aria-hidden="true"
            />
            <span v-if="state === 'rest' && !text" class="shrink-0 font-mono text-12 text-ink-40">⌥L</span>
        </div>

        <!-- Stills 2 and 4 are asymmetric on purpose: results wait for the
             travel on the way in, and leave immediately on the way out. -->
        <div v-if="state === 'spotlight'" class="results-in overflow-y-auto px-2 pb-3 [--row-px:--spacing(2)]">
            <template v-if="results.length">
                <ObjectRow
                    v-for="(row, i) in results"
                    :key="row.id"
                    :row="row"
                    :hint="hint"
                    :guide="prefix !== 'cmd'"
                    :select="i === active ? 'accent' : 'none'"
                    class="cursor-pointer"
                    @click="active = i; commit()"
                />
                <div v-if="prefix === 'cmd'" class="flex justify-between gap-3 px-3 pt-2 font-mono text-12 text-ink-30">
                    <span>{{ RESERVED_PREFIXES.join('  ') }}</span>
                    <span>not yet available</span>
                </div>
            </template>
            <div v-else-if="text" class="px-2 pb-2 font-mono text-13 text-ink-40">no match</div>
            <div v-else class="flex flex-col gap-1 px-2 pb-2">
                <p class="text-13 leading-snug text-ink-40">type to find a file</p>
                <p class="font-mono text-13 leading-snug text-ink-40">
                    fs:&nbsp; project tree&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; cmd:&nbsp; commands
                </p>
                <!-- The help panel is the registry, listed. A command that is
                     not in it cannot be typed, and one that is cannot go
                     undocumented here. -->
                <p
                    v-for="entry in SLASH"
                    :key="entry.name"
                    class="font-mono text-13 leading-snug text-ink-40"
                >
                    /{{ entry.name }}&nbsp; {{ entry.hint }}
                </p>
            </div>
        </div>
    </GlassPanel>
</template>
