
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import { toResponse } from '@/shared/http/resolveAppError';
import { TryCatch } from '@/shared/utils/try-catch';
import type { EmailSignupRequest } from '../providers/email/email.schema';
import { savePendingSignup } from './email.signup.store';

export default function signupHandler(body: EmailSignupRequest) {
    return TryCatch.of(() => signupService(body)).onError(toResponse);
}

async function signupService(body: EmailSignupRequest) {
    const passwordHash = await Bun.password.hash(body.password);
    await savePendingSignup(body.email, {
        passwordHash,
        firstName: body.firstName,
        secondName: body.secondName,
    });
    return response(success<null>(null, 'Signup received, request an OTP to verify this email', 201));
}
