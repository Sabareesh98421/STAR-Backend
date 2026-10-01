import { test, expect } from './fixture';

test('chatgpt is loaded', async ({ page }) => {
    await page.goto('https://chatgpt.com');
    await expect(page).toHaveTitle(/ChatGPT/i);
});

test('claude is loaded', async ({ page }) => {
    await page.goto('https://claude.ai');
    await expect(page).toHaveTitle(/Claude/i);
});

test('gemini is loaded', async ({ page }) => {
    await page.goto('https://gemini.google.com');
    await expect(page).toHaveTitle(/Gemini/i);
});
