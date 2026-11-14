/**
 * Workspace concepts, transcribed from the design's own vocabulary.
 * Pure types: no Vue, no DOM, no transport.
 */

/**
 * Sheet A's legend, verbatim: "accent solid · 18% white · running · 30% muted".
 * The design is explicit that escalation is carried by opacity, never by hue:
 * "no red, no badges, no severity colours."
 */
export type MarkerName = 'open' | 'raised' | 'running' | 'closed' | 'idle';

export interface Marker {
    readonly glyph: '●' | '○' | '◐' | '◌';
    readonly tone: 'accent' | 'accent-60' | 'ink-18' | 'ink-30';
}

export const MARKERS: Readonly<Record<MarkerName, Marker>> = {
    /** Current, or a finding aged past five commits. Full accent. */
    open: { glyph: '●', tone: 'accent' },
    /** Raised but not yet escalated. */
    raised: { glyph: '●', tone: 'accent-60' },
    running: { glyph: '◐', tone: 'accent-60' },
    closed: { glyph: '○', tone: 'ink-18' },
    idle: { glyph: '◌', tone: 'ink-30' },
};

/** Every list in the rail, the spotlight and the console is this shape. */
export interface ObjectRow {
    readonly id: string;
    readonly marker: MarkerName;
    readonly label: string;
    /** Slot 3. Path, count, commit, elapsed time. Rendered mono at 40%. */
    readonly meta: string | null;
    /** Slot 4. Filled only while the hint layer is held. */
    readonly shortcut: string | null;
    /** Renders the label mono rather than sans. Paths and filenames do. */
    readonly monoLabel?: boolean;
    /** Tree indent depth, for the fs: results and task children. */
    readonly depth?: number;
}

/** Mutable: adopting renumbers the file and editing rewrites a line. */
export interface EditorLine {
    number: number;
    text: string;
    /** The 2px left tick the design draws beside lines an edit touches. */
    touched?: boolean;
}

/** The inline peek: 4% fill, 2px accent rail, pushes the code below it down. */
export interface PeekEdit {
    readonly afterLine: number;
    readonly caption: string;
    readonly text: string;
}

export interface ReviewFinding {
    readonly id: string;
    readonly marker: MarkerName;
    readonly title: string;
    readonly origin: string;
}

/** One living review, rewritten on each commit. Not a growing list. */
export interface Review {
    readonly commit: string;
    readonly findings: readonly ReviewFinding[];
    readonly closedCount: number;
}

/** Which layer currently owns the FIELD. Esc dismisses the topmost. */
export type ShellLayer = 'rest' | 'spotlight' | 'console';

/** Sheet C: "files unprefixed · everything else x:y". */
export type SpotlightPrefix = 'fs' | 'cmd' | 'history';

export const RESERVED_PREFIXES = ['sym:', 'ext:', 'agent:'] as const;

/**
 * Sheet C: "Esc dismisses topmost layer in z order."
 *
 * Pure so the ordering can be checked without a DOM. The order below is the
 * z-index order from Sheet B read downward: spotlight 50, toast 40,
 * console 35, then focus mode. Exactly one thing is dismissed per press.
 */
export interface DismissState {
    readonly layer: ShellLayer;
    readonly hasToast: boolean;
    readonly focusMode: boolean;
}

export function dismissTopmost(state: DismissState): DismissState {
    if (state.layer === 'spotlight') return { ...state, layer: 'rest' };
    if (state.hasToast) return { ...state, hasToast: false };
    if (state.layer === 'console') return { ...state, layer: 'rest' };
    if (state.focusMode) return { ...state, focusMode: false };
    return state;
}
