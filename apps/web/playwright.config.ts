import { defineConfig } from '@playwright/test';

// Mirrors apps/api: specs live next to the module they cover, no test dir.
export default defineConfig({
    testDir: './app',
    testMatch: '**/*.spec.ts',
});
