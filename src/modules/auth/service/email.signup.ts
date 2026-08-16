
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import { toResponse } from '@/shared/http/resolveAppError';
import { TryCatch } from '@/shared/utils/try-catch';
import type { EmailSignupRequest } from '../providers/email/email.schema';
import { userRepository } from '@/infrastructure/database';

export default function signupService(body: EmailSignupRequest) {
    return TryCatch.of(async () => {
        const passwordHash = await Bun.password.hash(body.password);
        await userRepository.create({
            email: body.email,
            firstName: body.firstName,
            secondName: body.secondName,
            passwordHash,
        });
        return response(success<null>(null, 'User signed up successfully', 201));
    }).onError(toResponse);
}
