const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('DNF (Did Not Finish / Paused)', () => {

  async function startReadingBook(page) {
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('moby dick');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().locator('[data-action="reading"]').click();
    await expect(page.locator('#countReading')).not.toHaveText('0');
    // Go to reading tab
    await page.locator('[data-tab="reading"]').click();
    await page.waitForSelector('.reading-card', { timeout: 8_000 });
  }

  test('DNF button moves book from Reading to Paused', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await startReadingBook(page);
    await page.locator('.reading-dnf-btn').first().click();
    await page.waitForTimeout(400);
    // Reading count should decrease
    const readingCount = await page.locator('#countReading').textContent();
    const n = parseInt(readingCount || '0', 10);
    expect(n).toBe(0);
    // Paused tab should have the book
    await page.locator('[data-tab="dnf"]').click();
    await expect(page.locator('.card')).toHaveCount({ min: 1 });
  });

  test('adding a DNF book to want shelf clears it from Paused', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await startReadingBook(page);
    await page.locator('.reading-dnf-btn').first().click();
    await page.waitForTimeout(400);
    // Go to search, find same book, add to want
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('moby dick');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().locator('[data-action="want"]').click();
    await page.waitForTimeout(400);
    // Paused tab should now be empty (or at least not show that book)
    await page.locator('[data-tab="dnf"]').click();
    const dnfCount = await page.locator('#countDnf').textContent();
    const n = parseInt(dnfCount || '0', 10);
    expect(n).toBe(0);
  });

  test('can remove book from Paused tab', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await startReadingBook(page);
    await page.locator('.reading-dnf-btn').first().click();
    await page.waitForTimeout(400);
    await page.locator('[data-tab="dnf"]').click();
    await page.waitForSelector('.card', { timeout: 5_000 });
    await page.locator('[data-action="dnf-remove"]').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('.card')).toHaveCount(0);
  });
});
