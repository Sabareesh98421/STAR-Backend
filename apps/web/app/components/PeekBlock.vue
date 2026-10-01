<script setup lang="ts">
// Sheet A · BLOCK. Inline, 4% fill, 2px accent rail, radius 0. It pushes the
// code below it down rather than overlaying it, so nothing is hidden.
defineProps<{ caption: string }>();
defineEmits<{ adopt: []; dismiss: [] }>();
</script>

<template>
    <div class="box-border my-2 max-w-180 bg-ink-04 border-l-2 border-accent py-3 pe-3 ps-[34px]">
        <p class="font-mono text-12 leading-relaxed text-ink-40">{{ caption }}</p>
        <pre class="mt-1 overflow-x-auto font-mono text-13 text-ink-85"><slot /></pre>
        <div class="mt-2 flex justify-end gap-4 font-mono text-12 text-ink-40">
            <button type="button" class="hover:text-ink-85" @click="$emit('adopt')">
                Adopt <span class="text-ink-30">⌥↵</span>
            </button>
            <button type="button" class="hover:text-ink-85" @click="$emit('dismiss')">
                Dismiss <span class="text-ink-30">⌥⌫</span>
            </button>
        </div>
    </div>
</template>
