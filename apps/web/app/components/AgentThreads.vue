<script setup lang="ts">
/**
 * Sheet A lists "agent thread" as a ROW instance, so N participants are N
 * rows. Nothing here reads a count: the list is whatever the run reports.
 *
 * Peer review renders as findings attached to the agent that was reviewed,
 * never as a reply or a score, because it is review and not debate.
 */
import { computed } from 'vue';
import { PHASE_MARKER, phaseLabel, type Agent, type AgentRuntime, type Review } from '../domain/run';
import type { RunStatus, LinkState } from '../domain/run';

const props = defineProps<{
    agents: Record<string, Agent>;
    runtime: Record<string, AgentRuntime>;
    reviews: Review[];
    status: RunStatus;
    link: LinkState;
    leaderNote: string | null;
    hint: boolean;
}>();

const rows = computed(() =>
    Object.values(props.agents).map((agent) => {
        const rt = props.runtime[agent.id] ?? {
            phase: 'waiting' as const,
            reviewsGiven: 0,
            reviewsReceived: 0,
        };
        return {
            agent,
            row: {
                id: agent.id,
                marker: PHASE_MARKER[rt.phase],
                label: agent.name,
                meta: agent.isLeader && props.leaderNote ? props.leaderNote : phaseLabel(rt),
                shortcut: null,
                monoLabel: true,
            },
        };
    }),
);

/** Findings written about one agent, so they read as annotation on its answer. */
const findingsFor = (agentId: string) => props.reviews.filter((r) => r.aboutAgentId === agentId);
</script>

<template>
    <section v-if="rows.length" class="flex flex-col gap-2 [--row-px:0px]">
        <h2 class="flex items-center gap-2 font-mono text-12 font-normal leading-none text-ink-40">
            <span>Agent Threads</span>
            <span class="ms-auto">{{ status }}</span>
            <!-- The link is reported next to the run, never as the run. -->
            <span v-if="link !== 'live'" class="text-accent-60">{{ link }}</span>
        </h2>

        <div v-for="{ agent, row } in rows" :key="agent.id" class="flex flex-col">
            <ObjectRow :row="row" :hint="hint" />
            <p
                v-for="f in findingsFor(agent.id)"
                :key="f.id"
                class="ps-6 font-mono text-12 leading-relaxed text-ink-40"
            >
                {{ f.kind }} · {{ f.note }}
                <span class="text-ink-30">— {{ agents[f.byAgentId]?.name }}</span>
            </p>
        </div>
    </section>
</template>
