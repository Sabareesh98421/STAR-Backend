// email.signin.ts
import { userRepository } from '@/infrastructure/database';
import { AppError, NotFoundError } from '@/shared/errors';
import { response, failure, success, toResponse } from '@/shared/http';
import { TryCatch } from '@/shared/utils/try-catch';
import type { EmailSigninRequest } from '@/modules/auth/providers/email';
import { verifyPassword } from '@/modules/auth/service/password';
import { createSession } from '@/modules/auth/service/session';

// The router extracts the Elysia cookie slot and passes a plain setter so
// this function has no Elysia import — it stays testable standalone.
export type SessionCookieSetter = (sessionId: string) => void;

export async function signInHandler(user: EmailSigninRequest, setSessionCookie: SessionCookieSetter) {
    return TryCatch.of(() => signin(user, setSessionCookie)).onError(toResponse);
}

async function signin(user: EmailSigninRequest, setSessionCookie: SessionCookieSetter) {
    const userFound = await userRepository.findByEmail(user.email);
    // Deliberate: same response whether the user doesn't exist or the password
    // is wrong — an attacker cannot tell which one failed.
    if (null === userFound) {
        return response(failure(new NotFoundError('Invalid email or password', null)));
    }
    if (!await verifyPassword(user.password, userFound.passwordHash)) {
        return response(failure(new AppError('Invalid email or password', 'creds_mismatch', 401)));
    }
    const sessionId = await createSession(userFound.id, userFound.email);
    setSessionCookie(sessionId);
    return response(success({ id: userFound.id, email: userFound.email }));
}
