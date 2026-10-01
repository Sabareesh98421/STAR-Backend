<script setup lang="ts">
// z 40. Sheet A shows exactly one instance: a dot, a message, the shortcut.
defineProps<{ message: string | null }>();
</script>

<template>
    <Transition
        enter-active-class="transition duration-[180ms] ease-collapse"
        leave-active-class="transition duration-[180ms] ease-collapse"
        enter-from-class="opacity-0 -translate-y-1.5"
        leave-to-class="opacity-0 -translate-y-1.5"
    >
        <GlassPanel
            v-if="message"
            class="fixed end-6 top-6 z-40 flex w-65 max-w-[calc(100vw-48px)] items-center gap-3 px-4 py-3"
            role="status"
            aria-live="polite"
        >
            <span class="size-1.5 shrink-0 rounded-full bg-accent" />
            <span class="text-13 leading-snug">{{ message }}</span>
            <span class="ms-auto font-mono text-12 text-ink-40">⌘S</span>
        </GlassPanel>
    </Transition>
</template>
