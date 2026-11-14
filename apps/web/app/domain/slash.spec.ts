import { expect, test } from '@playwright/test';
import {
    prefixLabel,
    SLASH,
    SLASH_HISTORY,
    SLASH_NEW,
    SLASH_STOP,
    slashEntry,
    slashRow,
    slashRowAction,
} from './slash';

test('a command is recognised by its whole name, never by a bare slash', () => {
    expect(slashEntry('/history')).toBe(SLASH_HISTORY);
    expect(slashEntry(' /history ')).toBe(SLASH_HISTORY);
    expect(slashEntry('/new')).toBe(SLASH_NEW);
    // A prompt that merely starts with a slash is still a prompt.
    expect(slashEntry('/')).toBeNull();
    expect(slashEntry('/hist')).toBeNull();
    expect(slashEntry('/newsletter')).toBeNull();
    expect(slashEntry('/new chat about caching')).toBeNull();
    expect(slashEntry('history')).toBeNull();
});

test('every entry is either a list to travel to or an action, never both', () => {
    // An action with a prefix would open a spotlight no handler closes; a
    // command without one would silently do nothing when typed.
    for (const entry of SLASH) {
        expect(entry.name).toMatch(/^\w+$/);
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.hint.length).toBeGreaterThan(0);
    }
    expect(SLASH.filter((entry) => entry.prefix === null)).toEqual([SLASH_NEW, SLASH_STOP]);
});

test('an action row round-trips to the name the app binds a handler to', () => {
    // The spotlight hands back a row id and nothing else, so an id that does
    // not resolve back to its entry is an action nothing can run.
    for (const entry of SLASH.filter((candidate) => candidate.prefix === null)) {
        expect(slashRowAction(slashRow(entry).id)).toBe(entry.name);
    }
    // A command that names a LIST is not an action: it travels the field, and
    // the app binds no handler to it. Resolving it as one would hand `openRow`
    // a name that can never be in the handler map — which is the silent
    // nothing-happens the exhaustive Record now exists to prevent.
    expect(slashRowAction(slashRow(SLASH_HISTORY).id)).toBeNull();
    // Nor is a name that merely looks like one. The registry decides.
    expect(slashRowAction('action:nope')).toBeNull();
    // A session or turn row must not be mistaken for an action.
    expect(slashRowAction('session:abc')).toBeNull();
    expect(slashRowAction('turn:abc')).toBeNull();
    expect(slashRowAction('live:abc')).toBeNull();
});

test('an action row carries the command that reaches it next time', () => {
    expect(slashRow(SLASH_STOP).label).toBe(SLASH_STOP.label);
    expect(slashRow(SLASH_STOP).meta).toBe('/stop');
});

test('names are unique, so a typed command resolves to one entry', () => {
    expect(new Set(SLASH.map((entry) => entry.name)).size).toBe(SLASH.length);
});

test('a prefix is written back the way it is typed', () => {
    expect(prefixLabel('history')).toBe('/history');
    // fs: and cmd: are not slash commands and keep their own spelling.
    expect(prefixLabel('fs')).toBe('fs:');
    expect(prefixLabel('cmd')).toBe('cmd:');
});
