
import { response, success, toResponse } from '@/shared/http';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { TryCatch } from '@/shared/utils/try-catch';
import type { EmailSignupRequest, PendingSignupEmailUpdateRequest } from '@/modules/auth/providers/email';
import { userRepository } from '@/infrastructure/database';
import { createPendingSignup, hasPendingSignup, movePendingSignupEmail } from './email.signup.store';

export default function signupHandler(body: EmailSignupRequest) {
    return TryCatch.of(() => signupService(body)).onError(toResponse);
}

async function signupService(body: EmailSignupRequest) {
    const passwordHash = await Bun.password.hash(body.password);
    const created = await createPendingSignup(body.email, {
        passwordHash,
        firstName: body.firstName,
        secondName: body.secondName,
    });
    if (!created) throw new ConflictError('A signup is already pending for this email');
    return response(success<null>(null, 'Signup received, request an OTP to verify this email', 201));
}

export function updatePendingSignupEmailHandler(body: PendingSignupEmailUpdateRequest) {
    return TryCatch.of(() => updatePendingSignupEmail(body)).onError(toResponse);
}

async function updatePendingSignupEmail(body: PendingSignupEmailUpdateRequest) {
    if (body.currentEmail === body.newEmail) {
        if (!(await hasPendingSignup(body.currentEmail))) {
            throw new NotFoundError('The pending signup for this email could not be found');
        }
        return response(success<null>(null, 'Signup email is unchanged', 200));
    }

    if (await userRepository.findByEmail(body.newEmail)) {
        throw new ConflictError('An account already uses this email');
    }

    const result = await movePendingSignupEmail(body.currentEmail, body.newEmail);
    if (result === 'missing') {
        throw new NotFoundError('The pending signup for this email could not be found');
    }
    if (result === 'conflict') {
        throw new ConflictError('Another signup is already pending for this email');
    }
    return response(success<null>(null, 'Signup email updated', 200));
}
