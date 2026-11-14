import { appConfig, sessionConfig } from '@/config';

export const emailCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: appConfig.isProduction,
    path: '/',
    maxAge: sessionConfig.ttlSeconds,
};