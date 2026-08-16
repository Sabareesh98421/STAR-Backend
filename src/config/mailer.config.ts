// mailer.config.ts
import { envNumber } from './env.util';

export const mailerConfig = {
    host: process.env.SMTP_HOST || "localhost",
    port: envNumber(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.MAIL_FROM || "no-reply@star.local",
    // Tests and local dev run against a no-network transport instead of a real SMTP server.
    useTestTransport: process.env.NODE_ENV !== "production",
    // Retries a failed send this many times (linear backoff) before giving up -
    // covers transient SMTP connection drops, not permanent failures like bad auth.
    maxSendAttempts: envNumber(process.env.MAIL_MAX_SEND_ATTEMPTS, 3),
    retryDelayMs: envNumber(process.env.MAIL_RETRY_DELAY_MS, 300),
};
