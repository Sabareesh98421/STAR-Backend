import { expect, test } from '@playwright/test';
import { getCurrentUser, requestEmailVerification, signIn, verifyEmail } from './auth.transport';

test('returns no user for an unauthenticated session check', async () => {
    const request: { url: string; credentials: RequestCredentials | null } = {
        url: '',
        credentials: null,
    };
    const user = await getCurrentUser('/api', async (input, init) => {
        request.url = input;
        request.credentials = init?.credentials ?? null;
        return new Response(null, { status: 401 });
    });

    expect(request.url).toBe('/api/auth/email/me');
    expect(request.credentials).toBe('same-origin');
    expect(user).toBeNull();
});

test('returns the authenticated user from the API envelope', async () => {
    const expected = { id: 'user-id', email: 'person@example.com', plan: null };
    const user = await getCurrentUser('/api', async () =>
        new Response(JSON.stringify({ success: true, message: '', data: expected }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }),
    );

    expect(user).toEqual(expected);
});

test('does not treat an unavailable auth service as an unauthenticated user', async () => {
    await expect(
        getCurrentUser('/api', async () => new Response(null, { status: 503 })),
    ).rejects.toThrow('Session check failed (503)');
});

test('signs in through the public endpoint and sends same-origin credentials', async () => {
    const request: { url: string; init: RequestInit | null } = { url: '', init: null };
    await signIn('/api', 'person@example.com', 'password', async (input, init) => {
        request.url = input;
        request.init = init ?? null;
        return new Response(JSON.stringify({ success: true, message: 'Signed in', data: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });

    expect(request.url).toBe('/api/auth/email/signin');
    expect(request.init?.credentials).toBe('same-origin');
    expect(JSON.parse(String(request.init?.body))).toEqual({ email: 'person@example.com', password: 'password' });
});

test('requests and verifies email OTPs through the public auth endpoints', async () => {
    const requests: { url: string; init: RequestInit | null }[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
        requests.push({ url, init: init ?? null });
        return new Response(JSON.stringify({ success: true, message: 'OK', data: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };

    await requestEmailVerification('/api', 'person@example.com', fetcher);
    await verifyEmail('/api', 'person@example.com', '123456', fetcher);

    expect(requests.map((request) => request.url)).toEqual([
        '/api/auth/otp/request',
        '/api/auth/otp/verify',
    ]);
    expect(requests.map((request) => JSON.parse(String(request.init?.body)))).toEqual([
        { email: 'person@example.com', purpose: 'verify-email' },
        { email: 'person@example.com', otp: '123456', purpose: 'verify-email' },
    ]);
    expect(requests.every((request) => request.init?.credentials === 'same-origin')).toBe(true);
});