<script setup lang="ts">
// Sheet A · ROW. Five slots: glyph, label, meta 40%, shortcut 30%, action.
// The shortcut cell keeps its width while empty so the hint layer fills it in
// place instead of shoving the row sideways.
import type { ObjectRow } from '../domain/workspace';

withDefaults(
    defineProps<{
        row: ObjectRow;
        select?: 'none' | 'subtle' | 'accent';
        large?: boolean;
        hint?: boolean;
        /** fs: results draw 8% indent guides; the task tree does not. */
        guide?: boolean;
    }>(),
    { select: 'none', large: false, hint: false, guide: false },
);

// Padding and indent step are context-dependent in the design (rail flush,
// list 12, spotlight 8), so the parent sets them as CSS variables.
</script>

<template>
    <div
        class="flex items-center gap-3 box-border rounded-chip px-(--row-px) [--row-px:--spacing(3)] [--row-indent:16px]"
        :class="[
            large ? 'h-8' : 'h-7',
            select === 'subtle' && 'bg-ink-04',
            select === 'accent' && 'bg-accent-18',
            guide && row.depth && 'border-l border-ink-08 rounded-none ps-6',
        ]"
        :style="row.depth ? { marginInlineStart: `calc(${row.depth} * var(--row-indent))` } : undefined"
    >
        <StatusGlyph :name="row.marker" />
        <span
            class="flex-1 min-w-0 truncate text-13 leading-none"
            :class="[row.monoLabel && 'font-mono', row.marker === 'closed' ? 'text-ink-40' : 'text-ink-85']"
        >{{ row.label }}</span>
        <span v-if="row.meta" class="shrink-0 font-mono text-12 text-ink-40">{{ row.meta }}</span>
        <span class="w-14 shrink-0 text-end font-mono text-12 text-ink-30" aria-hidden="true">
            {{ hint ? (row.shortcut ?? '') : '' }}
        </span>
        <slot name="action" />
    </div>
</template>
