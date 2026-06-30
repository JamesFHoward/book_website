const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Shelves — want / read / fav', () => {

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    // Switch to Search tab and search for a known book
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('hamlet shakespeare');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
  });

  test('can add first result to Want to Read', async ({ page }) => {
    const wantBtn = page.locator('.card').first().locator('[data-action="want"]');
    await wantBtn.click();
    await expect(wantBtn).toHaveText(/✓ Want/);
    await expect(page.locator('#countWant')).not.toHaveText('0');
  });

  test('can add first result to Already Read', async ({ page }) => {
    const readBtn = page.locator('.card').first().locator('[data-action="read"]');
    await readBtn.click();
    await expect(readBtn).toHaveText(/✓ Read/);
    await expect(page.locator('#countRead')).not.toHaveText('0');
  });

  test('adding to Read removes from Want (mutual exclusivity)', async ({ page }) => {
    const card = page.locator('.card').first();
    await card.locator('[data-action="want"]').click();
    await expect(card.locator('[data-action="want"]')).toHaveText(/✓ Want/);
    // Now click Read
    await card.locator('[data-action="read"]').click();
    // Want should no longer be active
    await expect(card.locator('[data-action="want"]')).not.toHaveText(/✓ Want/);
    await expect(card.locator('[data-action="read"]')).toHaveText(/✓ Read/);
  });

  test('can add to Favorites', async ({ page }) => {
    const favBtn = page.locator('.card').first().locator('[data-action="fav"]');
    await favBtn.click();
    await expect(favBtn).toHaveClass(/active/);
    await expect(page.locator('#countFav')).not.toHaveText('0');
  });

  test('books appear in shelf tab after adding', async ({ page }) => {
    await page.locator('.card').first().locator('[data-action="want"]').click();
    await page.locator('[data-tab="want"]').click();
    await expect(page.locator('.card').first()).toBeVisible();
  });

  test('Remove button deletes book from shelf', async ({ page }) => {
    await page.locator('.card').first().locator('[data-action="want"]').click();
    await page.locator('[data-tab="want"]').click();
    await page.locator('.card').first().locator('[data-action="remove"]').click();
    await expect(page.locator('#countWant')).toHaveText('');
  });
});
