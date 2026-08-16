import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./src",
    testMatch: "**/*.spec.ts",
});
