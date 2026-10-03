<script setup lang="ts">
// z 0. Full-bleed: the rail and the field float above it rather than shrinking
// it, which is how "the editor takes the whole width" and "static right panel"
// coexist.
import { OPEN_FILE } from '../domain/fixtures';
import type { EditorLine, PeekEdit } from '../domain/workspace';

defineProps<{ lines: EditorLine[]; peek: PeekEdit | null; dirty: boolean }>();
const emit = defineEmits<{ adopt: []; dismiss: []; edit: [number, string] }>();

function commit(event: FocusEvent, number: number) {
    emit('edit', number, (event.target as HTMLElement).innerText.replace(/\n$/, ''));
}
</script>

<template>
    <div class="absolute inset-0 overflow-y-auto overflow-x-hidden bg-surface pt-14 pb-40">
        <p class="absolute left-3 top-3 font-mono text-12 leading-none">
            <span class="text-ink-45">{{ OPEN_FILE.dir }}</span><span>{{ OPEN_FILE.name }}</span>
            <span v-if="dirty" class="ms-2 text-accent-60">●</span>
        </p>

        <!-- Long lines scroll inside the code block; the page never does. -->
        <div class="overflow-x-auto font-mono text-13 leading-[22px]">
            <template v-for="line in lines" :key="line.number">
                <div
                    class="relative flex gap-6 px-3"
                    :class="line.touched && 'before:absolute before:start-0 before:top-1.5 before:h-2.5 before:w-0.5 before:bg-ink-30 before:content-[\'\']'"
                >
                    <span class="w-6 shrink-0 select-none text-end text-ink-30">{{ line.number }}</span>
                    <span
                        class="min-w-0 flex-1 whitespace-pre text-ink-75 outline-none focus:bg-ink-04"
                        contenteditable="plaintext-only"
                        spellcheck="false"
                        @blur="commit($event, line.number)"
                        @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                    >{{ line.text }}</span>
                </div>
                <PeekBlock
                    v-if="peek && line.number === peek.afterLine"
                    :caption="peek.caption"
                    @adopt="emit('adopt')"
                    @dismiss="emit('dismiss')"
                >{{ peek.text }}</PeekBlock>
            </template>
        </div>
    </div>
</template>
