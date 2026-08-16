// otp.mailer.ts
import type { SendMailOptions } from "nodemailer";
import { getMailer } from "@/infrastructure/mailer";
import { logger } from "@/infrastructure/logger";
import { AppError } from "@/shared/errors";
import appErrorCodes from "@/shared/errors/app.error.codes";
import { mailerConfig, otpConfig, appConfig } from "@/config";
import { TryCatch, type Resolver } from "@/shared/utils/try-catch";

const resolveMailError: Resolver<void> = (error) => {
    logger.error(error, "Failed to send OTP email");
    const reason = error instanceof Error ? error.message : String(error);
    throw new AppError(
        "Failed to send OTP email",
        appErrorCodes.mailSendError.toString(),
        502,
        // Only surface the real transport error (e.g. ECONNREFUSED, auth failure)
        // outside production - it's what makes the response debuggable in dev,
        // but it's internal infra detail a real client shouldn't see.
        appConfig.isProduction ? undefined : { reason },
    );
};

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Covers transient failures (connection drops, brief SMTP outages) - retries the
// same send a few times with linear backoff before giving up for good.
async function sendWithRetry(mail: SendMailOptions): Promise<void> {
    // A misconfigured maxSendAttempts <= 0 must not turn into "never try, never
    // throw" - that would report success without ever sending anything.
    const maxAttempts = Math.max(1, mailerConfig.maxSendAttempts);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await getMailer().sendMail(mail);
            return;
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            logger.warn(
                error,
                `OTP email send failed (attempt ${attempt}/${maxAttempts}), retrying`,
            );
            await delay(mailerConfig.retryDelayMs * attempt);
        }
    }
}

export function sendOtpEmail(to: string, otp: string) {
    return TryCatch.of(() =>
        sendWithRetry({
            from: mailerConfig.from,
            to,
            subject: "Your verification code",
            text: `Your OTP is ${otp}. It expires in ${otpConfig.ttlSeconds} seconds.`,
        }),
    ).onError(resolveMailError);
}
