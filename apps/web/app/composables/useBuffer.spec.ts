import { expect, test } from '@playwright/test';
import { useBuffer } from './useBuffer';

const TRANSCRIPT = '# prompt\n\n### chatgpt\n\nfirst answer\n\n### claude\n\nsecond answer';

test('the gutter numbers logical lines, not visual rows', () => {
    // The editor wraps prose, so one transcript line can occupy three rows on
    // screen. If the gutter were ever built from what is visible, "line 42"
    // would mean a different line at every window width, and the numbers would
    // stop matching the file the user is about to save.
    const buffer = useBuffer();
    const long = 'x '.repeat(400).trim();
    buffer.open('run.md', `short\n${long}\nlast`);

    expect(buffer.lines.value.map((l) => l.number)).toEqual([1, 2, 3]);
    expect(buffer.lines.value[1]?.text).toBe(long);
    expect(buffer.lines.value.at(-1)?.text).toBe('last');
});

test('a trailing newline keeps its empty last line', () => {
    // The textarea shows a caret on that line, so dropping it from the gutter
    // would leave the last row of the file unnumbered.
    const buffer = useBuffer();
    buffer.open('run.md', 'a\n');
    expect(buffer.lines.value).toHaveLength(2);
});

test('editing marks the buffer dirty; an identical value does not', () => {
    // The dot beside the filename is the only signal that there is unsaved
    // work. A textarea fires input for keys that change nothing (a dead key,
    // an IME commit of the same text), and a dot that appears on its own
    // teaches the user to ignore it.
    const buffer = useBuffer();
    buffer.open('run.md', TRANSCRIPT);
    expect(buffer.dirty.value).toBe(false);

    buffer.edit(TRANSCRIPT);
    expect(buffer.dirty.value).toBe(false);

    buffer.edit(`${TRANSCRIPT}\n\nmine`);
    expect(buffer.dirty.value).toBe(true);
    expect(buffer.lines.value.at(-1)?.text).toBe('mine');

    buffer.save();
    expect(buffer.dirty.value).toBe(false);
});

test('opening a file replaces the buffer and clears the dirty marker', () => {
    const buffer = useBuffer();
    buffer.open('a.md', 'one');
    buffer.edit('one edited');
    buffer.open('b.md', 'two');

    expect(buffer.name.value).toBe('b.md');
    expect(buffer.text.value).toBe('two');
    expect(buffer.dirty.value).toBe(false);
});

test('adopt inserts directly after the line the peek was raised against', () => {
    // The agent proposes beside the buffer and never writes into it, so adopt
    // is the single moment proposed text becomes the user's. Landing it one
    // line off puts a model's sentence inside someone else's paragraph.
    const buffer = useBuffer();
    buffer.open('run.md', 'a\nb\nc');
    buffer.peek.value = { afterLine: 2, caption: 'claude', text: 'proposed' };

    expect(buffer.adopt()).toBe('proposed');
    expect(buffer.text.value).toBe('a\nb\nproposed\nc');
    expect(buffer.lines.value.map((l) => l.number)).toEqual([1, 2, 3, 4]);
    expect(buffer.lines.value[2]?.touched).toBe(true);
    expect(buffer.dirty.value).toBe(true);
    expect(buffer.peek.value).toBeNull();
});

test('adopt at the last line appends rather than refusing', () => {
    const buffer = useBuffer();
    buffer.open('run.md', 'a\nb');
    buffer.peek.value = { afterLine: 2, caption: 'claude', text: 'proposed' };

    expect(buffer.adopt()).toBe('proposed');
    expect(buffer.text.value).toBe('a\nb\nproposed');
});

test('adopt against a line that no longer exists changes nothing', () => {
    // The user can delete the line a peek was raised against while it is up.
    const buffer = useBuffer();
    buffer.open('run.md', 'a\nb\nc');
    buffer.peek.value = { afterLine: 9, caption: 'claude', text: 'proposed' };

    expect(buffer.adopt()).toBeNull();
    expect(buffer.text.value).toBe('a\nb\nc');
});

test('dismiss drops the proposal with no trace in the buffer', () => {
    const buffer = useBuffer();
    buffer.open('run.md', 'a\nb');
    buffer.peek.value = { afterLine: 1, caption: 'claude', text: 'proposed' };
    buffer.dismiss();

    expect(buffer.peek.value).toBeNull();
    expect(buffer.text.value).toBe('a\nb');
    expect(buffer.dirty.value).toBe(false);
});

test('an earlier adopt pushes an existing tick down with its line', () => {
    const buffer = useBuffer();
    buffer.open('run.md', 'a\nb\nc');
    buffer.peek.value = { afterLine: 2, caption: 'claude', text: 'second' };
    buffer.adopt();
    buffer.peek.value = { afterLine: 1, caption: 'claude', text: 'first' };
    buffer.adopt();

    // 'second' was line 3, 'first' lands at line 2, so 'second' is now line 4.
    expect(buffer.text.value).toBe('a\nfirst\nb\nsecond\nc');
    expect(buffer.lines.value.filter((l) => l.touched).map((l) => l.number)).toEqual([2, 4]);
});

test('close empties the buffer, so a new chat does not inherit the last one\'s file', () => {
    const buffer = useBuffer();
    buffer.open('run.md', 'one\ntwo');
    buffer.edit('one\ntwo\nthree');
    buffer.peek.value = { afterLine: 1, caption: 'from the run', text: 'proposed' };

    buffer.close();

    expect(buffer.name.value).toBe(null);
    expect(buffer.text.value).toBe('');
    expect(buffer.dirty.value).toBe(false);
    // The peek belonged to the run being left; answering it against an empty
    // buffer would adopt a line into a file that is no longer open.
    expect(buffer.peek.value).toBe(null);
});

test('opening a file clears the peek the previous file left behind', () => {
    const buffer = useBuffer();
    buffer.open('first.md', 'a\nb');
    buffer.peek.value = { afterLine: 2, caption: 'from the run', text: 'proposed' };

    buffer.open('second.md', 'x');

    expect(buffer.peek.value).toBe(null);
    expect(buffer.dirty.value).toBe(false);
    expect(buffer.name.value).toBe('second.md');
});
