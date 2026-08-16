
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import { resolveAppError } from '@/shared/http/resolveAppError';
import type { EmailSignupRequest } from '../providers/email/email.schema';
import { userRepository } from '@/infrastructure/database';
import { tryCatch } from '@/shared/utils/try-catch';

const withSignupErrorHandling = tryCatch(resolveAppError);

export default async function signupService(body: EmailSignupRequest) {
    return withSignupErrorHandling(async () => {
        const passwordHash = await Bun.password.hash(body.password);
        await userRepository.create({
            email: body.email,
            firstName: body.firstName,
            secondName: body.secondName,
            passwordHash,
        });
        return response(success<null>(null, 'User signed up successfully', 201));
    });
}
