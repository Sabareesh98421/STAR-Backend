<script setup lang="ts">
// Frames 1-3 of Sheet B are one screen in three states: default, focus mode
// (⌥⇧F), and go-live. The shell holds that state; the layers read it.
//
// The ensemble is the part the wireframes do not cover. It renders through the
// primitives they do define: Sheet A lists "agent thread" as a ROW.
import { computed } from 'vue';

const shell = useShell();
const buffer = useBuffer();
const run = useRun();

const busy = computed(() =>
    ['responding', 'reviewing', 'synthesizing'].includes(run.status.value),
);

function submit(prompt: string) {
    void run.start(prompt);
}

function adopt() {
    const line = buffer.adopt();
    if (line) shell.showToast(`Adopted into ${'Cache.ts'}`);
}
</script>

<template>
    <UApp>
        <div class="fixed inset-0 overflow-hidden bg-bg">
            <EditorSurface
                :lines="buffer.lines.value"
                :peek="buffer.peek.value"
                :dirty="buffer.dirty.value"
                @adopt="adopt"
                @dismiss="buffer.dismiss()"
                @edit="buffer.editLine"
            />

            <BoosterRail
                :focus-mode="shell.focusMode.value"
                :go-live="shell.goLive.value"
                :hint="shell.hintHeld.value"
                :agents="run.agents.value"
                :runtime="run.runtime.value"
                :reviews="run.reviews.value"
                :status="run.status.value"
                :link="run.link.value"
                :leader-note="run.leaderNote.value"
                @toggle-go-live="shell.goLive.value = !shell.goLive.value"
                @execute-review="shell.runConsole()"
            />

            <ConsolePanel v-if="shell.layer.value === 'console'" @close="shell.rest()" />

            <TravelingField
                :layer="shell.layer.value"
                :focus-mode="shell.focusMode.value"
                :prefix="shell.spotlightPrefix.value"
                :hint="shell.hintHeld.value"
                :busy="busy"
                @submit="submit"
                @cancel="run.cancel()"
                @open="shell.rest()"
            />

            <ToastStack :message="shell.toast.value" />

            <p class="sr-only">
                Control P opens spotlight. Alt Shift F toggles focus mode. Hold Alt to reveal shortcuts.
            </p>
        </div>
    </UApp>
</template>
