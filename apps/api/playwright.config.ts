// Env comes from the monorepo .env, loaded by Bun before the runner starts
// (see this app's "test" script). No dotenv — Bun reads .env natively.
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./src",
    testMatch: "**/*.spec.ts",
});
