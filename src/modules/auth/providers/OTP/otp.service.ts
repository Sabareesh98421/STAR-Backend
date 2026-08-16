// otp.service.ts
import response from '@/shared/http/response';
import { success } from '@/shared/http/responseHelper';
import { toResponse } from '@/shared/http/resolveAppError';
import { TryCatch } from '@/shared/utils/try-catch';
import { generateOtp } from './otp.generator';
import { saveOtp, consumeOtp, discardOtp } from './otp.store';
import { sendOtpEmail } from './otp.mailer';
import type { OtpRequestBody, OtpVerifyBody } from './otp.schema';
import { otpConfig } from '@/config';

export function requestOtp(body: OtpRequestBody) {
    return TryCatch.of(async () => {
        const otp = generateOtp(otpConfig.length);
        const token = await saveOtp(body.purpose, body.email, otp);
        try {
            await sendOtpEmail(body.email, otp);
        } catch (error) {
            // Remove the saved OTP if the email failed to send.
            await discardOtp(body.purpose, body.email, token);
            throw error;
        }
        return response(success<null>(null, 'OTP sent successfully', 200));
    }).onError(toResponse);
}

export function verifyOtp(body: OtpVerifyBody) {
    return TryCatch.of(async () => {
        await consumeOtp(body.purpose, body.email, body.otp);
        return response(success<null>(null, 'OTP verified successfully', 200));
    }).onError(toResponse);
}
