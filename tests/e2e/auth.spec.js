const { test, expect } = require('@playwright/test');
const { uniqueUser, registerAndLogin, login } = require('./helpers.js');

test.describe('Password requirements indicator', () => {

  test('checklist hidden on login tab (login form shown by default)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('ul.pw-rules')).not.toBeVisible();
  });

  test('checklist visible after switching to register tab', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabRegister').click();
    await expect(page.locator('ul.pw-rules')).toBeVisible();
  });

  test('neutral state — no met or unmet classes on empty password field', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabRegister').click();
    for (const id of ['#pwRule8', '#pwRuleLetter', '#pwRuleNumber']) {
      await expect(page.locator(id)).not.toHaveClass('met');
      await expect(page.locator(id)).not.toHaveClass('unmet');
    }
  });

  test('partial password (letters only) — letter rule met, length and digit rules unmet', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabRegister').click();
    await page.locator('#regPass').fill('abc');
    await expect(page.locator('#pwRuleLetter')).toHaveClass('met');
    await expect(page.locator('#pwRule8')).toHaveClass('unmet');
    await expect(page.locator('#pwRuleNumber')).toHaveClass('unmet');
  });

  test('valid password — all three rules met, form has no pw-invalid class', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabRegister').click();
    await page.locator('#regPass').fill('testPass1');
    await expect(page.locator('#pwRule8')).toHaveClass('met');
    await expect(page.locator('#pwRuleLetter')).toHaveClass('met');
    await expect(page.locator('#pwRuleNumber')).toHaveClass('met');
    await expect(page.locator('#registerForm')).not.toHaveClass(/pw-invalid/);
  });

  test('submit button is visually disabled when password is invalid', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tabRegister').click();
    await page.locator('#regPass').fill('abc');
    await expect(page.locator('#registerForm')).toHaveClass(/pw-invalid/);
    const opacity = await page.locator('#registerForm button[type="submit"]').evaluate(
      el => parseFloat(getComputedStyle(el).opacity)
    );
    expect(opacity).toBeLessThan(1);
  });
});

test.describe('Login page — layout', () => {

  test('OAuth buttons are visible on page load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.oauth-btn-google')).toBeVisible();
    await expect(page.locator('.oauth-btn-github')).toBeVisible();
  });

  test('login form and its inputs are visible on page load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loginForm')).toBeVisible();
    await expect(page.locator('#loginUser')).toBeVisible();
    await expect(page.locator('#loginPass')).toBeVisible();
  });
});

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
