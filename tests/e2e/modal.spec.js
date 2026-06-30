'use strict';
const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin } = require('./helpers.js');

test.describe('Modal — shelf tab clicks and mutual exclusivity', () => {

  // Each test gets a fresh user, searches for a known book, and lands on the search tab.
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('hamlet shakespeare');
    await page.locator('#searchBtn').click();
    await page.waitForSelector('.card', { timeout: 15_000 });
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  test('modal opens from Want tab', async ({ page }) => {
    await page.locator('.card').first().locator('[data-action="want"]').click();
    await page.locator('[data-tab="want"]').click();
    await page.waitForSelector('.card', { timeout: 5_000 });

    // Click the cover area — guaranteed to not hit any button
    await page.locator('.card').first().locator('.cover').click();

    await expect(page.locator('.rec-modal-overlay')).toBeVisible();
    await expect(page.locator('.rec-modal-title')).not.toBeEmpty();
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  test('modal opens from Read tab', async ({ page }) => {
    await page.locator('.card').first().locator('[data-action="read"]').click();
    await page.locator('[data-tab="read"]').click();
    await page.waitForSelector('.card', { timeout: 5_000 });

    await page.locator('.card').first().locator('.cover').click();

    await expect(page.locator('.rec-modal-overlay')).toBeVisible();
    await expect(page.locator('.rec-modal-title')).not.toBeEmpty();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  test('modal opens from Fav tab', async ({ page }) => {
    await page.locator('.card').first().locator('[data-action="fav"]').click();
    await page.locator('[data-tab="fav"]').click();
    await page.waitForSelector('.card', { timeout: 5_000 });

    await page.locator('.card').first().locator('.cover').click();

    await expect(page.locator('.rec-modal-overlay')).toBeVisible();
    await expect(page.locator('.rec-modal-title')).not.toBeEmpty();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  test('mutual exclusivity: clicking Reading in modal removes book from Want tab', async ({ page }) => {
    // Add to want from search
    await page.locator('.card').first().locator('[data-action="want"]').click();
    await expect(page.locator('#countWant')).not.toHaveText('');

    // Navigate to want tab and open modal
    await page.locator('[data-tab="want"]').click();
    await page.waitForSelector('.card', { timeout: 5_000 });
    await page.locator('.card').first().locator('.cover').click();
    await expect(page.locator('.rec-modal-overlay')).toBeVisible();

    // Click "Reading" — server will remove from want
    await page.locator('.rec-modal-btn-reading').click();
    // Want count badge should drop to empty immediately (updateCounts called)
    await expect(page.locator('#countWant')).toHaveText('');

    // Close the modal
    await page.locator('.rec-modal-close').click();
    await expect(page.locator('.rec-modal-overlay')).not.toBeVisible();

    // Want tab should be empty
    await page.locator('[data-tab="want"]').click();
    await expect(page.locator('.card')).toHaveCount(0);

    // Reading tab should contain the book
    await page.locator('[data-tab="reading"]').click();
    await expect(page.locator('.reading-card').first()).toBeVisible();
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  test('Want button is active when modal opened for a book already on Want shelf', async ({ page }) => {
    // Add to want from search
    await page.locator('.card').first().locator('[data-action="want"]').click();

    // Navigate to want tab and open modal
    await page.locator('[data-tab="want"]').click();
    await page.waitForSelector('.card', { timeout: 5_000 });
    await page.locator('.card').first().locator('.cover').click();
    await expect(page.locator('.rec-modal-overlay')).toBeVisible();

    // Want button must be active immediately (key known from stored data, no async lookup needed)
    await expect(page.locator('.rec-modal-btn-want')).toHaveClass(/active/);
  });
});
