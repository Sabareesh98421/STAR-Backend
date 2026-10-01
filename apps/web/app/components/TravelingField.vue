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
import { COMMANDS, FILE_TREE } from '../domain/fixtures';
import { RESERVED_PREFIXES, type ShellLayer, type SpotlightPrefix } from '../domain/workspace';

const props = defineProps<{
    layer: ShellLayer;
    focusMode: boolean;
    prefix: SpotlightPrefix | null;
    hint: boolean;
    busy: boolean;
}>();

const emit = defineEmits<{ submit: [string]; open: [string]; cancel: [] }>();

const text = ref('');
const input = ref<HTMLInputElement | null>(null);
const active = ref(0);

const state = computed(() =>
    props.layer === 'spotlight' ? 'spotlight' : props.focusMode ? 'pill' : 'rest',
);

const source = computed(() =>
    props.prefix === 'fs' ? FILE_TREE : props.prefix === 'cmd' ? COMMANDS : [],
);

/** Typing filters. This is the whole point of the spotlight. */
const results = computed(() => {
    const q = text.value.trim().toLowerCase();
    if (!q) return source.value;
    return source.value.filter(
        (r) => r.label.toLowerCase().includes(q) || (r.meta ?? '').toLowerCase().includes(q),
    );
});

watch(results, () => (active.value = 0));

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
        const chosen = results.value[active.value];
        if (chosen) emit('open', chosen.label);
        return;
    }
    const prompt = text.value.trim();
    if (!prompt) return;
    text.value = '';
    emit('submit', prompt);
}

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
                :title="busy ? 'Cancel the run' : 'Send to the ensemble'"
                @click="busy ? emit('cancel') : commit()"
            >{{ busy ? 'stop' : 'agent' }}</button>

            <span v-if="prefix && state === 'spotlight'" class="shrink-0 font-mono text-13 leading-none">
                {{ prefix }}:
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
                    :guide="prefix === 'fs'"
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
            </div>
        </div>
    </GlassPanel>
</template>
