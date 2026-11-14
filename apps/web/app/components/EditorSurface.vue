<script setup lang="ts">
// z 0. Full-bleed: the rail and the field float above it rather than shrinking
// it, which is how "the editor takes the whole width" and "static right panel"
// coexist.
//
// The editing surface is one `<textarea>`. Selection across lines, multi-line
// copy/paste, undo/redo, arrow keys and IME are the platform's job, and a span
// per line with a blur handler had none of them.
//
// The gutter stays aligned with wrapped lines without measuring anything: a
// hidden mirror of the text, laid out at exactly the textarea's font, width and
// wrapping rules, gives each logical line a row as tall as the textarea wraps
// it to. The textarea is absolutely positioned over that mirror's text column
// and is as tall as its own content, so the shared parent is the only thing
// that scrolls — there is no gutter scroll position to sync, and nothing to
// drift.
import { computed } from 'vue';
import { renderMarkdown } from '../domain/markdown';
import type { EditorLine, PeekEdit } from '../domain/workspace';

const props = defineProps<{
    text: string;
    lines: EditorLine[];
    peek: PeekEdit | null;
    dirty: boolean;
    name: string | null;
    rendered: boolean;
}>();
const emit = defineEmits<{ adopt: []; dismiss: []; edit: [string]; 'toggle-rendered': [] }>();

// Only while the rendered view is up: parsing a 240-line transcript on every
// keystroke of the raw view would be work nobody is looking at.
const html = computed(() => (props.rendered ? renderMarkdown(props.text) : ''));
</script>

<template>
    <div class="absolute inset-0 overflow-y-auto overflow-x-hidden bg-surface pb-40">
        <header class="sticky top-0 z-10 flex h-14 items-center gap-6 bg-surface px-3">
            <p v-if="name" class="font-mono text-12 leading-none">
                <span>{{ name }}</span>
                <span v-if="dirty" class="ms-2 text-accent-60">●</span>
            </p>

            <!-- Same control as the rail's Go-Live switch, same shortcut hint
                 idiom; a second kind of toggle would read as a second system. -->
            <button
                type="button"
                class="flex h-8 items-center gap-3"
                :aria-pressed="rendered"
                @click="emit('toggle-rendered')"
            >
                <span
                    class="relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-[180ms] ease-collapse"
                    :class="rendered ? 'bg-accent-40' : 'bg-ink-18'"
                >
                    <span
                        class="absolute start-0.5 top-0.5 size-3.5 rounded-full transition duration-[180ms] ease-collapse"
                        :class="rendered ? 'translate-x-3.5 bg-accent' : 'bg-ink-40'"
                    />
                </span>
                <span class="text-13 leading-none">Rendered</span>
                <span class="font-mono text-12 text-ink-30">⌥M</span>
            </button>
        </header>

        <p v-if="!text" class="px-3 font-mono text-13 text-ink-30">
            no file open · send a prompt to the ensemble and its transcript opens here
        </p>

        <div v-else-if="rendered" class="md max-w-180 px-3" v-html="html" />

        <!-- Prose wraps. Nothing here scrolls sideways, so the horizontal
             scrollbar the long transcript lines used to produce is gone. -->
        <div v-else class="relative font-mono text-13 leading-[22px]">
            <div aria-hidden="true" class="flex flex-col select-none px-3">
                <div
                    v-for="line in lines"
                    :key="line.number"
                    class="relative flex gap-6"
                    :class="line.touched && 'before:absolute before:start-0 before:top-1.5 before:h-2.5 before:w-0.5 before:bg-ink-30 before:content-[\'\']'"
                >
                    <span class="w-6 shrink-0 text-end text-ink-30">{{ line.number }}</span>
                    <!-- Invisible, not absent: this is what gives the number
                         beside it the height of the wrapped line. -->
                    <span class="invisible min-w-0 flex-1 break-words whitespace-pre-wrap">{{ line.text || ' ' }}</span>
                </div>
            </div>

            <!-- start-15 = px-3 + the w-6 gutter + gap-6, so the textarea's text
                 box is the mirror's text box to the pixel. -->
            <textarea
                :value="text"
                :aria-label="name ?? 'buffer'"
                class="absolute inset-y-0 end-3 start-15 resize-none appearance-none overflow-hidden border-0 bg-transparent p-0 font-mono text-13 leading-[22px] break-words whitespace-pre-wrap text-ink-75 outline-none"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                @input="emit('edit', ($event.target as HTMLTextAreaElement).value)"
            />
        </div>

        <!-- ponytail: the peek sits under the text rather than inline after its
             line. One textarea cannot have a DOM block spliced into its middle,
             and two textareas would cost exactly the cross-line selection and
             undo this change was for. The line it applies to is named in the
             caption instead. Upgrade path: a second scroll-synced overlay, once
             something actually raises a peek — nothing does yet. -->
        <PeekBlock
            v-if="peek"
            :caption="`${peek.caption} · after line ${peek.afterLine}`"
            @adopt="emit('adopt')"
            @dismiss="emit('dismiss')"
        >{{ peek.text }}</PeekBlock>
    </div>
</template>

<style scoped>
/* The rendered view. markdown-it emits plain semantic HTML and Tailwind's
   preflight strips headings and lists back to nothing, so the handful of
   elements a transcript actually uses are restated here from the same tokens
   as the rest of the surface. No typography plugin for eight selectors. */
.md {
    color: var(--color-ink-85);
    line-height: 1.6;
}

.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
    margin: 1.5rem 0 0.5rem;
    font-family: var(--font-mono);
    font-weight: 500;
    line-height: 1.3;
}

.md :deep(h1) {
    font-size: var(--text-16);
}

.md :deep(h2) {
    font-size: var(--text-13);
    color: var(--color-ink-45);
}

/* `### model name` is the transcript's own structure; the accent marks it. */
.md :deep(h3),
.md :deep(h4) {
    font-size: var(--text-13);
    color: var(--color-accent);
}

.md :deep(p),
.md :deep(ul),
.md :deep(ol),
.md :deep(blockquote) {
    margin: 0.5rem 0;
}

.md :deep(ul),
.md :deep(ol) {
    padding-inline-start: 1.5rem;
}

.md :deep(ul) {
    list-style: disc;
}

.md :deep(ol) {
    list-style: decimal;
}

.md :deep(a) {
    color: var(--color-accent);
    text-decoration: underline;
}

.md :deep(strong) {
    font-weight: 500;
}

.md :deep(em) {
    font-style: italic;
}

.md :deep(code) {
    padding: 0 0.25em;
    background: var(--color-ink-04);
    font-family: var(--font-mono);
    font-size: var(--text-12);
}

.md :deep(pre) {
    margin: 0.75rem 0;
    overflow-x: auto;
    border-inline-start: 2px solid var(--color-ink-12);
    background: var(--color-ink-04);
    padding: 0.75rem;
}

.md :deep(pre code) {
    padding: 0;
    background: none;
}

.md :deep(blockquote) {
    border-inline-start: 2px solid var(--color-ink-12);
    padding-inline-start: 0.75rem;
    color: var(--color-ink-45);
}

.md :deep(hr) {
    margin: 1.5rem 0;
    border: 0;
    border-top: 1px solid var(--color-ink-12);
}

.md :deep(table) {
    border-collapse: collapse;
}

.md :deep(th),
.md :deep(td) {
    border: 1px solid var(--color-ink-12);
    padding: 0.25rem 0.5rem;
    text-align: start;
}
</style>
