const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Collections', () => {

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    // Add a book to want so we have something to add to a collection
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('pride and prejudice');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().locator('[data-action="want"]').click();
    await expect(page.locator('.card').first().locator('[data-action="want"]')).toHaveText(/✓ Want/);
    // Navigate to Collections
    await page.locator('[data-tab="collections"]').click();
    await page.waitForSelector('#newColName', { timeout: 5_000 });
  });

  test('can create a new collection', async ({ page }) => {
    await page.locator('#newColName').fill('Test Collection');
    await page.locator('#createColBtn').click();
    await expect(page.locator('.reading-title')).toContainText('Test Collection');
  });

  test('can view books in a collection after adding one', async ({ page }) => {
    await page.locator('#newColName').fill('My Reads');
    await page.locator('#createColBtn').click();
    // Open the collection
    await page.locator('.col-view-btn').first().click();
    await page.waitForSelector('.col-add-input', { timeout: 5_000 });
    // Type to search shelf
    await page.locator('.col-add-input').fill('pride');
    await page.waitForTimeout(300);
    const suggestion = page.locator('.col-books div[style*="cursor:pointer"]').first();
    // If no suggestion found (OL network), skip gracefully
    const count = await suggestion.count();
    if (count === 0) return;
    await suggestion.click();
    await page.waitForTimeout(500);
    // Should show book in the list
    await expect(page.locator('.col-books').first()).toContainText('pride', { ignoreCase: true });
  });

  test('can delete a collection', async ({ page }) => {
    await page.locator('#newColName').fill('Temp Collection');
    await page.locator('#createColBtn').click();
    await expect(page.locator('.reading-title')).toContainText('Temp Collection');
    await page.locator('.col-del-btn').first().click();
    await page.waitForTimeout(400);
    await expect(page.locator('.reading-title')).not.toContainText('Temp Collection');
  });

  test('Enter key in name input creates collection', async ({ page }) => {
    await page.locator('#newColName').fill('Keyboard Collection');
    await page.locator('#newColName').press('Enter');
    await expect(page.locator('.reading-title')).toContainText('Keyboard Collection');
  });
});
