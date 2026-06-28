'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const { startServer, makeClient } = require('../helpers/server.js');

const PORT = 3002;

describe('API Integration Tests', async () => {
  let srv, api;

  before(async () => {
    srv = await startServer({ port: PORT });
    api = makeClient(srv.baseUrl);
  });

  after(async () => {
    await srv.stop();
    try { fs.unlinkSync(srv.dbPath); } catch {}
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  describe('POST /api/register', () => {
    test('rejects missing fields', async () => {
      const r = await api.post('/api/register', { username: 'x' });
      assert.equal(r.status, 400);
    });

    test('rejects weak password (too short)', async () => {
      const r = await api.post('/api/register', { username: 'u1', email: 'u1@x.com', password: 'short' });
      assert.equal(r.status, 400);
      assert.match(r.data.error, /8\+/);
    });

    test('rejects password with no digit', async () => {
      const r = await api.post('/api/register', { username: 'u1', email: 'u1@x.com', password: 'noDIGITS!' });
      assert.equal(r.status, 400);
    });

    test('rejects invalid email', async () => {
      const r = await api.post('/api/register', { username: 'u1', email: 'not-email', password: 'Valid1pass' });
      assert.equal(r.status, 400);
    });

    test('creates account with valid data', async () => {
      const r = await api.post('/api/register', {
        username: 'apitest1', email: 'apitest1@example.com', password: 'TestPass1',
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.ok, true);
      assert.equal(r.data.username, 'apitest1');
    });

    test('rejects duplicate username', async () => {
      const r = await api.post('/api/register', {
        username: 'apitest1', email: 'other@example.com', password: 'TestPass1',
      });
      assert.equal(r.status, 409);
    });
  });

  describe('POST /api/login', () => {
    before(async () => {
      api.reset();
      await api.post('/api/register', { username: 'logintest', email: 'lt@x.com', password: 'TestPass1' });
      api.reset();
    });

    test('fails with wrong password', async () => {
      api.reset();
      const r = await api.post('/api/login', { username: 'logintest', password: 'WrongPass1' });
      assert.equal(r.status, 401);
    });

    test('fails with unknown user', async () => {
      api.reset();
      const r = await api.post('/api/login', { username: 'nobody', password: 'TestPass1' });
      assert.equal(r.status, 401);
    });

    test('succeeds with correct credentials', async () => {
      api.reset();
      const r = await api.post('/api/login', { username: 'logintest', password: 'TestPass1' });
      assert.equal(r.status, 200);
      assert.equal(r.data.ok, true);
    });

    test('session persists across requests', async () => {
      api.reset();
      await api.post('/api/login', { username: 'logintest', password: 'TestPass1' });
      const r = await api.get('/api/me');
      assert.equal(r.data.loggedIn, true);
      assert.equal(r.data.username, 'logintest');
    });
  });

  describe('POST /api/logout', () => {
    test('clears session', async () => {
      api.reset();
      await api.post('/api/login', { username: 'logintest', password: 'TestPass1' });
      await api.post('/api/logout');
      const r = await api.get('/api/me');
      assert.equal(r.data.loggedIn, false);
    });
  });

  describe('Auth guard — unauthenticated requests', () => {
    before(() => api.reset());

    const protectedRoutes = [
      ['GET',  '/api/lists'],
      ['GET',  '/api/reading'],
      ['GET',  '/api/dnf'],
      ['GET',  '/api/collections'],
      ['GET',  '/api/profile'],
      ['POST', '/api/lists/want/toggle'],
      ['POST', '/api/reading/add'],
      ['POST', '/api/reading/finish'],
    ];

    for (const [method, path] of protectedRoutes) {
      test(`${method} ${path} returns 401`, async () => {
        const r = method === 'GET' ? await api.get(path) : await api.post(path, {});
        assert.equal(r.status, 401, `Expected 401 for ${method} ${path}`);
      });
    }
  });

  // ── Helper to get a logged-in client (isolated — does not touch shared api) ─
  async function loggedInClient() {
    const c = makeClient(srv.baseUrl);
    const ts = Date.now() + Math.floor(Math.random() * 1e6);
    await c.post('/api/register', { username: `u${ts}`, email: `u${ts}@x.com`, password: 'TestPass1' });
    return c;
  }

  // ── Lists / Shelf ─────────────────────────────────────────────────────────

  describe('POST /api/lists/:listType/toggle', () => {
    test('adds book to want list', async () => {
      const c = await loggedInClient();
      const r = await c.post('/api/lists/want/toggle', { key: 'OL1W', title: 'Test Book', author: 'Author A', cover_i: null });
      assert.equal(r.status, 200);
      assert.equal(r.data.ok, true);
      assert.equal(r.data.active, true);
    });

    test('adding to read removes from want (mutual exclusivity)', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/want/toggle', { key: 'OL2W', title: 'Book B', author: 'Auth B', cover_i: null });
      const r = await c.post('/api/lists/read/toggle', { key: 'OL2W', title: 'Book B', author: 'Auth B', cover_i: null });
      assert.equal(r.data.ok, true);
      assert.ok((r.data.removed || []).includes('want'), 'want should be in removed');
      const lists = await c.get('/api/lists');
      assert.ok(lists.data.read['OL2W'], 'should be in read');
      assert.ok(!lists.data.want['OL2W'], 'should not be in want');
    });

    test('toggling off removes from list', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/fav/toggle', { key: 'OL3W', title: 'Book C', author: 'Auth C', cover_i: null });
      const r2 = await c.post('/api/lists/fav/toggle', { key: 'OL3W', title: 'Book C', author: 'Auth C', cover_i: null });
      assert.equal(r2.data.active, false);
    });

    test('rejects invalid list type', async () => {
      const c = await loggedInClient();
      const r = await c.post('/api/lists/invalid/toggle', { key: 'OL4W', title: 'X', author: 'Y', cover_i: null });
      assert.equal(r.status, 400);
    });
  });

  describe('PATCH /api/lists/rating', () => {
    test('sets and clears star rating', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OL10W', title: 'Rated Book', author: 'Auth', cover_i: null });
      const r = await c.patch('/api/lists/rating', { listType: 'read', key: 'OL10W', rating: 4 });
      assert.equal(r.data.rating, 4);
      const r2 = await c.patch('/api/lists/rating', { listType: 'read', key: 'OL10W', rating: null });
      assert.equal(r2.data.rating, null);
    });
  });

  // ── Currently Reading ─────────────────────────────────────────────────────

  describe('POST /api/reading/add', () => {
    test('adds book to reading list', async () => {
      const c = await loggedInClient();
      const r = await c.post('/api/reading/add', { key: 'OL5W', title: 'Reading Now', author: 'Auth', cover_i: null, total_pages: 300 });
      assert.equal(r.data.ok, true);
      const list = await c.get('/api/reading');
      assert.ok(list.data.find(b => b.key === 'OL5W'));
    });

    test('adding to reading removes from want', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/want/toggle', { key: 'OL6W', title: 'Was Wanted', author: 'Auth', cover_i: null });
      await c.post('/api/reading/add', { key: 'OL6W', title: 'Was Wanted', author: 'Auth', cover_i: null });
      const lists = await c.get('/api/lists');
      assert.ok(!lists.data.want['OL6W'], 'want should be cleared');
    });
  });

  describe('PATCH /api/reading/progress', () => {
    test('saves page progress', async () => {
      const c = await loggedInClient();
      await c.post('/api/reading/add', { key: 'OL7W', title: 'Progress Book', author: 'Auth', cover_i: null, total_pages: 400 });
      const r = await c.patch('/api/reading/progress', { key: 'OL7W', current_page: 150, total_pages: 400 });
      assert.equal(r.data.ok, true);
      const list = await c.get('/api/reading');
      const book = list.data.find(b => b.key === 'OL7W');
      assert.equal(book.current_page, 150);
    });
  });

  describe('POST /api/reading/finish', () => {
    test('moves book from reading to read', async () => {
      const c = await loggedInClient();
      await c.post('/api/reading/add', { key: 'OL8W', title: 'Finished Book', author: 'Auth', cover_i: null, total_pages: 250 });
      const r = await c.post('/api/reading/finish', { key: 'OL8W', title: 'Finished Book', author: 'Auth', cover_i: null, total_pages: 250 });
      assert.equal(r.data.ok, true);
      const reading = await c.get('/api/reading');
      assert.ok(!reading.data.find(b => b.key === 'OL8W'), 'removed from reading');
      const lists = await c.get('/api/lists');
      assert.ok(lists.data.read['OL8W'], 'added to read');
    });
  });

  // ── DNF ───────────────────────────────────────────────────────────────────

  describe('POST /api/dnf/add', () => {
    test('marks book as DNF and removes from reading', async () => {
      const c = await loggedInClient();
      await c.post('/api/reading/add', { key: 'OL9W', title: 'DNF Book', author: 'Auth', cover_i: null });
      const r = await c.post('/api/dnf/add', { key: 'OL9W', title: 'DNF Book', author: 'Auth', cover_i: null });
      assert.equal(r.data.ok, true);
      const reading = await c.get('/api/reading');
      assert.ok(!reading.data.find(b => b.key === 'OL9W'), 'removed from reading');
      const dnf = await c.get('/api/dnf');
      assert.ok(dnf.data.find(b => b.key === 'OL9W'), 'in dnf list');
    });

    test('adding DNF book to a shelf clears DNF', async () => {
      const c = await loggedInClient();
      await c.post('/api/dnf/add', { key: 'OL11W', title: 'Back From DNF', author: 'Auth', cover_i: null });
      await c.post('/api/lists/want/toggle', { key: 'OL11W', title: 'Back From DNF', author: 'Auth', cover_i: null });
      const dnf = await c.get('/api/dnf');
      assert.ok(!dnf.data.find(b => b.key === 'OL11W'), 'removed from DNF');
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────

  describe('GET /api/search', () => {
    test('returns 400 without query', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/search');
      assert.equal(r.status, 400);
    });

    test('returns array for known title (network-dependent)', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/search?q=hamlet');
      if (r.status !== 200) return; // skip if network unavailable in CI
      assert.ok(Array.isArray(r.data));
    });
  });

  // ── Collections ───────────────────────────────────────────────────────────

  describe('Collections CRUD', () => {
    test('create, view, add book, remove book, delete', async () => {
      const c = await loggedInClient();

      // Create
      const cr = await c.post('/api/collections', { name: 'My Favourites' });
      assert.equal(cr.data.ok, true);
      const colId = cr.data.id;

      // List
      const list = await c.get('/api/collections');
      assert.ok(list.data.find(c => c.id === colId));

      // Add book
      const ab = await c.post(`/api/collections/${colId}/books`, { key: 'OL20W', title: 'Col Book', author: 'Auth', cover_i: null });
      assert.equal(ab.data.ok, true);

      // View books
      const books = await c.get(`/api/collections/${colId}/books`);
      assert.ok(books.data.find(b => b.key === 'OL20W'));

      // Remove book
      const rb = await c.del(`/api/collections/${colId}/books/${encodeURIComponent('OL20W')}`);
      assert.equal(rb.data.ok, true);
      const books2 = await c.get(`/api/collections/${colId}/books`);
      assert.ok(!books2.data.find(b => b.key === 'OL20W'));

      // Delete collection
      const dc = await c.del(`/api/collections/${colId}`);
      assert.equal(dc.data.ok, true);
      const list2 = await c.get('/api/collections');
      assert.ok(!list2.data.find(c => c.id === colId));
    });
  });

  // ── Profile ───────────────────────────────────────────────────────────────

  describe('GET /api/profile', () => {
    test('returns expected profile fields', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/profile');
      assert.equal(r.status, 200);
      assert.ok('username' in r.data);
      assert.ok('stats' in r.data);
      assert.ok('totalPages' in r.data);
      assert.ok('currentStreak' in r.data);
      assert.ok('goal' in r.data);
      assert.ok(!('password_hash' in r.data), 'must not expose password_hash');
    });
  });

  // ── Password reset ────────────────────────────────────────────────────────

  describe('POST /api/reset-password', () => {
    test('rejects invalid or missing token', async () => {
      const r = await api.post('/api/reset-password', { token: 'fake-token', password: 'NewPass1' });
      assert.equal(r.status, 400);
    });

    test('rejects weak password in reset', async () => {
      const r = await api.post('/api/reset-password', { token: 'any', password: 'weak' });
      assert.equal(r.status, 400);
    });
  });
});
