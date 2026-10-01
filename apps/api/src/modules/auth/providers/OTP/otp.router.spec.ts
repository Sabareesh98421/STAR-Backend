import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import { connectDatabase, disconnectDatabase, getDb, userRepository } from "@/infrastructure/database";
import { getMailer } from "@/infrastructure/mailer";
import { otpKey, cooldownKey } from "./otp.store";
import { savePendingSignup, hasPendingSignup, pendingSignupKey } from "../../service/email.signup.store";
import otpRouter from "./otp.router";
import { OtpPurpose } from "./otp.schema";

type SendMailStub = { sendMail: (opts: { text?: string }) => Promise<unknown> };

const email = "otp-router-test@example.com";
const purpose = "router-test";

function postJson(path: string, body: unknown) {
    return otpRouter.handle(
        new Request(`http://localhost${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

function captureNextOtp() {
    const transporter = getMailer() as unknown as SendMailStub;
    const originalSendMail = transporter.sendMail.bind(transporter);
    let captured = "";
    transporter.sendMail = async (opts) => {
        const match = opts.text?.match(/Your OTP is (\d+)/);
        if (match) captured = match[1]!;
        return originalSendMail(opts);
    };
    return {
        get: () => captured,
        restore: () => {
            transporter.sendMail = originalSendMail;
        },
    };
}

test.describe("otp.router", () => {
    test.beforeAll(async () => {
        await connectRedis();
        await connectDatabase();
    });

    test.afterAll(async () => {
        await getRedis().del(otpKey(purpose, email), cooldownKey(purpose, email));
        await disconnectRedis();
        await disconnectDatabase();
    });

    test("a real request -> verify cycle succeeds end to end over HTTP", async () => {
        const mail = captureNextOtp();
        try {
            const requestRes = await postJson("/otp/request", { email, purpose });
            expect(requestRes.status).toBe(200);
            expect(((await requestRes.json()) as { success: boolean }).success).toBe(true);

            const verifyRes = await postJson("/otp/verify", { email, purpose, otp: mail.get() });
            expect(verifyRes.status).toBe(200);
            expect(((await verifyRes.json()) as { success: boolean }).success).toBe(true);
        } finally {
            mail.restore();
        }
    });

    test("verify rejects the wrong code with 400", async () => {
        await getRedis().del(cooldownKey(purpose, email));
        await postJson("/otp/request", { email, purpose });
        const res = await postJson("/otp/verify", { email, purpose, otp: "000000" });
        expect(res.status).toBe(400);
    });

    test("a failed send rolls back the saved code, not just the cooldown lock", async () => {
        await getRedis().del(cooldownKey(purpose, email), otpKey(purpose, email));
        const transporter = getMailer() as unknown as SendMailStub;
        const originalSendMail = transporter.sendMail.bind(transporter);
        transporter.sendMail = async () => {
            throw new Error("smtp down");
        };

        const failedRes = await postJson("/otp/request", { email, purpose });
        transporter.sendMail = originalSendMail;
        expect(failedRes.status).toBe(502);

        // Not just the cooldown lock - the saved OTP entry itself must be gone
        // too. A subsequent saveOtp would silently overwrite a stale entry, so
        // checking "the retry succeeds" alone wouldn't catch a broken rollback.
        const remaining = await getRedis().exists(
            otpKey(purpose, email),
            cooldownKey(purpose, email),
        );
        expect(remaining).toBe(0);

        const retryRes = await postJson("/otp/request", { email, purpose });
        expect(retryRes.status).toBe(200);
    });

    test.describe("verify-email is tied to a pending signup", () => {
        const verifyEmail = "otp-router-verify-email-test@example.com";
        const noSignupEmail = "otp-router-no-signup-test@example.com";
        const expiredEmail = "otp-router-expired-signup-test@example.com";
        const duplicateEmail = "otp-router-duplicate-test@example.com";
        const keysFor = (addr: string) => [otpKey(OtpPurpose.VerifyEmail, addr), cooldownKey(OtpPurpose.VerifyEmail, addr)];

        test.afterAll(async () => {
            await getRedis().del(
                ...keysFor(verifyEmail),
                ...keysFor(noSignupEmail),
                ...keysFor(expiredEmail),
                ...keysFor(duplicateEmail),
                pendingSignupKey(expiredEmail),
                pendingSignupKey(duplicateEmail),
            );
            await getDb().user.deleteMany({ where: { email: { in: [verifyEmail, duplicateEmail] } } });
        });

        test("rejects an OTP request for an email with no pending signup", async () => {
            const res = await postJson("/otp/request", { email: noSignupEmail, purpose: OtpPurpose.VerifyEmail });
            expect(res.status).toBe(404);
        });

        test("verifying creates the user and clears the pending signup", async () => {
            await savePendingSignup(verifyEmail, { passwordHash: "hash", firstName: "Ada", secondName: "Lovelace" });
            const mail = captureNextOtp();
            try {
                await postJson("/otp/request", { email: verifyEmail, purpose: OtpPurpose.VerifyEmail });
                const res = await postJson("/otp/verify", { email: verifyEmail, purpose: OtpPurpose.VerifyEmail, otp: mail.get() });
                expect(res.status).toBe(200);
            } finally {
                mail.restore();
            }

            const user = await getDb().user.findUnique({ where: { email: verifyEmail } });
            expect(user?.firstName).toBe("Ada");
            expect(await hasPendingSignup(verifyEmail)).toBe(false);
        });

        test("rejects verification once the pending signup has expired", async () => {
            await savePendingSignup(expiredEmail, { passwordHash: "hash", firstName: "Ada", secondName: null });
            const mail = captureNextOtp();
            let otp = "";
            try {
                await postJson("/otp/request", { email: expiredEmail, purpose: OtpPurpose.VerifyEmail });
                otp = mail.get();
            } finally {
                mail.restore();
            }
            await getRedis().del(pendingSignupKey(expiredEmail));

            const res = await postJson("/otp/verify", { email: expiredEmail, purpose: OtpPurpose.VerifyEmail, otp });
            expect(res.status).toBe(400);
            expect(await getDb().user.findUnique({ where: { email: expiredEmail } })).toBeNull();
        });

        test("rejects verification for an email that's already a registered user", async () => {
            await userRepository.create({ passwordHash: "hash", email: duplicateEmail, firstName: "Existing", secondName: null });
            await savePendingSignup(duplicateEmail, { passwordHash: "hash", firstName: "Ada", secondName: null });
            const mail = captureNextOtp();
            try {
                await postJson("/otp/request", { email: duplicateEmail, purpose: OtpPurpose.VerifyEmail });
                const res = await postJson("/otp/verify", { email: duplicateEmail, purpose: OtpPurpose.VerifyEmail, otp: mail.get() });
                expect(res.status).toBe(409);
            } finally {
                mail.restore();
            }
        });
    });
});
