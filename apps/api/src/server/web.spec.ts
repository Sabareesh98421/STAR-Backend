// The one thing here that is worth a test: a URL pathname is attacker
// controlled, and a static server that gets containment wrong serves the
// filesystem.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { resolveWebFile } from './web';

const ROOT = '/srv/web';
const INDEX = path.join(ROOT, 'index.html');

test('serves a real asset path unchanged', () => {
    expect(resolveWebFile(ROOT, '/_nuxt/app.js')).toBe(path.join(ROOT, '_nuxt/app.js'));
});

test('falls back to the index for the root and for client-side routes', () => {
    expect(resolveWebFile(ROOT, '/')).toBe(INDEX);
    // Not a file on disk, so the caller serves the index — resolution still
    // has to keep it inside the root.
    expect(resolveWebFile(ROOT, '/chat/abc')).toBe(path.join(ROOT, 'chat/abc'));
});

test('cannot be walked out of the root, encoded or not', () => {
    for (const attempt of [
        '/../../etc/passwd',
        '/a/../../../etc/passwd',
        '/%2e%2e%2f%2e%2e%2fetc/passwd',
        '/..%2f..%2fetc/passwd',
        '/./..//../etc/passwd',
    ]) {
        const resolved = resolveWebFile(ROOT, attempt);
        // Clamped at the root, not rejected — `..` above the root is dropped,
        // so what comes back is a harmless (and almost certainly missing) path
        // inside it, which the caller then answers with the SPA index.
        expect(resolved, attempt).not.toBe(null);
        expect(resolved!.startsWith(ROOT + path.sep), attempt).toBe(true);
    }
});

test('a root with a trailing slash resolves the same as one without', () => {
    // WEB_DIST is typed by a human. Unnormalised, the containment check below
    // compared against `/srv/web//` and refused everything — including `/`, so
    // the whole deployment answered 400 with nothing in the log to blame.
    expect(resolveWebFile(`${ROOT}/`, '/')).toBe(INDEX);
    expect(resolveWebFile(`${ROOT}/`, '/_nuxt/app.js')).toBe(path.join(ROOT, '_nuxt/app.js'));
    expect(resolveWebFile(`${ROOT}/./`, '/../../etc/passwd')).toBe(path.join(ROOT, 'etc/passwd'));
});

test('refuses malformed encoding and NUL bytes', () => {
    expect(resolveWebFile(ROOT, '/%')).toBe(null);
    expect(resolveWebFile(ROOT, '/app%00.js')).toBe(null);
});

test('a sibling directory with a shared prefix is not reachable', () => {
    // /srv/web-secrets starts with the root string but is NOT under the root;
    // the check has to compare on a path separator, not on characters.
    expect(resolveWebFile(ROOT, '/../web-secrets/key')).toBe(path.join(ROOT, 'web-secrets/key'));
});
