import MarkdownIt from 'markdown-it';

/**
 * Markdown to HTML for the editor's rendered view.
 *
 * The source is a transcript: text three language models wrote from a prompt
 * the user typed. That makes this a trust boundary, and `v-html` on the other
 * side of it, so the renderer is configured never to emit HTML it did not
 * build itself:
 *
 * - `html: false` escapes every tag in the source instead of passing it
 *   through, so there is no raw-HTML channel to sanitise afterwards. Closing
 *   the hole at the parser is one setting; closing it downstream is a second
 *   library whose allow-list drifts out of step with the parser's output.
 * - markdown-it's default `validateLink` rejects `javascript:`, `vbscript:`,
 *   `file:` and non-image `data:` URLs, which covers the link vector that
 *   survives HTML escaping.
 *
 * Pure: no Vue, no DOM. The HTML is a string, which is what lets the hostile
 * input live in a colocated spec rather than in a browser test.
 */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

export function renderMarkdown(source: string): string {
    return md.render(source);
}
