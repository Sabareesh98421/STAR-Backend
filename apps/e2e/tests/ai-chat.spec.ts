// Precondition check: is the shared browser up and logged into every service?
//
// Deliberately read-only — it inspects the tabs that are already open and never
// navigates or sends a prompt. An earlier version navigated each tab, which
// would hijack the shared browser mid-run and corrupt an in-flight ensemble.
import { test, expect, chromium, type Browser } from '@playwright/test';
// @ts-expect-error — .mjs transport module, no types
import { TARGETS } from '@star/browser-ensemble/broadcast';

type Target = { name: string; match: RegExp; composer: string };

let browser: Browser;

test.beforeAll(async () => {
    browser = await chromium.connectOverCDP('http://localhost:9222');
});

test.afterAll(async () => {
    await browser?.close(); // closes the CONNECTION, not the shared browser
});

test('shared browser exposes CDP with at least one context', () => {
    expect(browser.contexts().length).toBeGreaterThan(0);
});

for (const target of TARGETS as Target[]) {
    test(`${target.name}: tab is open and signed in`, async () => {
        const page = browser.contexts()[0].pages().find((p) => target.match.test(p.url()));
        expect(page, `no ${target.name} tab open — run: bun run broadcast "hi"`).toBeTruthy();

        // A visible composer is the signal that matters: it only renders once
        // the service has accepted the session. A sign-in wall has none.
        await expect(
            page!.locator(target.composer),
            `${target.name} composer missing — session likely expired, run: bun run login`,
        ).toBeVisible({ timeout: 15000 });
    });
}
