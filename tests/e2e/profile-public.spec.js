'use strict';
const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Public Profile page (/u/:username)', () => {

  test('user not found — error message is shown', async ({ page }) => {
    await page.goto('/u/nonexistent_xyz_abc_999');
    await expect(page.locator('.user-not-found-title')).toBeVisible();
    await expect(page.locator('.user-not-found-title')).toHaveText('User not found');
  });

  test('known user profile shows username heading and shelved book', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await page.request.post('/api/lists/read/toggle', {
      data: { key: 'OLP1W', title: 'Profile Test Book', author: 'Profile Author', cover_i: null },
    });
    await page.goto(`/u/${user.username}`);
    await expect(page.locator('.user-name')).toContainText(user.username);
    await expect(page.locator('.shelf-book-title').first()).toBeVisible();
  });

  test('no auth required — fresh browser context loads profile without redirect', async ({ browser }) => {
    const setupCtx = await browser.newContext();
    const setupPage = await setupCtx.newPage();
    const user = uniqueUser();
    await registerAndLogin(setupPage, user);
    await setupPage.request.post('/api/lists/read/toggle', {
      data: { key: 'OLP2W', title: 'Auth Test Book', author: 'Author', cover_i: null },
    });
    await setupCtx.close();

    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(`/u/${user.username}`);
    await expect(anonPage.locator('.user-name')).toContainText(user.username);
    await expect(anonPage).not.toHaveURL(/index\.html/);
    await anonCtx.close();
  });
});
