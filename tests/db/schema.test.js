'use strict';
const { describe, test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const Database = require('better-sqlite3');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const { startServer } = require('../helpers/server.js');

const PORT   = 3004;

describe('Database Schema Integrity', async () => {
  let srv, db;

  before(async () => {
    srv = await startServer({ port: PORT });
    db = new Database(srv.dbPath, { readonly: true });
  });

  after(async () => {
    db.close();
    await srv.stop();
    try { fs.unlinkSync(srv.dbPath); } catch {}
  });

  const expectedTables = [
    'users',
    'book_entries',
    'currently_reading',
    'reading_goals',
    'dnf_books',
    'collections',
    'collection_books',
    'password_reset_tokens',
  ];

  test('all expected tables exist', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map(r => r.name);
    for (const t of expectedTables) {
      assert.ok(tables.includes(t), `Missing table: ${t}`);
    }
  });

  test('users table has correct columns', () => {
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    for (const col of ['id', 'username', 'email', 'password_hash', 'created_at']) {
      assert.ok(cols.includes(col), `Missing column users.${col}`);
    }
  });

  test('book_entries table has correct columns including migrations', () => {
    const cols = db.prepare("PRAGMA table_info(book_entries)").all().map(c => c.name);
    for (const col of ['id', 'user_id', 'list_type', 'book_key', 'title', 'author', 'cover_i', 'rating', 'note', 'pages']) {
      assert.ok(cols.includes(col), `Missing column book_entries.${col}`);
    }
  });

  test('book_entries has UNIQUE constraint on (user_id, list_type, book_key)', () => {
    const indexes = db.prepare("PRAGMA index_list(book_entries)").all();
    const uniqueIndexes = indexes.filter(i => i.unique);
    // Check that the composite unique constraint exists via index info
    let found = false;
    for (const idx of uniqueIndexes) {
      const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map(c => c.name);
      if (cols.includes('user_id') && cols.includes('list_type') && cols.includes('book_key')) {
        found = true;
      }
    }
    assert.ok(found, 'UNIQUE(user_id, list_type, book_key) should exist');
  });

  test('currently_reading has UNIQUE constraint on (user_id, book_key)', () => {
    const indexes = db.prepare("PRAGMA index_list(currently_reading)").all();
    const uniqueIndexes = indexes.filter(i => i.unique);
    let found = false;
    for (const idx of uniqueIndexes) {
      const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map(c => c.name);
      if (cols.includes('user_id') && cols.includes('book_key')) found = true;
    }
    assert.ok(found, 'UNIQUE(user_id, book_key) on currently_reading should exist');
  });

  test('collection_books has UNIQUE constraint on (collection_id, book_key)', () => {
    const indexes = db.prepare("PRAGMA index_list(collection_books)").all();
    const uniqueIndexes = indexes.filter(i => i.unique);
    let found = false;
    for (const idx of uniqueIndexes) {
      const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map(c => c.name);
      if (cols.includes('collection_id') && cols.includes('book_key')) found = true;
    }
    assert.ok(found, 'UNIQUE(collection_id, book_key) on collection_books should exist');
  });

  test('book_entries CHECK constraint only allows want/read/fav', () => {
    // Open a writable copy to test constraint enforcement
    const dbW = new Database(srv.dbPath);
    // Must create a user first (FK)
    const userId = dbW.prepare("INSERT OR IGNORE INTO users (username, password_hash) VALUES ('schematest', 'hash')").run().lastInsertRowid;
    assert.throws(
      () => dbW.prepare(
        "INSERT INTO book_entries (user_id, list_type, book_key, title) VALUES (?, 'invalid', 'OLX', 'X')"
      ).run(userId),
      /CHECK constraint failed/,
    );
    dbW.close();
  });
});
