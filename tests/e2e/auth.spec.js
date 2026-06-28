const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin, login } = require('./helpers.js');

test.describe('Authentication', () => {

  test('registration with valid credentials redirects to app', async ({ page }) => {
    const user = uniqueUser();
    await page.goto('/');
    await page.locator('#tabRegister').click();
    await page.locator('#regUser').fill(user.username);
    await page.locator('#regEmail').fill(user.email);
    await page.locator('#regPass').fill(user.password);
    await page.locator('#registerForm button[type="submit"]').click();
    await expect(page).toHaveURL(/app\.html/);
  });

  test('login with correct credentials redirects to app', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    // Log out first
    await page.locator('#logoutBtn').click();
    await page.waitForURL('**/index.html');
    // Log back in
    await login(page, user);
    await expect(page).toHaveURL(/app\.html/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await page.locator('#logoutBtn').click();
    await page.waitForURL('**/index.html');

    await page.locator('#loginUser').fill(user.username);
    await page.locator('#loginPass').fill('WrongPass9');
    await page.locator('#loginForm button[type="submit"]').click();
    await expect(page.locator('#loginErr')).not.toBeEmpty();
    await expect(page).not.toHaveURL(/app\.html/);
  });

  test('registration rejects weak password (no digit)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabRegister').click();
    await page.locator('#regUser').fill(`weakpw_${Date.now()}`);
    await page.locator('#regEmail').fill(`weakpw${Date.now()}@x.com`);
    await page.locator('#regPass').fill('NoDigitsAtAll');
    await page.locator('#registerForm button[type="submit"]').click();
    await expect(page.locator('#regErr')).not.toBeEmpty();
  });

  test('auth guard: visiting app.html while logged out redirects to index', async ({ page }) => {
    await page.goto('/app.html');
    await page.waitForURL('**/index.html');
  });

  test('logout clears session and redirects', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await page.locator('#logoutBtn').click();
    await expect(page).toHaveURL(/index\.html/);
  });

  test('session persists after page reload', async ({ page }) => {
    const user = uniqueUser();
    await registerAndLogin(page, user);
    await page.reload();
    await expect(page).toHaveURL(/app\.html/);
    await expect(page.locator('#userchip')).toContainText(user.username);
  });
});
