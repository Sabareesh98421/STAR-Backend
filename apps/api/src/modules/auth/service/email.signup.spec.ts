import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import signupService from "./email.signup";
import { getPendingSignup, pendingSignupKey } from "./email.signup.store";
import type { EmailSignupRequest } from "../providers/email/email.schema";

const email = "email-signup-test@example.com";

function signupBody(overrides: Partial<EmailSignupRequest> = {}): EmailSignupRequest {
    return {
        firstName: "Ada",
        secondName: "Lovelace",
        email,
        password: "Str0ng!Pass",
        confirmPassword: "Str0ng!Pass",
        ...overrides,
    };
}

test.describe("email.signup", () => {
    test.beforeAll(async () => {
        await connectRedis();
    });

    test.afterAll(async () => {
        await getRedis().del(pendingSignupKey(email));
        await disconnectRedis();
    });

    test("stores a pending signup in Redis instead of creating a user immediately", async () => {
        const res = await signupService(signupBody());
        expect(res.status).toBe(201);

        const pending = await getPendingSignup(email);
        expect(pending?.firstName).toBe("Ada");
        expect(pending?.secondName).toBe("Lovelace");
        expect(pending?.passwordHash).not.toBe("Str0ng!Pass");
    });
});
