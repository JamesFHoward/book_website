'use strict';
// Shared helpers for Playwright e2e tests.
let _userCounter = 0;

function uniqueUser() {
  _userCounter++;
  const ts = Date.now();
  return {
    username: `e2euser${ts}${_userCounter}`,
    email:    `e2e${ts}${_userCounter}@example.com`,
    password: 'TestPass1',
  };
}

// Registers a user via the UI and lands on app.html.
async function registerAndLogin(page, creds) {
  await page.goto('/');
  await page.locator('#tabRegister').click();
  await page.locator('#regUser').fill(creds.username);
  await page.locator('#regEmail').fill(creds.email);
  await page.locator('#regPass').fill(creds.password);
  await page.locator('#registerForm button[type="submit"]').click();
  await page.waitForURL('**/app.html');
}

// Logs in via the UI.
async function login(page, creds) {
  await page.goto('/');
  await page.locator('#loginUser').fill(creds.username);
  await page.locator('#loginPass').fill(creds.password);
  await page.locator('#loginForm button[type="submit"]').click();
  await page.waitForURL('**/app.html');
}

module.exports = { uniqueUser, registerAndLogin, login };
