// mailer.config.ts
import { envNumber } from './env.util';

// jsonTransport serializes the mail and reports success WITHOUT sending it.
// Under NODE_ENV=test this is forced on and MAIL_USE_TEST_TRANSPORT is ignored:
// the suite mails fake @example.com addresses, so a real send bounces every one
// back to the sender and burns the account's daily sending quota.
function resolveTestTransport(): boolean {
    if (process.env.NODE_ENV === "test") return true;
    if (process.env.MAIL_USE_TEST_TRANSPORT) return process.env.MAIL_USE_TEST_TRANSPORT === "true";
    return process.env.NODE_ENV !== "production";
}

export const mailerConfig = {
    host: process.env.SMTP_HOST || "localhost",
    port: envNumber(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from: process.env.MAIL_FROM || "no-reply@star.local",
    useTestTransport: resolveTestTransport(),
    // Retries a failed send this many times (linear backoff) before giving up -
    // covers transient SMTP connection drops, not permanent failures like bad auth.
    maxSendAttempts: envNumber(process.env.MAIL_MAX_SEND_ATTEMPTS, 3),
    retryDelayMs: envNumber(process.env.MAIL_RETRY_DELAY_MS, 300),
};
