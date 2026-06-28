const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Search', () => {

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.locator('[data-tab="search"]').click();
  });

  test('searching a known title shows results', async ({ page }) => {
    await page.locator('#searchInput').fill('dune');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    const cards = page.locator('.card');
    await expect(cards).toHaveCount({ min: 1 });
  });

  test('Enter key triggers search', async ({ page }) => {
    await page.locator('#searchInput').fill('1984 orwell');
    await page.locator('#searchInput').press('Enter');
    await page.waitForSelector('.card', { timeout: 15_000 });
    await expect(page.locator('.card')).toHaveCount({ min: 1 });
  });

  test('search by author prefix returns results', async ({ page }) => {
    await page.locator('#searchInput').fill('author:tolkien');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await expect(page.locator('.card')).toHaveCount({ min: 1 });
  });

  test('clicking a result opens the book detail modal', async ({ page }) => {
    await page.locator('#searchInput').fill('hobbit tolkien');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().click();
    await expect(page.locator('.rec-modal-overlay')).toBeVisible();
    await expect(page.locator('.rec-modal-title')).not.toBeEmpty();
  });

  test('modal closes with Escape key', async ({ page }) => {
    await page.locator('#searchInput').fill('hamlet');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().click();
    await expect(page.locator('.rec-modal-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.rec-modal-overlay')).not.toBeVisible();
  });
});
