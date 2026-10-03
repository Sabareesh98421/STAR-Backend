import { test, expect } from "@playwright/test";
import { generateOtp } from "./otp.generator";

test.describe("otp.generator", () => {
    test("produces a zero-padded numeric code of the default length", () => {
        for (let i = 0; i < 50; i++) {
            expect(generateOtp()).toMatch(/^\d{6}$/);
        }
    });

    test("respects a custom length", () => {
        expect(generateOtp(4)).toMatch(/^\d{4}$/);
    });
});
