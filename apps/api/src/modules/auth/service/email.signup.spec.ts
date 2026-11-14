import { test, expect } from "@playwright/test";
import { connectRedis, disconnectRedis, getRedis } from "@/infrastructure/redis";
import signupService from "./email.signup";
import { deletePendingSignup, getPendingSignup, pendingSignupKey } from "./email.signup.store";
import type { EmailSignupRequest } from "@/modules/auth/providers/email";

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

    test.beforeEach(async () => {
        await deletePendingSignup(email);
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

    test("rejects a second signup without replacing the credentials awaiting verification", async () => {
        const first = await signupService(signupBody());
        const duplicate = await signupService(
            signupBody({
                firstName: "Replacement",
                password: "Other-Password-27!",
                confirmPassword: "Other-Password-27!",
            }),
        );

        expect(first.status).toBe(201);
        expect(duplicate.status).toBe(409);
        expect((await getPendingSignup(email))?.firstName).toBe("Ada");
    });
});
