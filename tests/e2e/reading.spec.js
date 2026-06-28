const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Reading tab', () => {

  // Add a book to reading before each test
  async function addBookToReading(page) {
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('the great gatsby');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().locator('[data-action="reading"]').click();
    await expect(page.locator('.card').first().locator('[data-action="reading"]')).toHaveText(/📖 Reading/);
    await page.locator('[data-tab="reading"]').click();
    await page.waitForSelector('.reading-card', { timeout: 8_000 });
  }

  test('adding a book appears in the Reading tab', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await addBookToReading(page);
    await expect(page.locator('.reading-card')).toHaveCount({ min: 1 });
    await expect(page.locator('#countReading')).not.toHaveText('0');
  });

  test('can set total pages', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await addBookToReading(page);
    const totalInput = page.locator('.reading-page-total').first();
    await totalInput.fill('300');
    await totalInput.dispatchEvent('change');
    await page.waitForTimeout(600);
    await expect(totalInput).toHaveValue('300');
  });

  test('step buttons update current page', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await addBookToReading(page);
    const pageInput = page.locator('.reading-page-input').first();
    await page.locator('.reading-page-total').first().fill('400');
    await page.locator('.reading-page-total').first().dispatchEvent('change');
    // Click +10 three times
    for (let i = 0; i < 3; i++) {
      await page.locator('.reading-step-btn[data-d="10"]').first().click();
    }
    await page.waitForTimeout(400);
    await expect(pageInput).toHaveValue('30');
  });

  test('finish button moves book to Read shelf', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await addBookToReading(page);
    await page.locator('.reading-finish-btn').first().click();
    await page.waitForTimeout(1000);
    // Reading count should drop
    const countText = await page.locator('#countReading').textContent();
    assert_isEmpty_or_zero(countText);
    // Read shelf should have a book
    await page.locator('[data-tab="read"]').click();
    await expect(page.locator('.card')).toHaveCount({ min: 1 });
  });

  test('DNF button moves book to Paused tab', async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await addBookToReading(page);
    await page.locator('.reading-dnf-btn').first().click();
    await page.waitForTimeout(500);
    await page.locator('[data-tab="dnf"]').click();
    await expect(page.locator('.card')).toHaveCount({ min: 1 });
  });
});

// Helper for checking empty count
function assert_isEmpty_or_zero(text) {
  const n = parseInt(text || '0', 10);
  if (n > 0) throw new Error(`Expected reading count to be 0 or empty, got "${text}"`);
}
