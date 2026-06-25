// server.js
// Minimal book-tracking app: login/register, per-user "want to read",
// "already read", and "favorites" lists. Search is proxied to Open Library.

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database setup ----------
const db = new Database(path.join(__dirname, 'db', 'books.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
`);

// Add rating column to existing databases that predate it
try { db.exec('ALTER TABLE book_entries ADD COLUMN rating INTEGER'); } catch (_) {}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    // secure: true  // uncomment once served over HTTPS
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// ---------- Auth routes ----------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username and a password (6+ chars) are required.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ ok: true, username });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid username or password.' });

  req.session.userId = user.id;
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

// ---------- Book list routes ----------
app.get('/api/lists', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT list_type, book_key, title, author, cover_i, rating FROM book_entries WHERE user_id = ?')
    .all(req.session.userId);
  const out = { want: {}, read: {}, fav: {} };
  for (const row of rows) {
    out[row.list_type][row.book_key] = {
      title: row.title, author: row.author, cover_i: row.cover_i, key: row.book_key, rating: row.rating
    };
  }
  res.json(out);
});

app.post('/api/lists/:listType/toggle', requireAuth, (req, res) => {
  const { listType } = req.params;
  const { key, title, author, cover_i } = req.body;
  if (!['want', 'read', 'fav'].includes(listType)) {
    return res.status(400).json({ error: 'Invalid list type.' });
  }
  if (!key || !title) {
    return res.status(400).json({ error: 'Book key and title are required.' });
  }

  const existing = db.prepare(
    'SELECT id FROM book_entries WHERE user_id = ? AND list_type = ? AND book_key = ?'
  ).get(req.session.userId, listType, key);

  if (existing) {
    db.prepare('DELETE FROM book_entries WHERE id = ?').run(existing.id);
    return res.json({ ok: true, active: false });
  } else {
    db.prepare(
      'INSERT INTO book_entries (user_id, list_type, book_key, title, author, cover_i) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.session.userId, listType, key, title, author || null, cover_i || null);
    return res.json({ ok: true, active: true });
  }
});

app.patch('/api/lists/rating', requireAuth, (req, res) => {
  const { listType, key, rating } = req.body;
  if (!['want', 'read', 'fav'].includes(listType)) {
    return res.status(400).json({ error: 'Invalid list type.' });
  }
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

// ---------- Search proxy (avoids CORS issues, keeps API key logic server-side if added later) ----------
app.get('/api/search', requireAuth, async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing query.' });
  try {
    const upstream = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=24`);
    const json = await upstream.json();
    res.json(json.docs || []);
  } catch (e) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`Book website running at http://localhost:${PORT}`);
});
