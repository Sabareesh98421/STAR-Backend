import { expect, test } from '@playwright/test';
import { renderMarkdown } from './markdown';

/**
 * The rendered view hands this function's output to `v-html`. The source is a
 * transcript written by three language models from a prompt the user typed, so
 * if any of these cases ever produce live markup, a prompt-injected payload in
 * a model's answer runs in the researcher's session. Every case below is an
 * injection that works against a markdown renderer left on its defaults.
 */

const HOSTILE = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<div onclick="alert(1)">hi</div>',
    '<svg><animate onbegin=alert(1) attributeName=x />',
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](java\tscript:alert(1))',
    '[x](&#106;avascript:alert(1))',
    '[x](vbscript:msgbox(1))',
    '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '![x](javascript:alert(1))',
    '<javascript:alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '[x]: javascript:alert(1)\n\n[x]',
];

/**
 * The real tags in the output, which is a different thing from the text that
 * merely looks like one: `&lt;img onerror=…&gt;` is escaped and inert, and an
 * assertion over the whole string cannot tell the two apart.
 */
const tagsIn = (html: string) => html.match(/<[^>]*>/g) ?? [];

test('no hostile source produces a script tag, an iframe or an event handler', () => {
    for (const source of HOSTILE) {
        for (const tag of tagsIn(renderMarkdown(source))) {
            expect(tag, source).not.toMatch(/^<\s*\/?\s*(script|iframe|object|embed|svg|animate|style)/i);
            expect(tag, source).not.toMatch(/\son\w+\s*=/i);
        }
    }
});

test('no hostile source produces a scripting URL in an href or src', () => {
    for (const source of HOSTILE) {
        for (const tag of tagsIn(renderMarkdown(source))) {
            expect(tag, source).not.toMatch(/(href|src)\s*=\s*["']?\s*(javascript|vbscript|data):/i);
        }
    }
});

test('raw HTML is escaped rather than dropped, so the text is still readable', () => {
    // Dropping it would silently rewrite a model's answer; escaping shows the
    // reader exactly what the model wrote.
    expect(renderMarkdown('<script>alert(1)</script>')).toContain('&lt;script&gt;');
});

test('the structure a transcript is actually made of still renders', () => {
    // A renderer that escaped everything would pass the tests above and be
    // useless, so the safe path has to still produce the headings the
    // transcript uses to separate models, and links on ordinary URLs.
    const html = renderMarkdown('# run\n\n### chatgpt\n\n- a\n\n`x` **b** [l](https://example.com)');

    expect(html).toContain('<h1>run</h1>');
    expect(html).toContain('<h3>chatgpt</h3>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<code>x</code>');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<a href="https://example.com">l</a>');
});
