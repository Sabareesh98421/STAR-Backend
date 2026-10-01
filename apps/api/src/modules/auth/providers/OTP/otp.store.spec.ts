import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import { TooManyRequestsError, ValidationError } from "@/shared/errors";
import { saveOtp, consumeOtp, otpKey, cooldownKey } from "./otp.store";

const purpose = "test-purpose";
const email = "otp-store-test@example.com";

test.describe("otp.store", () => {
    test.beforeAll(async () => {
        await connectRedis();
    });

    test.afterAll(async () => {
        await getRedis().del(otpKey(purpose, email), cooldownKey(purpose, email));
        await disconnectRedis();
    });

    test("accepts the correct code and consumes it (single use)", async () => {
        await saveOtp(purpose, email, "123456");
        await consumeOtp(purpose, email, "123456");
        await expect(consumeOtp(purpose, email, "123456")).rejects.toThrow(ValidationError);
    });

    test("rejects a wrong code and locks out after too many attempts", async () => {
        await getRedis().del(cooldownKey(purpose, email));
        await saveOtp(purpose, email, "654321");
        for (let i = 0; i < 5; i++) {
            await expect(consumeOtp(purpose, email, "000000")).rejects.toThrow(ValidationError);
        }
        await expect(consumeOtp(purpose, email, "654321")).rejects.toThrow(TooManyRequestsError);
    });

    test("blocks a resend inside the cooldown window", async () => {
        await getRedis().del(cooldownKey(purpose, email));
        await saveOtp(purpose, email, "111111");
        await expect(saveOtp(purpose, email, "222222")).rejects.toThrow(TooManyRequestsError);
    });

    test("rejects a code that was never requested (or has already expired)", async () => {
        const neverRequestedEmail = "otp-store-never-requested@example.com";
        await expect(consumeOtp(purpose, neverRequestedEmail, "123456")).rejects.toThrow(ValidationError);
    });
});
