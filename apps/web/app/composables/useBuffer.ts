import { computed, ref } from 'vue';
import type { EditorLine, PeekEdit } from '../domain/workspace';

/**
 * The open file's contents.
 *
 * One string, not a list of lines. The editor is a `<textarea>`, so the
 * platform owns selection, multi-line copy/paste, undo and caret movement, and
 * the buffer only has to hold what the platform hands back. `lines` is derived
 * for the gutter; it is a view of the text, never a second copy of it.
 *
 * Starts empty. Nothing is seeded here: a buffer with sample code in it looks
 * exactly like a buffer with a real file in it, which is the whole reason the
 * fixtures had to go.
 *
 * Adopt and Dismiss are the interaction the brief is built around: the agent
 * proposes beside you and never writes into your buffer, so adopting is an
 * explicit act that inserts the line, and dismissing drops it with no trace.
 */
export function useBuffer() {
    const text = ref('');
    const peek = ref<PeekEdit | null>(null);
    const dirty = ref(false);
    /** Null when no file is open, which is the state the app starts in. */
    const name = ref<string | null>(null);
    /** Line numbers an adopt inserted, for the design's 2px left tick. */
    const touched = ref<ReadonlySet<number>>(new Set());

    /**
     * The gutter: one entry per *logical* line. A line that wraps to three
     * visual rows is still one number here, because a number per visual row
     * would stop meaning "line 42" the moment the window narrowed.
     *
     * ponytail: rebuilt whole per keystroke, and EditorSurface's mirror draws
     * two nodes per entry — N objects and 2N node diffs per character. Free at
     * transcript sizes (200-400 lines), ceiling ~1-2k. Upgrade path: virtualize
     * the mirror to the scroll window.
     */
    const lines = computed<EditorLine[]>(() =>
        text.value.split('\n').map((line, i) => ({
            number: i + 1,
            text: line,
            touched: touched.value.has(i + 1),
        })),
    );

    /**
     * Back to no file open — the state the app starts in.
     *
     * Starting a new conversation needs this: the transcript on screen belongs
     * to the conversation being left, and so do its unsaved edits, its adopt
     * ticks and any peek still waiting to be answered. Left in place they
     * offer a brand new chat the previous chat's file, and reloading the page
     * was the only way to be rid of it.
     *
     * Nothing is lost that cannot be got back — a transcript is stored, and
     * reopening the turn in the rail opens the same file again.
     */
    function close() {
        text.value = '';
        name.value = null;
        peek.value = null;
        touched.value = new Set();
        dirty.value = false;
    }

    /**
     * Replace the buffer with a file. Used by a finished run, whose transcript
     * is the file the editor opens.
     *
     * Everything resets first, `dirty` included: the buffer now matches what it
     * was handed, and leaving the marker on would claim unsaved edits that were
     * never made — or leave a peek pointing at a line of the previous file.
     */
    function open(fileName: string, contents: string) {
        close();
        text.value = contents;
        name.value = fileName;
    }

    /** The whole text, as the textarea reports it after any edit. */
    function edit(next: string) {
        if (next === text.value) return;
        text.value = next;
        dirty.value = true;
    }

    function adopt() {
        const proposed = peek.value;
        if (!proposed) return null;
        const split = text.value.split('\n');
        if (proposed.afterLine < 1 || proposed.afterLine > split.length) return null;

        split.splice(proposed.afterLine, 0, proposed.text);
        text.value = split.join('\n');
        // Everything below the insertion moved down one, ticks included.
        touched.value = new Set(
            [...touched.value].map((n) => (n > proposed.afterLine ? n + 1 : n)),
        ).add(proposed.afterLine + 1);
        peek.value = null;
        dirty.value = true;
        return proposed.text.trim();
    }

    function dismiss() {
        peek.value = null;
    }

    return { text, lines, peek, dirty, name, open, close, edit, adopt, dismiss, save: () => (dirty.value = false) };
}
