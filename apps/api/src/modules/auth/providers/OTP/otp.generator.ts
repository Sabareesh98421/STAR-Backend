// otp.generator.ts
import { randomInt } from "node:crypto";

export function generateOtp(length = 6): string {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, "0");
}
