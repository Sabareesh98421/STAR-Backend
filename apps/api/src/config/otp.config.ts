// otp.config.ts
import { envNumber } from './env.util';

export const otpConfig = {
    length: envNumber(process.env.OTP_LENGTH, 6),
    ttlSeconds: envNumber(process.env.OTP_TTL_SECONDS, 300),
    maxAttempts: envNumber(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: envNumber(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
};
