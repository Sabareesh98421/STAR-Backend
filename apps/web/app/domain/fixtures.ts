/**
 * Sample content, taken verbatim from the design frames so the implementation
 * can be compared against them directly.
 *
 * This is a stand-in for the API, which does not exist yet. Everything here is
 * replaced by the transport layer; nothing else should import it once that
 * lands.
 */
import type { EditorLine, ObjectRow, PeekEdit, Review } from './workspace';

export const PROJECT = 'ledger-api';
export const OPEN_FILE = { dir: 'src/cache/', name: 'Cache.ts' };

export const EDITOR_LINES: readonly EditorLine[] = [
    { number: 34, text: 'private evict(now: number) {' },
    { number: 35, text: '  for (const [key, entry] of this.entries) {' },
    { number: 36, text: '    if (entry.expires > now) continue' },
    { number: 37, text: '    this.entries.delete(key)', touched: true },
    { number: 38, text: '    this.listeners.get(key)?.forEach(fn => fn())', touched: true },
    { number: 39, text: '  }' },
    { number: 40, text: '}' },
    { number: 41, text: '' },
    { number: 42, text: 'read<T>(key: string): T | undefined {' },
    { number: 43, text: '  const entry = this.entries.get(key)' },
    { number: 44, text: '  if (!entry) return undefined' },
    { number: 45, text: '  this.hits += 1' },
    { number: 46, text: '  return entry.value as T' },
    { number: 47, text: '}' },
    { number: 48, text: '' },
    { number: 49, text: 'write<T>(key: string, value: T, ttl = 30_000) {' },
    { number: 50, text: '  this.entries.set(key, {' },
    { number: 51, text: '    value,' },
    { number: 52, text: '    expires: Date.now() + ttl,' },
    { number: 53, text: '  })' },
    { number: 54, text: '}' },
];

export const PEEK: PeekEdit = {
    afterLine: 38,
    caption: 'peek · agent edit · pushes code down',
    text: '    this.listeners.delete(key)',
};

export const TASKS: readonly ObjectRow[] = [
    { id: 't0', marker: 'running', label: 'Refactor auth middleware', meta: '3 of 7', shortcut: null },
    { id: 't1', marker: 'open', label: 'Extract token verify', meta: null, shortcut: null, depth: 1 },
    { id: 't2', marker: 'closed', label: 'Move cache invalidation', meta: null, shortcut: null, depth: 1 },
];

export const CHAT_HISTORY: readonly ObjectRow[] = [
    { id: 'c0', marker: 'idle', label: 'Why is evict slow?', meta: '14m', shortcut: null },
    { id: 'c1', marker: 'idle', label: 'Listener cleanup', meta: '1h', shortcut: null },
];

export const CONTEXT: readonly ObjectRow[] = [
    { id: 'x0', marker: 'idle', label: 'src/cache/Cache.ts', meta: null, shortcut: '⌥2', monoLabel: true },
    { id: 'x1', marker: 'idle', label: 'src/auth/authGuard.ts', meta: null, shortcut: '⌥3', monoLabel: true },
    { id: 'x2', marker: 'idle', label: 'ledger-api · 40 files', meta: null, shortcut: null, monoLabel: true },
];

export const CUSTOM_INSTRUCTIONS =
    'Prefer explicit disposal over finalizers. No new dependencies.';

export const REVIEW: Review = {
    commit: 'a3f21c',
    closedCount: 6,
    findings: [
        { id: 'f0', marker: 'open', title: 'Blob retained in loop', origin: 'Cache.ts 41 · raised a3f21c · 3 commits' },
        { id: 'f1', marker: 'open', title: 'Listener not removed', origin: 'Panel.tsx 12 · raised a3f21c · 3 commits' },
        { id: 'f2', marker: 'raised', title: 'Full array cloned per tick', origin: 'Ticker.ts 88 · amended 1f9e02' },
        { id: 'f3', marker: 'raised', title: 'Sync read on hot path', origin: 'Loader.ts 24 · new' },
    ],
};

export const COMMANDS: readonly ObjectRow[] = [
    { id: 'k0', marker: 'open', label: 'test cache', meta: 'vitest run src/cache', shortcut: null },
    { id: 'k1', marker: 'idle', label: 'test all', meta: 'vitest run', shortcut: null },
    { id: 'k2', marker: 'running', label: 'typecheck', meta: 'running', shortcut: null },
];

export const FILE_TREE: readonly ObjectRow[] = [
    { id: 'p0', marker: 'idle', label: 'src', meta: null, shortcut: null, monoLabel: true, depth: 0 },
    { id: 'p1', marker: 'idle', label: 'auth', meta: '3 files', shortcut: null, monoLabel: true, depth: 1 },
    { id: 'p2', marker: 'idle', label: 'cache', meta: null, shortcut: null, monoLabel: true, depth: 1 },
    { id: 'p3', marker: 'open', label: 'Cache.ts', meta: 'open', shortcut: '⌥1', monoLabel: true, depth: 2 },
    { id: 'p4', marker: 'idle', label: 'Cache.test.ts', meta: null, shortcut: '⌥2', monoLabel: true, depth: 2 },
    { id: 'p5', marker: 'idle', label: 'Entry.ts', meta: null, shortcut: '⌥3', monoLabel: true, depth: 2 },
    { id: 'p6', marker: 'idle', label: 'ledger', meta: '11 files', shortcut: null, monoLabel: true, depth: 1 },
    { id: 'p7', marker: 'idle', label: 'runtime', meta: '7 files', shortcut: null, monoLabel: true, depth: 1 },
    { id: 'p8', marker: 'idle', label: 'test', meta: '9 files', shortcut: null, monoLabel: true, depth: 0 },
];

export const CONSOLE_RUN = {
    command: 'cmd: test cache',
    output: [
        { text: 'PASS  src/cache/Cache.test.ts  18 tests', dim: false },
        { text: 'FAIL  evict removes listeners', dim: false },
        { text: '  Cache.ts:38 — expected 0 listeners, got 1', dim: true },
    ],
};
