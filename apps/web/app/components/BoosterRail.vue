<script setup lang="ts">
// z 20. Overlays the right edge; never resizes the editor.
//
// Focus mode is the structural point of this panel: the Task Tracker survives,
// everything retrospective collapses. Two panels sharing one position.
import { CHAT_HISTORY, CONTEXT, CUSTOM_INSTRUCTIONS, REVIEW, TASKS } from '../domain/fixtures';
import type { Agent, AgentRuntime, LinkState, Review, RunStatus } from '../domain/run';

defineProps<{
    focusMode: boolean;
    goLive: boolean;
    hint: boolean;
    agents: Record<string, Agent>;
    runtime: Record<string, AgentRuntime>;
    reviews: Review[];
    status: RunStatus;
    link: LinkState;
    leaderNote: string | null;
}>();
defineEmits<{ 'toggle-go-live': []; 'execute-review': [] }>();

// Rail rows sit flush against the panel padding; the task tree indents by 24.
const RAIL_ROWS = '[--row-px:0px] [--row-indent:--spacing(6)]';
</script>

<template>
    <aside
        class="absolute inset-y-0 end-0 z-20 box-border flex flex-col overflow-y-auto border-s border-ink-12 bg-ink-08 px-4 py-6 shadow-rail backdrop-blur-glass transition-[width] duration-[180ms] ease-collapse"
        :class="focusMode ? 'w-55 gap-2' : 'w-90 gap-8'"
    >
        <section class="flex flex-col gap-2" :class="RAIL_ROWS">
            <h2 class="font-mono text-12 font-normal leading-none text-ink-40">Task Tracker</h2>
            <ObjectRow v-for="row in TASKS" :key="row.id" :row="row" :hint="hint" />
        </section>

        <!-- The brief makes the task tracker and the agent threads the two
             mandatory, non-collapsible sections, so both outlive focus mode. -->
        <AgentThreads
            :agents="agents"
            :runtime="runtime"
            :reviews="reviews"
            :status="status"
            :link="link"
            :leader-note="leaderNote"
            :hint="hint"
        />

        <template v-if="!focusMode">
            <!-- Frame 3's rail carries only Task Tracker, Context, Go-Live and
                 the pinned Review. Retrospective sections stand down so the
                 review has room. -->
            <section v-if="!goLive" class="flex flex-col gap-2" :class="RAIL_ROWS">
                <h2 class="font-mono text-12 font-normal leading-none text-ink-40">Chat History</h2>
                <ObjectRow v-for="row in CHAT_HISTORY" :key="row.id" :row="row" :hint="hint" />
            </section>

            <section class="flex flex-col gap-2" :class="RAIL_ROWS">
                <h2 class="font-mono text-12 font-normal leading-none text-ink-40">Context</h2>
                <ObjectRow v-for="row in CONTEXT" :key="row.id" :row="row" :hint="hint" />
            </section>

            <section v-if="!goLive" class="flex flex-col gap-2">
                <h2 class="font-mono text-12 font-normal leading-none text-ink-40">Custom Instructions</h2>
                <p class="text-13 leading-5 text-ink-85">{{ CUSTOM_INSTRUCTIONS }}</p>
            </section>

            <div class="flex flex-col gap-1">
                <button
                    type="button"
                    class="flex h-8 items-center gap-3"
                    :aria-pressed="goLive"
                    @click="$emit('toggle-go-live')"
                >
                    <span
                        class="relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-[180ms] ease-collapse"
                        :class="goLive ? 'bg-accent-40' : 'bg-ink-18'"
                    >
                        <span
                            class="absolute start-0.5 top-0.5 size-3.5 rounded-full transition duration-[180ms] ease-collapse"
                            :class="goLive ? 'translate-x-3.5 bg-accent' : 'bg-ink-40'"
                        />
                    </span>
                    <span class="text-13 leading-none">Go-Live</span>
                </button>
                <p class="ps-11 font-mono text-12 leading-none text-ink-40">
                    Reviews on save · build · commit
                </p>
            </div>

            <section v-if="goLive" class="mt-auto flex flex-col gap-2" :class="RAIL_ROWS">
                <h2 class="font-mono text-12 font-normal leading-none text-ink-40">
                    Review · {{ REVIEW.commit }}
                </h2>
                <div v-for="f in REVIEW.findings" :key="f.id" class="flex flex-col gap-0.5 py-1">
                    <div class="flex items-center gap-3">
                        <StatusGlyph :name="f.marker" />
                        <span class="text-13 leading-none">{{ f.title }}</span>
                    </div>
                    <p class="ps-6 font-mono text-12 leading-none text-ink-40">{{ f.origin }}</p>
                </div>
                <ObjectRow
                    :row="{ id: 'closed', marker: 'closed', label: `${REVIEW.closedCount} closed`, meta: null, shortcut: null }"
                    :hint="hint"
                />
                <button
                    type="button"
                    class="mt-2 flex h-8 items-center justify-between rounded-chip bg-accent-18 px-3"
                    @click="$emit('execute-review')"
                >
                    <span class="text-13 font-medium text-accent">Execute review</span>
                    <span class="font-mono text-12 text-accent-60">⌥R</span>
                </button>
            </section>
        </template>
    </aside>
</template>
