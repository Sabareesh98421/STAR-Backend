import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import { createPendingSignup, savePendingSignup, getPendingSignup, hasPendingSignup, deletePendingSignup, movePendingSignupEmail, pendingSignupKey } from "./email.signup.store";
import { cooldownKey, otpKey } from "@/modules/auth/providers/OTP/otp.store";
import { OtpPurpose } from "@/modules/auth/shared";

const email = "signup-store-test@example.com";
const updatedEmail = "signup-store-updated@example.com";
const key = pendingSignupKey(email);

test.describe("email.signup.store", () => {
    test.beforeAll(async () => {
        await connectRedis();
    });

    test.afterAll(async () => {
        await getRedis().del(
            key,
            pendingSignupKey(updatedEmail),
            otpKey(OtpPurpose.VerifyEmail, email),
            cooldownKey(OtpPurpose.VerifyEmail, email),
        );
        await disconnectRedis();
    });

    test("saves a pending signup and reads it back", async () => {
        await savePendingSignup(email, { passwordHash: "hash", firstName: "Ada", secondName: "Lovelace" });
        expect(await hasPendingSignup(email)).toBe(true);
        await expect(getPendingSignup(email)).resolves.toEqual({
            passwordHash: "hash",
            firstName: "Ada",
            secondName: "Lovelace",
        });
    });

    test("creates a pending signup only once for an email", async () => {
        await deletePendingSignup(email);

        expect(await createPendingSignup(email, { passwordHash: "first", firstName: "Ada", secondName: null })).toBe(true);
        expect(await createPendingSignup(email, { passwordHash: "replacement", firstName: "Grace", secondName: null })).toBe(false);
        expect((await getPendingSignup(email))?.firstName).toBe("Ada");
    });

    test("normalizes a missing secondName to null", async () => {
        await savePendingSignup(email, { passwordHash: "hash", firstName: "Ada", secondName: null });
        await expect(getPendingSignup(email)).resolves.toEqual({
            passwordHash: "hash",
            firstName: "Ada",
            secondName: null,
        });
    });

    test("deletePendingSignup removes it", async () => {
        await savePendingSignup(email, { passwordHash: "hash", firstName: "Ada", secondName: null });
        await deletePendingSignup(email);
        expect(await hasPendingSignup(email)).toBe(false);
        expect(await getPendingSignup(email)).toBeNull();
    });

    test("an email that never signed up has no pending record", async () => {
        expect(await hasPendingSignup("never-signed-up@example.com")).toBe(false);
        expect(await getPendingSignup("never-signed-up@example.com")).toBeNull();
    });

    test("moves a pending signup and clears verification state for the old email", async () => {
        await deletePendingSignup(email);
        await deletePendingSignup(updatedEmail);
        await savePendingSignup(email, { passwordHash: "hash", firstName: "Ada", secondName: null });
        await getRedis().set(otpKey(OtpPurpose.VerifyEmail, email), "old-code");
        await getRedis().set(cooldownKey(OtpPurpose.VerifyEmail, email), "1");

        await expect(movePendingSignupEmail(email, updatedEmail)).resolves.toBe("moved");
        await expect(getPendingSignup(email)).resolves.toBeNull();
        await expect(getPendingSignup(updatedEmail)).resolves.toEqual({
            passwordHash: "hash",
            firstName: "Ada",
            secondName: null,
        });
        await expect(getRedis().exists(otpKey(OtpPurpose.VerifyEmail, email))).resolves.toBe(0);
        await expect(getRedis().exists(cooldownKey(OtpPurpose.VerifyEmail, email))).resolves.toBe(0);
    });

    test("does not replace another pending signup when changing email", async () => {
        await savePendingSignup(email, { passwordHash: "source", firstName: "Ada", secondName: null });
        await savePendingSignup(updatedEmail, { passwordHash: "destination", firstName: "Grace", secondName: null });

        await expect(movePendingSignupEmail(email, updatedEmail)).resolves.toBe("conflict");
        await expect(getPendingSignup(email)).resolves.toMatchObject({ passwordHash: "source" });
        await expect(getPendingSignup(updatedEmail)).resolves.toMatchObject({ passwordHash: "destination" });
    });
});
