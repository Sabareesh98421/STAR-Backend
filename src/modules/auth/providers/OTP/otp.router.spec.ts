import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import { getMailer } from "@/infrastructure/mailer";
import otpRouter from "./otp.router";

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
    });

    test.afterAll(async () => {
        await getRedis().del(`otp:${purpose}:${email}`, `otp:cooldown:${purpose}:${email}`);
        await disconnectRedis();
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
        await getRedis().del(`otp:cooldown:${purpose}:${email}`);
        await postJson("/otp/request", { email, purpose });
        const res = await postJson("/otp/verify", { email, purpose, otp: "000000" });
        expect(res.status).toBe(400);
    });

    test("a failed send rolls back the saved code, not just the cooldown lock", async () => {
        await getRedis().del(`otp:cooldown:${purpose}:${email}`, `otp:${purpose}:${email}`);
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
            `otp:${purpose}:${email}`,
            `otp:cooldown:${purpose}:${email}`,
        );
        expect(remaining).toBe(0);

        const retryRes = await postJson("/otp/request", { email, purpose });
        expect(retryRes.status).toBe(200);
    });
});
