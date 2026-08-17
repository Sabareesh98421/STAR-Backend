// otp.service.ts
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import { toResponse } from '@/shared/http/resolveAppError';
import { TryCatch } from '@/shared/utils/try-catch';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { generateOtp } from './otp.generator';
import { saveOtp, consumeOtp, discardOtp } from './otp.store';
import { sendOtpEmail } from './otp.mailer';
import { OtpPurpose, type OtpRequestBody, type OtpVerifyBody } from './otp.schema';
import { otpConfig } from '@/config';
import { userRepository } from '@/infrastructure/database';
import { hasPendingSignup, getPendingSignup, deletePendingSignup } from '../../service/email.signup.store';

export function requestOtpHandler(body: OtpRequestBody) {
    return TryCatch.of(() => requestOtp(body)).onError(toResponse);
}

async function requestOtp(body: OtpRequestBody) {
    if (body.purpose === OtpPurpose.VerifyEmail && !(await hasPendingSignup(body.email))) {
        throw new NotFoundError('Pending signup for this email');
    }

    const otp = generateOtp(otpConfig.length);
    const token = await saveOtp(body.purpose, body.email, otp);
    await TryCatch.of(() => sendOtpEmail(body.email, otp)).onError(async (error) => {
        await discardOtp(body.purpose, body.email, token);
        throw error;
    });
    return response(success<null>(null, 'OTP sent successfully', 200));
}

export function verifyOtpHandler(body: OtpVerifyBody) {
    
    return TryCatch.of(()=>verifyOtp(body)).onError(toResponse);
}

async function verifyOtp(body:OtpVerifyBody){
    await consumeOtp(body.purpose, body.email, body.otp);

        if (body.purpose === OtpPurpose.VerifyEmail) {
            const pending = await getPendingSignup(body.email);
            if (!pending) throw new ValidationError('Signup has expired, please sign up again');
            await userRepository.create({
                email: body.email,
                firstName: pending.firstName,
                secondName: pending.secondName,
                passwordHash: pending.passwordHash,
            });
            await deletePendingSignup(body.email);
        }

        return response(success<null>(null, 'OTP verified successfully', 200));
}