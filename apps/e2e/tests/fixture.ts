import { test as base, chromium, type Page, type Browser } from '@playwright/test';
// The endpoint the engine itself uses. Imported rather than retyped: a spec
// holding its own copy of the URL keeps passing when the real one changes,
// which is exactly when it should fail.
import { DEFAULT_CDP_URL } from '@star/browser-ensemble/types';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!_browser) _browser = await chromium.connectOverCDP(DEFAULT_CDP_URL);
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
