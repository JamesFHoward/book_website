'use strict';
const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Reading History Timeline', () => {

  test('timeline card is hidden when no books are in read shelf', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.goto('/profile.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#timelineCard')).not.toBeVisible();
  });

  test('timeline card is visible after adding a book to the read shelf', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.request.post('/api/lists/read/toggle', {
      data: { key: 'OLE2ET1', title: 'Timeline Test Book', author: 'Test Author', cover_i: 12345678 },
    });
    await page.goto('/profile.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#timelineCard')).toBeVisible();
  });

  test('timeline shows at least one cover thumbnail after adding a read book', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.request.post('/api/lists/read/toggle', {
      data: { key: 'OLE2ET2', title: 'Timeline Cover Book', author: 'Test Author', cover_i: 12345678 },
    });
    await page.goto('/profile.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.timeline-cover').first()).toBeVisible();
  });
});
