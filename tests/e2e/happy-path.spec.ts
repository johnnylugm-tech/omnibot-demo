import { test, expect } from '@playwright/test';

const STAMP = Date.now();
const EMAIL = `e2e-${STAMP}@example.com`;
const PWD = 'password123';

test.describe('Happy path: signup → first note → reload persists', () => {
  test('DoD 1-2-6-9 smoke', async ({ page }) => {
    page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    // Landing
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('寫得輕一點');

    // Signup
    await page.getByRole('link', { name: '免費開始' }).first().click();
    await page.waitForURL(/\/signup/);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PWD);
    await page.locator('input[autocomplete="name"]').fill('E2E');
    await page.getByRole('button', { name: '建立帳號' }).click();

    // 等待 cookie 確實設好（避免 race）
    await expect.poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.find((c) => c.name === 'ob_sid')?.value;
    }, { timeout: 10_000 }).toBeTruthy();

    // Dashboard
    await page.waitForURL(/\/app/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: '筆記' })).toBeVisible({ timeout: 10_000 });

    // Create note via header CTA
    await page.getByRole('button', { name: /新增/ }).first().click();
    await page.waitForURL(/\/app\/notes\//);

    // Editor: type title + content
    const title = `E2E Note ${STAMP}`;
    // page.type 逐字輸入，確保 React onChange 逐個接收 keystroke
    await page.waitForSelector('input[placeholder="標題"]', { timeout: 10_000 });
    await page.locator('input[placeholder="標題"]').click();
    await page.locator('input[placeholder="標題"]').type(title, { delay: 10 });
    // 等 CodeMirror mount
    await page.waitForSelector('.cm-content', { timeout: 10_000 });
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('# Heading\n\nThis is a test note.');
    // 等 autosave debounce (1.5s) + API call 完成
    await expect(page.getByText('已儲存')).toBeVisible({ timeout: 10_000 });

    // 回到 dashboard
    await page.getByRole('link', { name: 'Notes' }).first().click();
    await page.waitForURL(/\/app(?:\/?$|\?)/);
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    // 重新整理 — 確認保存
    await page.reload();
    await expect(page.getByText(title)).toBeVisible();

    // 搜尋剛才的關鍵字
    await page.locator('#app-search').fill('Heading');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/app\/search/);
    await expect(page.getByText(title)).toBeVisible();
  });
});

