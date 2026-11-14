export interface AuthenticatedUser {
    readonly id: string;
    readonly email: string;
    readonly plan: string | null;
}

interface ApiEnvelope<T> {
    readonly success: boolean;
    readonly message: string;
    readonly data: T;
}

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function getCurrentUser(
    apiBase: string,
    fetcher: AuthFetch = fetch,
): Promise<AuthenticatedUser | null> {
    const url = `${apiBase}/auth/email/me`;
    const result = await fetcher(url, { credentials: 'same-origin' });
    if (result.status === 401) return null;
    if (!result.ok) throw new Error(`Session check failed (${result.status})`);

    const envelope = (await result.json()) as ApiEnvelope<AuthenticatedUser | null>;
    return envelope.success ? envelope.data : null;
}

export async function signIn(
    apiBase: string,
    email: string,
    password: string,
    fetcher: AuthFetch = fetch,
): Promise<void> {
    const result = await fetcher(`${apiBase}/auth/email/signin`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const envelope = (await result.json()) as ApiEnvelope<unknown>;
    if (!result.ok || !envelope.success) {
        throw new Error(envelope.message || `Sign in failed (${result.status})`);
    }
}

export async function requestEmailVerification(
    apiBase: string,
    email: string,
    fetcher: AuthFetch = fetch,
): Promise<void> {
    await postAuthAction(apiBase, '/auth/otp/request', { email, purpose: 'verify-email' }, fetcher);
}

export async function verifyEmail(
    apiBase: string,
    email: string,
    otp: string,
    fetcher: AuthFetch = fetch,
): Promise<void> {
    await postAuthAction(apiBase, '/auth/otp/verify', { email, otp, purpose: 'verify-email' }, fetcher);
}

async function postAuthAction(
    apiBase: string,
    path: string,
    body: Record<string, string>,
    fetcher: AuthFetch,
): Promise<void> {
    const result = await fetcher(`${apiBase}${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    const envelope = (await result.json()) as ApiEnvelope<unknown>;
    if (!result.ok || !envelope.success) {
        throw new Error(envelope.message || `Request failed (${result.status})`);
    }
}