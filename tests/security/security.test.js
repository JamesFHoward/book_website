'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const { startServer, makeClient } = require('../helpers/server.js');

const PORT = 3003;

describe('Security Tests', async () => {
  let srv, api;

  before(async () => {
    srv = await startServer({ port: PORT });
    api = makeClient(srv.baseUrl);
    // Seed one test user for auth tests
    await api.post('/api/register', { username: 'sectest', email: 'sec@x.com', password: 'TestPass1' });
    api.reset();
  });

  after(async () => {
    await srv.stop();
    try { fs.unlinkSync(srv.dbPath); } catch {}
  });

  async function authedClient() {
    const c = makeClient(srv.baseUrl);
    await c.post('/api/login', { username: 'sectest', password: 'TestPass1' });
    return c;
  }

  // ── SQL injection ──────────────────────────────────────────────────────────

  describe('SQL injection', () => {
    test("login with ' OR '1'='1 does not succeed", async () => {
      const r = await api.post('/api/login', { username: "' OR '1'='1", password: "' OR '1'='1" });
      assert.equal(r.status, 401);
    });

    test("search with SQL meta-characters returns safe response", async () => {
      const c = await authedClient();
      const r = await c.get("/api/search?q=' OR 1=1 --");
      // Must return 200 (proxied to OL) or any non-500 — should NOT crash server
      assert.ok(r.status !== 500, `Server must not crash on SQL-like input, got ${r.status}`);
    });

    test("register with SQL injection payload is rejected or sanitised safely", async () => {
      const r = await api.post('/api/register', {
        username: "'; DROP TABLE users; --",
        email: 'drop@x.com',
        password: 'TestPass1',
      });
      // Either succeeds (username is treated as literal string) or fails validation — never crashes
      assert.ok([200, 400, 409].includes(r.status));
    });
  });

  // ── XSS ───────────────────────────────────────────────────────────────────

  describe('XSS — server-side API responses do not reflect raw HTML', () => {
    test('book title with script tag stored and returned as plain text', async () => {
      const c = await authedClient();
      const xssKey = 'OL999W';
      const xssTitle = '<script>alert(1)</script>';
      await c.post('/api/lists/want/toggle', { key: xssKey, title: xssTitle, author: 'Auth', cover_i: null });
      const lists = await c.get('/api/lists');
      const entry = lists.data.want[xssKey];
      assert.ok(entry, 'book should be stored');
      // The API returns the raw string — XSS prevention is the frontend's job (escHtml).
      // We verify the server does NOT inject HTML tags into JSON responses beyond what was stored.
      assert.equal(entry.title, xssTitle, 'title returned as stored literal');
    });
  });

  // ── Session security ───────────────────────────────────────────────────────

  describe('Session security', () => {
    test('session cookie is httpOnly', async () => {
      api.reset();
      const r = await api.post('/api/login', { username: 'sectest', password: 'TestPass1' });
      const setCookie = r.headers.get('set-cookie') || '';
      assert.ok(setCookie.toLowerCase().includes('httponly'), `Expected HttpOnly flag; got: ${setCookie}`);
    });

    test('session cookie has SameSite attribute', async () => {
      api.reset();
      const r = await api.post('/api/login', { username: 'sectest', password: 'TestPass1' });
      const setCookie = r.headers.get('set-cookie') || '';
      assert.ok(setCookie.toLowerCase().includes('samesite'), `Expected SameSite; got: ${setCookie}`);
    });

    test('unauthenticated /api/me returns loggedIn: false', async () => {
      api.reset();
      const r = await api.get('/api/me');
      assert.equal(r.data.loggedIn, false);
    });

    test('authenticated /api/me returns loggedIn: true', async () => {
      api.reset();
      await api.post('/api/login', { username: 'sectest', password: 'TestPass1' });
      const r = await api.get('/api/me');
      assert.equal(r.data.loggedIn, true);
    });
  });

  // ── Sensitive data exposure ────────────────────────────────────────────────

  describe('Sensitive data not exposed', () => {
    test('/api/profile does not expose password_hash', async () => {
      const c = await authedClient();
      const r = await c.get('/api/profile');
      assert.ok(!('password_hash' in r.data), 'password_hash must not be in profile response');
    });

    test('/api/me does not expose password_hash', async () => {
      const c = await authedClient();
      const r = await c.get('/api/me');
      assert.ok(!('password_hash' in r.data), 'password_hash must not be in /api/me response');
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  describe('Rate limiting', () => {
    test('/api/login returns 429 after 10 rapid failures', async () => {
      const c = makeClient(srv.baseUrl);
      let lastStatus = 0;
      for (let i = 0; i < 12; i++) {
        const r = await c.post('/api/login', { username: 'nobody', password: 'wrong' });
        lastStatus = r.status;
        if (lastStatus === 429) break;
      }
      assert.equal(lastStatus, 429, 'Should rate-limit after repeated failed logins');
    });
  });

  // ── Password policy enforcement ────────────────────────────────────────────

  describe('Password policy', () => {
    const cases = [
      { desc: 'too short',             pw: 'Ab1',        expectedStatus: 400 },
      { desc: 'no digit',              pw: 'NoDigitsHere', expectedStatus: 400 },
      { desc: 'no letter',             pw: '12345678',   expectedStatus: 400 },
      { desc: 'valid password',        pw: 'GoodPass1',  expectedStatus: [200, 409] },
    ];

    for (const { desc, pw, expectedStatus } of cases) {
      test(`register: ${desc}`, async () => {
        const r = await api.post('/api/register', {
          username: `pwtest_${Date.now()}`, email: `pwt${Date.now()}@x.com`, password: pw,
        });
        const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
        assert.ok(expected.includes(r.status), `Expected ${expected.join('/')} got ${r.status} for password "${pw}"`);
      });
    }

    test('reset-password enforces same policy', async () => {
      const r = await api.post('/api/reset-password', { token: 'fake', password: 'weak' });
      assert.equal(r.status, 400);
    });
  });

  // ── CSRF note ─────────────────────────────────────────────────────────────
  // No CSRF token is implemented. Mutations rely solely on session cookies.
  // SameSite=lax mitigates most CSRF for cross-origin navigation, but a
  // full CSRF token implementation is recommended for production.
});
