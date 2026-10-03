import { test as base, chromium, type Page, type Browser } from '@playwright/test';

const CDP_URL = 'http://localhost:9222';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!_browser) _browser = await chromium.connectOverCDP(CDP_URL);
    return _browser;
}

// Attaches to the running Chrome CDP server.
// Run `bun run browser` in apps/e2e first, log in manually, then run tests.
export const test = base.extend<{ page: Page }>({
    page: [async ({}, use) => {
        const browser = await getBrowser();
        const ctx = browser.contexts()[0] ?? await browser.newContext();
        const page = ctx.pages()[0] ?? await ctx.newPage();
        await use(page);
    }, { timeout: 60000 }],
});

export { expect } from '@playwright/test';
