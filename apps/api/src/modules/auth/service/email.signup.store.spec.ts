import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import { savePendingSignup, getPendingSignup, hasPendingSignup, deletePendingSignup, pendingSignupKey } from "./email.signup.store";

const email = "signup-store-test@example.com";
const key = pendingSignupKey(email);

test.describe("email.signup.store", () => {
    test.beforeAll(async () => {
        await connectRedis();
    });

    test.afterAll(async () => {
        await getRedis().del(key);
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
});
