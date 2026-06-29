'use strict';
const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Similar Books in Modal', () => {

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('gatsby fitzgerald');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
    await page.locator('.card').first().click();
    await expect(page.locator('.rec-modal-overlay')).toBeVisible();
  });

  test('similar section becomes visible with cards or stays hidden gracefully', async ({ page }) => {
    const similarSection = page.locator('#modalSimilar');
    // Wait until the fetch has settled: section is either hidden or has cards
    await page.waitForFunction(
      () => {
        const el = document.getElementById('modalSimilar');
        if (!el || el.style.display === 'none') return true;
        return el.querySelectorAll('.rec-modal-similar-card').length > 0;
      },
      { timeout: 8_000 },
    );
    const isVisible = await similarSection.isVisible();
    if (isVisible) {
      // Network available — must contain at least one card
      const cardCount = await page.locator('.rec-modal-similar-card').count();
      expect(cardCount).toBeGreaterThan(0);
    }
    // If not visible, network was unavailable or no results — hidden is acceptable
  });

  test('similar section is never an empty box', async ({ page }) => {
    // Wait for the fetch to fully resolve (populates cards or hides the section)
    await page.waitForFunction(
      () => {
        const el = document.getElementById('modalSimilar');
        if (!el || el.style.display === 'none') return true;
        return el.querySelectorAll('.rec-modal-similar-card').length > 0;
      },
      { timeout: 8_000 },
    );
    const similarSection = page.locator('#modalSimilar');
    const isVisible = await similarSection.isVisible();
    if (isVisible) {
      const cardCount = await page.locator('.rec-modal-similar-card').count();
      expect(cardCount).toBeGreaterThan(0);
    }
    // If not visible, the section is properly hidden — test passes
  });
});
