import { ref } from 'vue';
import { EDITOR_LINES, PEEK } from '../domain/fixtures';
import type { EditorLine, PeekEdit } from '../domain/workspace';

/**
 * The open file's contents.
 *
 * Adopt and Dismiss are the whole interaction the brief is built around: the
 * agent proposes beside you and never writes into your buffer, so adopting is
 * an explicit act that inserts the line, and dismissing drops it with no trace.
 */
export function useBuffer() {
    const lines = ref<EditorLine[]>(EDITOR_LINES.map((l) => ({ ...l })));
    const peek = ref<PeekEdit | null>({ ...PEEK });
    const dirty = ref(false);

    function renumber() {
        const first = lines.value[0]?.number ?? 1;
        lines.value.forEach((line, i) => (line.number = first + i));
    }

    function adopt() {
        const proposed = peek.value;
        if (!proposed) return null;
        const at = lines.value.findIndex((l) => l.number === proposed.afterLine);
        if (at === -1) return null;

        lines.value.splice(at + 1, 0, { number: 0, text: proposed.text, touched: true });
        renumber();
        peek.value = null;
        dirty.value = true;
        return proposed.text.trim();
    }

    function dismiss() {
        peek.value = null;
    }

    function editLine(number: number, text: string) {
        const line = lines.value.find((l) => l.number === number);
        if (!line || line.text === text) return;
        line.text = text;
        dirty.value = true;
    }

    return { lines, peek, dirty, adopt, dismiss, editLine, save: () => (dirty.value = false) };
}
