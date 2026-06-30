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

    test('filters coverless books — every result has cover_i (network-dependent)', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/search?q=hamlet');
      if (r.status !== 200) return; // skip if network unavailable
      assert.ok(Array.isArray(r.data));
      for (const book of r.data) {
        assert.ok(book.cover_i, `Expected cover_i on "${book.title}" but got ${book.cover_i}`);
      }
    });

    test('all search results have required quality fields (network-dependent)', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/search?q=tolkien');
      if (r.status !== 200) return; // skip if network unavailable
      assert.ok(Array.isArray(r.data));
      for (const book of r.data) {
        assert.ok(book.cover_i,            `Missing cover_i on "${book.title}"`);
        assert.ok(book.first_publish_year, `Missing first_publish_year on "${book.title}"`);
        assert.ok(Array.isArray(book.author_name) && book.author_name.length > 0,
                  `Missing author_name on "${book.title}"`);
      }
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

  // ── Reading History ───────────────────────────────────────────────────────

  describe('GET /api/reading/history', () => {
    before(() => api.reset());

    test('unauthenticated request returns 401', async () => {
      const r = await api.get('/api/reading/history');
      assert.equal(r.status, 401);
    });

    test('returns empty array when no read books', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/reading/history');
      assert.equal(r.status, 200);
      assert.deepEqual(r.data, []);
    });

    test('returns book with correct fields after adding to read shelf', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLH1W', title: 'History Book', author: 'Auth H', cover_i: 99999 });
      const r = await c.get('/api/reading/history');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.data));
      assert.equal(r.data.length, 1);
      const book = r.data[0];
      assert.equal(book.book_key, 'OLH1W');
      assert.equal(book.title, 'History Book');
      assert.equal(book.author, 'Auth H');
      assert.equal(book.cover_i, 99999);
      assert.ok('added_at' in book);
    });

    test('returns multiple books ordered by added_at DESC', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLH2W', title: 'First Book', author: 'Auth', cover_i: null });
      await c.post('/api/lists/read/toggle', { key: 'OLH3W', title: 'Second Book', author: 'Auth', cover_i: null });
      const r = await c.get('/api/reading/history');
      assert.equal(r.status, 200);
      assert.ok(r.data.length >= 2);
      assert.ok(r.data[0].added_at >= r.data[1].added_at, 'results should be ordered added_at DESC');
    });

    test('cover_i is null for books added without a cover', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLH4W', title: 'No Cover Book', author: 'Auth', cover_i: null });
      const r = await c.get('/api/reading/history');
      assert.equal(r.status, 200);
      const book = r.data.find(b => b.book_key === 'OLH4W');
      assert.ok(book, 'book should be present in history');
      assert.equal(book.cover_i, null);
    });
  });

  // ── Book of the Week ─────────────────────────────────────────────────────

  describe('GET /api/discover/book-of-week', () => {
    before(() => api.reset());

    test('public endpoint — no auth required', async () => {
      const r = await api.get('/api/discover/book-of-week');
      assert.equal(r.status, 200);
    });

    test('returns required fields', async () => {
      const r = await api.get('/api/discover/book-of-week');
      assert.equal(r.status, 200);
      assert.ok(r.data.key,              'should have key');
      assert.ok(r.data.title,            'should have title');
      assert.ok(r.data.author,           'should have author');
      assert.ok('blurb' in r.data,       'should have blurb key (may be null)');
    });

    test('key is a string starting with /works/', async () => {
      const r = await api.get('/api/discover/book-of-week');
      assert.equal(typeof r.data.key, 'string');
      assert.ok(r.data.key.startsWith('/works/'), `key should start with /works/, got "${r.data.key}"`);
    });

    test('consistent within same session — cache is warm', async () => {
      const r1 = await api.get('/api/discover/book-of-week');
      const r2 = await api.get('/api/discover/book-of-week');
      assert.equal(r1.data.key,   r2.data.key);
      assert.equal(r1.data.title, r2.data.title);
    });
  });

  // ── OAuth routes ──────────────────────────────────────────────────────────

  describe('OAuth routes', () => {
    before(() => api.reset());

    test('GET /auth/google returns 404 when GOOGLE_CLIENT_ID is not set', async () => {
      if (process.env.GOOGLE_CLIENT_ID) return;
      const r = await api.get('/auth/google');
      assert.equal(r.status, 404);
    });

    test('GET /auth/github returns 404 when GITHUB_CLIENT_ID is not set', async () => {
      if (process.env.GITHUB_CLIENT_ID) return;
      const r = await api.get('/auth/github');
      assert.equal(r.status, 404);
    });
  });

  // ── Discover Similar ──────────────────────────────────────────────────────

  describe('GET /api/discover/similar', () => {
    before(() => api.reset());

    test('unauthenticated request returns 401', async () => {
      const r = await api.get('/api/discover/similar?subject=fiction');
      assert.equal(r.status, 401);
    });

    test('missing subject param returns 400 with error', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/discover/similar');
      assert.equal(r.status, 400);
      assert.ok(r.data.error, 'should include an error message');
    });

    test('valid subject returns array (network-dependent)', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/discover/similar?subject=fiction');
      if (r.status !== 200) return;
      assert.ok(Array.isArray(r.data));
    });
  });

  // ── Book Notes ────────────────────────────────────────────────────────────

  describe('GET/POST /api/notes/:bookKey', () => {
    test('GET unauthenticated → 401', async () => {
      api.reset();
      const r = await api.get('/api/notes/OLN0W');
      assert.equal(r.status, 401);
    });

    test('GET for book not on any shelf → { note: null, quote: null }', async () => {
      const c = await loggedInClient();
      const r = await c.get('/api/notes/OL_NOT_ON_SHELF_W');
      assert.equal(r.status, 200);
      assert.deepEqual(r.data, { note: null, quote: null });
    });

    test('POST saves note and quote for shelved book → { ok: true }', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLN1W', title: 'Note Book One', author: 'Auth', cover_i: null });
      const r = await c.post('/api/notes/OLN1W', { note: 'test note', quote: 'test quote' });
      assert.equal(r.status, 200);
      assert.equal(r.data.ok, true);
    });

    test('GET after saving returns the saved note and quote', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLN2W', title: 'Note Book Two', author: 'Auth', cover_i: null });
      await c.post('/api/notes/OLN2W', { note: 'test note', quote: 'test quote' });
      const r = await c.get('/api/notes/OLN2W');
      assert.equal(r.status, 200);
      assert.equal(r.data.note, 'test note');
      assert.equal(r.data.quote, 'test quote');
    });

    test('POST with only note — quote remains null', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLN3W', title: 'Note Book Three', author: 'Auth', cover_i: null });
      await c.post('/api/notes/OLN3W', { note: 'only a note' });
      const r = await c.get('/api/notes/OLN3W');
      assert.equal(r.status, 200);
      assert.equal(r.data.note, 'only a note');
      assert.equal(r.data.quote, null);
    });

    test('POST unauthenticated → 401', async () => {
      api.reset();
      const r = await api.post('/api/notes/OLN4W', { note: 'test' });
      assert.equal(r.status, 401);
    });
  });

  // ── Public Profile ────────────────────────────────────────────────────────

  describe('GET /api/public/:username', () => {
    test('unknown username → 404 with error field', async () => {
      const r = await api.get('/api/public/no_such_user_xyz_999');
      assert.equal(r.status, 404);
      assert.ok(r.data.error, 'should have error field');
    });

    test('known user with no books → 200 with empty shelves', async () => {
      const c = await loggedInClient();
      const me = await c.get('/api/me');
      const username = me.data.username;
      const r = await api.get(`/api/public/${username}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.username, username);
      assert.ok('stats' in r.data, 'should have stats');
      assert.deepEqual(r.data.read, []);
      assert.deepEqual(r.data.want, []);
      assert.deepEqual(r.data.fav, []);
    });

    test('known user with a read book → read array contains that book', async () => {
      const c = await loggedInClient();
      await c.post('/api/lists/read/toggle', { key: 'OLP1W', title: 'Public Book', author: 'Author P', cover_i: null });
      const me = await c.get('/api/me');
      const username = me.data.username;
      const r = await api.get(`/api/public/${username}`);
      assert.equal(r.status, 200);
      assert.ok(r.data.read.some(b => b.title === 'Public Book'), 'read array should contain the added book');
    });

    test('response does not contain password_hash or email', async () => {
      const c = await loggedInClient();
      const me = await c.get('/api/me');
      const username = me.data.username;
      const r = await api.get(`/api/public/${username}`);
      assert.equal(r.status, 200);
      assert.ok(!('password_hash' in r.data), 'must not expose password_hash');
      assert.ok(!('email' in r.data), 'must not expose email');
    });

    test('unauthenticated request returns 200 for known user', async () => {
      const c = await loggedInClient();
      const me = await c.get('/api/me');
      const username = me.data.username;
      api.reset();
      const r = await api.get(`/api/public/${username}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.username, username);
    });
  });

  // ── Goodreads Import ──────────────────────────────────────────────────────

  describe('POST /api/import/goodreads', () => {
    const BASE_CSV = [
      'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
      '1,The Great Gatsby,F. Scott Fitzgerald,Fitzgerald F. Scott,,="0743273567",="9780743273565",0,180,2004,1925,2024/01/15,2024/01/01,,,"read",,,,1,0',
      '2,Dune,Frank Herbert,Herbert Frank,,="0441013597",="9780441013593",0,412,1990,1965,,,,,"to-read",,,,0,0',
    ].join('\n');

    async function uploadCsv(c, csvText) {
      const form = new FormData();
      form.append('file', new Blob([csvText], { type: 'text/csv' }), 'goodreads.csv');
      const res = await fetch(srv.baseUrl + '/api/import/goodreads', {
        method: 'POST',
        headers: { 'Cookie': c.getCookie() },
        body: form,
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return { status: res.status, data };
    }

    test('unauthenticated → 401', async () => {
      api.reset();
      const r = await api.post('/api/import/goodreads', {});
      assert.equal(r.status, 401);
    });

    test('no file attached → 400', async () => {
      const c = await loggedInClient();
      const r = await c.post('/api/import/goodreads', {});
      assert.equal(r.status, 400);
    });

    test('valid CSV with 1 read + 1 to-read → imported: 2, skipped: 0, books appear on shelves', async () => {
      const c = await loggedInClient();
      const r = await uploadCsv(c, BASE_CSV);
      assert.equal(r.status, 200);
      assert.equal(r.data.imported, 2);
      assert.equal(r.data.skipped, 0);
      const lists = await c.get('/api/lists');
      assert.ok(lists.data.read['/isbn/9780743273565'], 'Gatsby should be in read list');
      assert.ok(lists.data.want['/isbn/9780441013593'], 'Dune should be in want list');
    });

    test('importing same CSV twice — counter still increments but no duplicate DB rows', async () => {
      const c = await loggedInClient();
      await uploadCsv(c, BASE_CSV);
      const r = await uploadCsv(c, BASE_CSV);
      assert.equal(r.status, 200);
      assert.equal(r.data.imported, 2, 'server increments imported counter even when INSERT OR IGNORE skips');
      const lists = await c.get('/api/lists');
      assert.equal(Object.keys(lists.data.read).length, 1, 'should have exactly 1 read book — no duplicate');
    });

    test('CSV with currently-reading shelf → book imported into reading list', async () => {
      const c = await loggedInClient();
      const csvText = [
        'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
        '3,Foundation,Isaac Asimov,Asimov Isaac,,="0553293354",="9780553293357",0,255,1991,1951,,,,,"currently-reading",,,,0,0',
      ].join('\n');
      const r = await uploadCsv(c, csvText);
      assert.equal(r.status, 200);
      assert.equal(r.data.imported, 1);
      assert.equal(r.data.skipped, 0);
      const reading = await c.get('/api/reading');
      assert.ok(reading.data.some(b => b.title === 'Foundation'), 'Foundation should appear in currently reading');
    });
  });
});
