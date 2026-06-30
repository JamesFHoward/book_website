const { defineConfig } = require('@playwright/test');
const path = require('path');
const os   = require('os');

const E2E_DB = path.join(os.tmpdir(), 'bookshelf-e2e.db');

module.exports = defineConfig({
  testDir:  './tests/e2e',
  timeout:  30_000,
  use: {
    baseURL:       'http://localhost:3001',
    headless:      true,
    screenshot:    'only-on-failure',
    video:         'off',
  },
  webServer: {
    command:              `PORT=3001 NODE_ENV=test DB_PATH=${E2E_DB} SESSION_SECRET=e2e-test-secret node server.js`,
    url:                  'http://localhost:3001',
    reuseExistingServer:  false,
    timeout:              15_000,
  },
});
