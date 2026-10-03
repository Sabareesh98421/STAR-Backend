<script setup lang="ts">
// Sheet A · PANEL. Base glass is blur 24 / fill 8% / 12% top hairline.
// The refractive 40% edge and blur 40 belong to the spotlight alone.
withDefaults(defineProps<{ variant?: 'panel' | 'spotlight' }>(), { variant: 'panel' });
</script>

<template>
    <div
        class="box-border bg-ink-08 border-t rounded-panel [will-change:backdrop-filter]"
        :class="
            variant === 'spotlight'
                ? 'backdrop-blur-spot border-ink-40 shadow-spot'
                : 'backdrop-blur-glass border-ink-12 shadow-panel'
        "
    >
        <slot />
    </div>
</template>
