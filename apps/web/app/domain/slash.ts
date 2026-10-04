/**
 * The slash commands, as data.
 *
 * `/name` is a feature rather than a one-off, so there is one list of them and
 * every surface reads it: the parser that recognises a typed name, the
 * spotlight's own help panel, the rail's button, and the row the spotlight puts
 * above the history. Nothing else spells a command out.
 *
 * Not env: these are not deployment knobs. The set of commands ships with the
 * code that answers them, and an env var would only let the two disagree.
 */
import type { ObjectRow, SpotlightPrefix } from './workspace';

export interface SlashEntry {
    /** Typed as `/name`. The slash is never part of it. */
    readonly name: string;
    /**
     * What a button, row or toast calls it. The leading `+` a button draws is
     * presentation and belongs to the button, not to the name.
     */
    readonly label: string;
    /** The one-liner the spotlight's help panel lists it by. */
    readonly hint: string;
    /**
     * A command travels the FIELD up to the list it names. An action has no
     * list — it does a thing and leaves the field where it is — so it carries
     * no prefix, and the app binds its name to a handler instead.
     */
    readonly prefix: SpotlightPrefix | null;
}

export const SLASH_HISTORY = {
    name: 'history',
    label: 'History',
    hint: 'conversations',
    prefix: 'history',
} as const satisfies SlashEntry;

export const SLASH_NEW = {
    name: 'new',
    label: 'New chat',
    hint: 'new chat',
    prefix: null,
} as const satisfies SlashEntry;

/**
 * Stops delivery, never the work — the protocol has no `turn.cancel`, and the
 * hint says so rather than promising an interrupt the server never performs.
 *
 * It is a command and not only the composer's chip because the chip is gone
 * the moment any other layer owns the FIELD: someone reading the history of a
 * turn that is still running could see it run and not reach it.
 */
export const SLASH_STOP = {
    name: 'stop',
    label: 'Stop',
    hint: 'stop listening to this turn',
    prefix: null,
} as const satisfies SlashEntry;

/**
 * `as const` so each entry keeps its literal name, which is what makes
 * `SlashActionName` below a real union rather than `string`.
 */
export const SLASH = [SLASH_HISTORY, SLASH_NEW, SLASH_STOP] as const satisfies readonly SlashEntry[];

/**
 * The commands that need a handler bound to them — the ones with no list of
 * their own, which do a thing instead of travelling the field somewhere.
 *
 * Derived from the registry rather than written out, so the registry growing
 * is a type error at the place that binds handlers instead of a command that
 * clears the composer and silently does nothing. Adding an entry with
 * `prefix: null` and no handler used to compile, run, and fail invisibly.
 */
export type SlashCommand = (typeof SLASH)[number];
export type SlashActionName = Extract<SlashCommand, { prefix: null }>['name'];

/**
 * The command a line of typed text names, if it names one at all.
 *
 * Matched on the whole name so the field does not jump out from under a prompt
 * that merely starts with a slash.
 */
export function slashEntry(text: string): SlashCommand | null {
    const name = /^\/(\w+)$/.exec(text.trim())?.[1] ?? null;
    return SLASH.find((entry) => entry.name === name) ?? null;
}

/**
 * An action as a spotlight row, so the one list the FIELD draws can carry a
 * thing to do as well as things to open. The command sits in the row's meta
 * slot: a row is where someone finds the action, and the name is how they
 * reach it next time without going looking.
 */
const ROW_PREFIX = 'action:';

export function slashRow(entry: SlashEntry): ObjectRow {
    return {
        id: `${ROW_PREFIX}${entry.name}`,
        marker: 'raised',
        label: entry.label,
        meta: `/${entry.name}`,
        shortcut: null,
    };
}

/**
 * The action a spotlight row names, if it is an action row at all.
 *
 * Checked against the registry rather than trusted: `action:` on the front of
 * an id is a claim, and returning an unregistered name would hand the caller
 * something to look up that can never be there.
 */
const ACTION_NAMES: ReadonlySet<string> = new Set(
    SLASH.filter((entry) => entry.prefix === null).map((entry) => entry.name),
);

export function slashRowAction(id: string): SlashActionName | null {
    if (!id.startsWith(ROW_PREFIX)) return null;
    const name = id.slice(ROW_PREFIX.length);
    return ACTION_NAMES.has(name) ? (name as SlashActionName) : null;
}

/** How a spotlight prefix is written back to the user: `/history`, or `fs:`. */
export function prefixLabel(prefix: SpotlightPrefix): string {
    const entry = SLASH.find((candidate) => candidate.prefix === prefix);
    return entry ? `/${entry.name}` : `${prefix}:`;
}
