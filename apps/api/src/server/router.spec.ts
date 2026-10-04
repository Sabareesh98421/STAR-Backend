// Covers how invalid input leaves the app, which is a property of the router
// and of no single module.
//
// It was broken in the way that is hardest to notice: the error handler itself
// threw. Zod reports a failed field's path as segments (['title']) and the
// handler called String.replace on it, so every invalid body in the whole app
// answered with Bun's raw HTML fallback and a 500 — a client-caused error that
// client retry logic reads as transient and sends again.
//
// Needs a server, because the mapping only exists inside Elysia's lifecycle.
import { test, expect } from '@playwright/test';
import type { Elysia } from 'elysia';

let app: Elysia;
let base = '';

test.beforeAll(async () => {
    // Nothing here runs an ensemble, but a worker process shared with another
    // spec file must never cache the real browser's CDP url. See
    // ensemble.service.spec.ts.
    process.env.ENSEMBLE_CDP_URL = 'http://127.0.0.1:1';

    const { Elysia } = await import('elysia');
    const masterRouter = (await import('./router')).default;
    app = new Elysia().use(masterRouter).listen({ port: 0, reusePort: false });
    base = `http://127.0.0.1:${app.server?.port ?? 0}/api`;
});

test.afterAll(async () => {
    await app?.stop(true);
});

interface Failure {
    success: boolean;
    message: string;
    error: { code: string; details?: Record<string, string[]> };
}

test('an invalid body is a 400 in the project envelope, naming the field', async () => {
    const res = await fetch(`${base}/ensemble/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    // Not an HTML page: Bun's fallback is what a thrown error HANDLER produces,
    // and it is the exact symptom this test exists to catch.
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as Failure;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // The field, from Zod's own path. 'root' here would mean the mapping lost it.
    expect(Object.keys(body.error.details ?? {})).toEqual(['title']);
});

test('a prompt of only whitespace is refused rather than trimmed to nothing', async () => {
    const res = await fetch(`${base}/ensemble/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
    });

    // Accepted, it would open a conversation whose title is an empty string and
    // whose first question was never asked.
    expect(res.status).toBe(400);
});

test('an invalid query is a 400, not a listing of everything', async () => {
    const res = await fetch(`${base}/ensemble/sessions?limit=abc`);
    expect(res.status).toBe(400);

    const body = (await res.json()) as Failure;
    expect(Object.keys(body.error.details ?? {})).toEqual(['limit']);
});

test('an id that is not a uuid never reaches the database', async () => {
    const res = await fetch(`${base}/ensemble/runs/not-a-uuid`);
    // A 500 here would be Prisma's complaint about the shape of an id the
    // router should have rejected.
    expect(res.status).toBe(400);
});

test('malformed JSON is a 400 as well, since the client sent it', async () => {
    const res = await fetch(`${base}/ensemble/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as Failure).success).toBe(false);
});
