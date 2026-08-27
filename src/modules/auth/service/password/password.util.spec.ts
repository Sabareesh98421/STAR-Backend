import { test, expect } from "@playwright/test";
import { hashPassword, verifyPassword } from "./password.util";

test.describe("password.util", () => {
    test("verifies a password it hashed, and rejects a wrong one", async () => {
        const stored = await hashPassword("Correct-horse-1!");
        expect(await verifyPassword("Correct-horse-1!", stored)).toBe(true);
        expect(await verifyPassword("Correct-horse-2!", stored)).toBe(false);
    });

    test("fails a missing user without answering faster than a real one", async () => {
        const started = Bun.nanoseconds();
        expect(await verifyPassword("Correct-horse-1!", null)).toBe(false);
        const elapsedMs = (Bun.nanoseconds() - started) / 1_000_000;
        expect(elapsedMs).toBeGreaterThan(10);
    });
});
