<script setup lang="ts">
import { computed } from 'vue';
import { MARKERS, type MarkerName } from '../domain/workspace';

const props = defineProps<{ name: MarkerName; label?: string }>();

const TONE = {
    accent: 'text-accent',
    'accent-60': 'text-accent-60',
    'ink-18': 'text-ink-18',
    'ink-30': 'text-ink-30',
} as const;

const marker = computed(() => MARKERS[props.name]);
</script>

<template>
    <span
        class="w-3 shrink-0 font-mono text-12 leading-none"
        :class="TONE[marker.tone]"
        role="img"
        :aria-label="label ?? name"
    >{{ marker.glyph }}</span>
</template>
