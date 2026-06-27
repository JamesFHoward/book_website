// server.js
require('dotenv').config();

const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const path     = require('path');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'db', 'books.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS book_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    list_type TEXT NOT NULL CHECK(list_type IN ('want','read','fav')),
    book_key TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    cover_i INTEGER,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    rating INTEGER,
    UNIQUE(user_id, list_type, book_key),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS currently_reading (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_key TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    cover_i INTEGER,
    cover_isbn TEXT,
    total_pages INTEGER,
    current_page INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_key),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reading_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    goal_books INTEGER NOT NULL,
    UNIQUE(user_id, year),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migrations for databases that predate these columns
try { db.exec('ALTER TABLE users ADD COLUMN email TEXT UNIQUE'); }         catch (_) {}
try { db.exec('ALTER TABLE book_entries ADD COLUMN rating INTEGER'); }     catch (_) {}
try { db.exec('ALTER TABLE book_entries ADD COLUMN note TEXT'); }          catch (_) {}

// ---------- Email ----------
const mailer = (process.env.EMAIL_USER && process.env.EMAIL_PASS)
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

function sendMail(to, subject, html) {
  if (!mailer) return Promise.resolve();
  return mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to, subject, html,
  });
}

function welcomeEmail(username) {
  return `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#1a0c04">
      <h2 style="font-weight:normal;letter-spacing:.1em">Welcome to Bookshelf</h2>
      <p>Hi ${username},</p>
      <p>Your account is all set. Start tracking what you've read — and what's next.</p>
      <p style="margin-top:32px;font-size:12px;color:#888">You're receiving this because you signed up at Bookshelf.</p>
    </div>`;
}

function resetEmail(username, resetUrl) {
  return `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#1a0c04">
      <h2 style="font-weight:normal;letter-spacing:.1em">Reset your password</h2>
      <p>Hi ${username},</p>
      <p>Click the link below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#2c1508;color:#f4edd6;padding:10px 22px;text-decoration:none;font-size:14px">
          Reset password
        </a>
      </p>
      <p style="font-size:12px;color:#888">If you didn't request this, you can safely ignore this email.</p>
    </div>`;
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// ---------- Auth routes ----------
app.get('/api/check-username', (req, res) => {
  const username = (req.query.u || '').trim();
  if (!username) return res.json({ available: false });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  res.json({ available: !existing });
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must be 8+ characters and include a letter and a number.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  try {
    const hash   = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email.toLowerCase().trim(), hash);

    req.session.userId   = result.lastInsertRowid;
    req.session.username = username;

    sendMail(email, 'Welcome to Bookshelf', welcomeEmail(username))
      .catch(err => console.error('[email] welcome failed:', err));

    res.json({ ok: true, username });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      const taken = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      return res.status(409).json({
        error: taken ? 'That email is already registered.' : 'That username is already taken.',
      });
    }
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match)  return res.status(401).json({ error: 'Invalid username or password.' });

  req.session.userId   = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: req.session.username });
});

// ---------- Profile ----------
app.get('/api/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT username, email, created_at FROM users WHERE id = ?').get(req.session.userId);
  const counts = db.prepare(
    `SELECT list_type, COUNT(*) as n FROM book_entries WHERE user_id = ? GROUP BY list_type`
  ).all(req.session.userId);
  const stats = { want: 0, read: 0, fav: 0 };
  for (const row of counts) stats[row.list_type] = row.n;
  const readingCount = db.prepare(
    `SELECT COUNT(*) as n FROM currently_reading WHERE user_id = ?`
  ).get(req.session.userId).n;
  const year = new Date().getFullYear();
  const goalRow = db.prepare('SELECT goal_books FROM reading_goals WHERE user_id = ? AND year = ?').get(req.session.userId, year);
  const booksReadThisYear = db.prepare(
    `SELECT COUNT(*) as n FROM book_entries WHERE user_id = ? AND list_type = 'read' AND substr(added_at,1,4) = ?`
  ).get(req.session.userId, String(year)).n;
  const recent = db.prepare(
    `SELECT title, author, list_type, added_at FROM book_entries WHERE user_id = ? ORDER BY added_at DESC LIMIT 8`
  ).all(req.session.userId);
  res.json({
    ...user, stats, readingCount, recent,
    goal: { year, target: goalRow ? goalRow.goal_books : null, read: booksReadThisYear },
  });
});

// ---------- Password reset ----------
app.post('/api/forgot-password', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email required.' });

  // Always respond with ok to prevent email enumeration
  res.json({ ok: true });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return;

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(user.id, token, expiresAt);

  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
  sendMail(email, 'Reset your Bookshelf password', resetEmail(user.username, resetUrl))
    .catch(err => console.error('[email] reset failed:', err));
});

app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ error: 'A valid token and password (6+ chars) are required.' });
  }

  const record = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token);
  if (!record || record.expires_at < Date.now()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, record.user_id);
  db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(record.id);

  res.json({ ok: true });
});

// ---------- Book list routes ----------
app.get('/api/lists', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT list_type, book_key, title, author, cover_i, rating, note FROM book_entries WHERE user_id = ?'
  ).all(req.session.userId);
  const out = { want: {}, read: {}, fav: {} };
  for (const row of rows) {
    out[row.list_type][row.book_key] = {
      title: row.title, author: row.author, cover_i: row.cover_i,
      key: row.book_key, rating: row.rating, note: row.note || null,
    };
  }
  res.json(out);
});

app.post('/api/lists/:listType/toggle', requireAuth, (req, res) => {
  const { listType } = req.params;
  const { key, title, author, cover_i } = req.body;
  if (!['want', 'read', 'fav'].includes(listType)) return res.status(400).json({ error: 'Invalid list type.' });
  if (!key || !title) return res.status(400).json({ error: 'Book key and title are required.' });

  const existing = db.prepare(
    'SELECT id FROM book_entries WHERE user_id = ? AND list_type = ? AND book_key = ?'
  ).get(req.session.userId, listType, key);

  if (existing) {
    db.prepare('DELETE FROM book_entries WHERE id = ?').run(existing.id);
    return res.json({ ok: true, active: false });
  }

  // Enforce mutual exclusivity: want ↔ read ↔ reading
  const removed = [];
  if (listType === 'want' || listType === 'read') {
    const conflict = listType === 'want' ? 'read' : 'want';
    const r1 = db.prepare('DELETE FROM book_entries WHERE user_id = ? AND list_type = ? AND book_key = ?')
      .run(req.session.userId, conflict, key);
    if (r1.changes) removed.push(conflict);
    // Adding to read also clears currently_reading (finished it)
    if (listType === 'read') {
      const r2 = db.prepare('DELETE FROM currently_reading WHERE user_id = ? AND book_key = ?')
        .run(req.session.userId, key);
      if (r2.changes) removed.push('reading');
    }
  }

  db.prepare(
    'INSERT INTO book_entries (user_id, list_type, book_key, title, author, cover_i) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.session.userId, listType, key, title, author || null, cover_i || null);
  res.json({ ok: true, active: true, removed });
});

app.patch('/api/lists/note', requireAuth, (req, res) => {
  const { listType, key, note } = req.body;
  if (!['want', 'read', 'fav'].includes(listType)) return res.status(400).json({ error: 'Invalid list type.' });
  if (!key) return res.status(400).json({ error: 'Key required.' });
  db.prepare('UPDATE book_entries SET note = ? WHERE user_id = ? AND list_type = ? AND book_key = ?')
    .run(note ? String(note).slice(0, 2000) : null, req.session.userId, listType, key);
  res.json({ ok: true });
});

app.patch('/api/lists/rating', requireAuth, (req, res) => {
  const { listType, key, rating } = req.body;
  if (!['want', 'read', 'fav'].includes(listType)) return res.status(400).json({ error: 'Invalid list type.' });
  if (!key) return res.status(400).json({ error: 'Key required.' });
  const r = (Number.isInteger(rating) && rating >= 1 && rating <= 5) ? rating : null;
  db.prepare('UPDATE book_entries SET rating = ? WHERE user_id = ? AND list_type = ? AND book_key = ?')
    .run(r, req.session.userId, listType, key);
  res.json({ ok: true, rating: r });
});

app.delete('/api/lists/:listType/:key', requireAuth, (req, res) => {
  const { listType, key } = req.params;
  db.prepare('DELETE FROM book_entries WHERE user_id = ? AND list_type = ? AND book_key = ?')
    .run(req.session.userId, listType, key);
  res.json({ ok: true });
});

// ---------- Currently Reading ----------
app.get('/api/reading', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT book_key, title, author, cover_i, cover_isbn, total_pages, current_page, started_at FROM currently_reading WHERE user_id = ? ORDER BY started_at DESC'
  ).all(req.session.userId);
  res.json(rows.map(r => ({ ...r, key: r.book_key })));
});

app.post('/api/reading/add', requireAuth, (req, res) => {
  const { key, title, author, cover_i, cover_isbn, total_pages } = req.body;
  if (!key || !title) return res.status(400).json({ error: 'Key and title required.' });
  const pages = Number.isInteger(total_pages) && total_pages > 0 ? total_pages : null;
  try {
    // Adding to reading removes from want (no need to keep it in want-to-read)
    db.prepare('DELETE FROM book_entries WHERE user_id = ? AND list_type = ? AND book_key = ?')
      .run(req.session.userId, 'want', key);
    db.prepare(
      'INSERT OR IGNORE INTO currently_reading (user_id, book_key, title, author, cover_i, cover_isbn, total_pages) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.session.userId, key, title, author || null, cover_i || null, cover_isbn || null, pages);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/reading/progress', requireAuth, (req, res) => {
  const { key, current_page, total_pages } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required.' });
  const cp = Number.isInteger(current_page) && current_page >= 0 ? current_page : null;
  const tp = Number.isInteger(total_pages) && total_pages > 0 ? total_pages : null;
  if (cp !== null) db.prepare('UPDATE currently_reading SET current_page = ? WHERE user_id = ? AND book_key = ?').run(cp, req.session.userId, key);
  if (tp !== null) db.prepare('UPDATE currently_reading SET total_pages = ? WHERE user_id = ? AND book_key = ?').run(tp, req.session.userId, key);
  res.json({ ok: true });
});

app.post('/api/reading/finish', requireAuth, (req, res) => {
  const { key, title, author, cover_i } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required.' });
  db.prepare('DELETE FROM currently_reading WHERE user_id = ? AND book_key = ?').run(req.session.userId, key);
  try {
    db.prepare(
      'INSERT OR IGNORE INTO book_entries (user_id, list_type, book_key, title, author, cover_i) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.session.userId, 'read', key, title, author || null, cover_i || null);
  } catch (_) {}
  res.json({ ok: true });
});

app.delete('/api/reading/:key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM currently_reading WHERE user_id = ? AND book_key = ?').run(req.session.userId, req.params.key);
  res.json({ ok: true });
});

// ---------- Reading Goals ----------
app.get('/api/goals/:year', requireAuth, (req, res) => {
  const year = parseInt(req.params.year, 10);
  const row = db.prepare('SELECT goal_books FROM reading_goals WHERE user_id = ? AND year = ?').get(req.session.userId, year);
  // Count books added to the "read" list this year
  const booksRead = db.prepare(
    "SELECT COUNT(*) as cnt FROM book_entries WHERE user_id = ? AND list_type = 'read' AND substr(added_at,1,4) = ?"
  ).get(req.session.userId, String(year));
  res.json({ year, goal: row ? row.goal_books : null, read: booksRead.cnt });
});

app.post('/api/goals', requireAuth, (req, res) => {
  const { year, goal_books } = req.body;
  const y = parseInt(year, 10);
  const g = parseInt(goal_books, 10);
  if (!y || !g || g < 1 || g > 9999) return res.status(400).json({ error: 'Invalid goal.' });
  db.prepare('INSERT OR REPLACE INTO reading_goals (user_id, year, goal_books) VALUES (?, ?, ?)').run(req.session.userId, y, g);
  res.json({ ok: true });
});

// ---------- Search proxy ----------
const searchCache = new Map();
const SEARCH_TTL  = 5 * 60 * 1000;
const OL_FIELDS   = 'key,title,author_name,cover_i,first_publish_year,number_of_pages_median,publisher,isbn,first_sentence,subject';

app.get('/api/search', requireAuth, async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing query.' });
  const ck = q.toLowerCase().trim();
  const hit = searchCache.get(ck);
  if (hit && Date.now() - hit.ts < SEARCH_TTL) return res.json(hit.data);
  try {
    const upstream = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=24&fields=${OL_FIELDS}`
    );
    const json = await upstream.json();
    const docs = json.docs || [];
    searchCache.set(ck, { data: docs, ts: Date.now() });
    res.json(docs);
  } catch {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ---------- Genre book padding ----------
const genreBookCache = new Map();
const GENRE_BOOK_TTL = 2 * 60 * 60 * 1000;

app.get('/api/discover/genre', requireAuth, async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing q.' });
  const ck = q.toLowerCase().trim();
  const hit = genreBookCache.get(ck);
  if (hit && Date.now() - hit.ts < GENRE_BOOK_TTL) return res.json(hit.data);
  try {
    const upstream = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=60&fields=${OL_FIELDS}`
    );
    const json = await upstream.json();
    const EXCLUDE_SUBJECTS = ['manga','comic','comics','graphic novel','graphic novels','manhwa','manhua','light novel','anime'];
    const books = (json.docs || []).filter(b => {
      if (!b.cover_i) return false;
      const subs = (b.subject || []).map(s => s.toLowerCase());
      return !EXCLUDE_SUBJECTS.some(ex => subs.some(s => s.includes(ex)));
    });
    genreBookCache.set(ck, { data: books, ts: Date.now() });
    res.json(books);
  } catch {
    res.status(500).json({ error: 'Failed.' });
  }
});

// ---------- Book description ----------
const descCache = new Map();
const DESC_TTL   = 60 * 60 * 1000;

app.get('/api/book/:key/description', requireAuth, async (req, res) => {
  const key = req.params.key;
  const hit = descCache.get(key);
  if (hit && Date.now() - hit.ts < DESC_TTL) return res.json(hit.data);
  try {
    const r    = await fetch(`https://openlibrary.org/works/${key}.json`);
    const json = await r.json();
    let description = null;
    if (json.description) {
      description = typeof json.description === 'string'
        ? json.description
        : (json.description.value || null);
    }
    const data = { description };
    descCache.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch {
    res.json({ description: null });
  }
});

// ---------- Cover lookup ----------
// Tries multiple Open Library strategies to find a cover for any book.
// Returns { cover_i, cover_isbn } or { cover_i: null, cover_isbn: null }.
const coverCache = new Map();

async function olSearch(query) {
  try {
    const url = `https://openlibrary.org/search.json?${query}&limit=5&fields=title,author_name,cover_i,isbn`;
    const res = await fetch(url);
    const json = await res.json();
    return json.docs || [];
  } catch { return []; }
}

async function coverSize(url) {
  try {
    const r = await fetch(url);
    const buf = await r.arrayBuffer();
    return buf.byteLength;
  } catch { return 0; }
}

async function checkCoverById(cover_i) {
  return (await coverSize(`https://covers.openlibrary.org/b/id/${cover_i}-S.jpg`)) > 500;
}

async function checkCoverByIsbn(isbn) {
  return (await coverSize(`https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg`)) > 500;
}

// Use Open Library ISBN API to get a verified cover_i for an ISBN.
// This is more accurate than the search index cover_i.
async function coverIdFromIsbn(isbn) {
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`;
    const res  = await fetch(url);
    const json = await res.json();
    const entry = json[`ISBN:${isbn}`];
    if (!entry?.cover?.medium) return null;
    // Extract cover_i from URL: .../b/id/7865904-M.jpg
    const m = entry.cover.medium.match(/\/b\/id\/(\d+)-/);
    return m ? parseInt(m[1], 10) : null;
  } catch { return null; }
}

async function findCover(title, author) {
  const cacheKey = `${title}|||${author || ''}`.toLowerCase();
  if (coverCache.has(cacheKey)) return coverCache.get(cacheKey);

  const strategies = [
    `q=${encodeURIComponent(`${title} ${author || ''}`.trim())}`,
    `title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ''}`,
    `q=${encodeURIComponent(title)}`,
  ];

  for (const query of strategies) {
    const docs = await olSearch(query);
    for (const doc of docs) {
      // Prefer verifying via ISBNs using the ISBN API (gives accurate cover_i for confirmed editions)
      for (const isbn of (doc.isbn || []).slice(0, 4)) {
        const verified = await coverIdFromIsbn(isbn);
        if (verified) {
          const result = { cover_i: verified, cover_isbn: null };
          coverCache.set(cacheKey, result);
          return result;
        }
      }
      // Fall back to checking the search index cover_i directly
      if (doc.cover_i && await checkCoverById(doc.cover_i)) {
        const result = { cover_i: doc.cover_i, cover_isbn: null };
        coverCache.set(cacheKey, result);
        return result;
      }
    }
  }

  const result = { cover_i: null, cover_isbn: null };
  coverCache.set(cacheKey, result);
  return result;
}

app.get('/api/covers/lookup', requireAuth, async (req, res) => {
  const { title, author } = req.query;
  if (!title) return res.status(400).json({ error: 'Missing title.' });
  try {
    const cover = await findCover(title, author || '');
    res.json(cover);
  } catch {
    res.status(500).json({ error: 'Cover lookup failed.' });
  }
});

app.listen(PORT, () => console.log(`Bookshelf running at http://localhost:${PORT}`));
