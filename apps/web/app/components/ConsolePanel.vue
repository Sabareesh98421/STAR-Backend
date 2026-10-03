<script setup lang="ts">
// z 35. Sits above the composer, left edges align, max-height 240.
import { CONSOLE_RUN } from '../domain/fixtures';
defineEmits<{ close: [] }>();
</script>

<template>
    <GlassPanel
        class="fixed start-1/2 bottom-[88px] z-[35] max-h-60 w-[min(720px,100vw-32px)] -translate-x-1/2 overflow-hidden p-4"
    >
        <div class="flex items-center font-mono text-12 text-ink-40">
            <span>{{ CONSOLE_RUN.command }}</span>
            <button type="button" class="ms-auto hover:text-ink-85" @click="$emit('close')">Esc</button>
        </div>
        <div class="mt-3 overflow-auto border-l-2 border-accent bg-ink-04 p-3 font-mono text-13 leading-5 text-ink-75">
            <div v-for="line in CONSOLE_RUN.output" :key="line.text" :class="line.dim && 'text-ink-40'">
                {{ line.text }}
            </div>
        </div>
    </GlassPanel>
</template>
