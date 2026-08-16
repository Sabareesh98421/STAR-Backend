import { test, expect } from "@playwright/test";
import { getMailer } from "@/infrastructure/mailer";
import { AppError } from "@/shared/errors";
import { sendOtpEmail } from "./otp.mailer";

type SendMailStub = { sendMail: (opts: unknown) => Promise<unknown> };

test.describe("otp.mailer", () => {
    test("actually sends the OTP through the configured transport", async () => {
        // Runs against nodemailer's real jsonTransport (NODE_ENV=test, see
        // mailer.config.ts) - no network, but the real send/compose code path.
        await expect(sendOtpEmail("mailer-test@example.com", "123456")).resolves.toBeUndefined();
    });

    test("wraps a persistent transport failure in an AppError instead of leaking it", async () => {
        const transporter = getMailer() as unknown as SendMailStub;
        const originalSendMail = transporter.sendMail.bind(transporter);
        transporter.sendMail = async () => {
            throw new Error("smtp down");
        };
        try {
            await expect(sendOtpEmail("mailer-test@example.com", "123456")).rejects.toThrow(AppError);
        } finally {
            transporter.sendMail = originalSendMail;
        }
    });

    test("recovers from a transient failure by retrying", async () => {
        const transporter = getMailer() as unknown as SendMailStub;
        const originalSendMail = transporter.sendMail.bind(transporter);
        let attempts = 0;
        transporter.sendMail = async (opts) => {
            attempts++;
            if (attempts === 1) throw new Error("transient smtp glitch");
            return originalSendMail(opts);
        };
        try {
            await expect(sendOtpEmail("mailer-test@example.com", "123456")).resolves.toBeUndefined();
            expect(attempts).toBe(2);
        } finally {
            transporter.sendMail = originalSendMail;
        }
    });
});
