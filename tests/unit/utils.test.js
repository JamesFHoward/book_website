'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { escHtml, bookKey, coverUrl, calcPace } = require('../../public/utils.js');

describe('escHtml', () => {
  test('escapes < > & "', () => {
    assert.equal(escHtml('<script>'), '&lt;script&gt;');
    assert.equal(escHtml('a & b'), 'a &amp; b');
    assert.equal(escHtml('"hello"'), '&quot;hello&quot;');
  });

  test('handles null / undefined without throwing', () => {
    assert.equal(escHtml(null), '');
    assert.equal(escHtml(undefined), '');
  });

  test('passes plain text through unchanged', () => {
    assert.equal(escHtml('Hello world'), 'Hello world');
  });

  test('handles XSS payload', () => {
    const payload = '<img src=x onerror=alert(1)>';
    assert.ok(!escHtml(payload).includes('<img'));
    assert.ok(escHtml(payload).includes('&lt;img'));
  });
});

describe('bookKey', () => {
  test('uses .key when present', () => {
    assert.equal(bookKey({ key: '/works/OL1W', title: 'T', author_name: ['A'] }), '/works/OL1W');
  });

  test('falls back to title::author when no key', () => {
    assert.equal(bookKey({ title: 'My Book', author_name: ['John Doe'] }), 'My Book::John Doe');
  });

  test('handles missing author_name', () => {
    assert.equal(bookKey({ title: 'Solo' }), 'Solo::');
  });
});

describe('coverUrl', () => {
  test('returns cover_i URL when present', () => {
    const url = coverUrl({ cover_i: 12345 });
    assert.ok(url.includes('12345'));
    assert.ok(url.startsWith('https://covers.openlibrary.org'));
  });

  test('falls back to cover_isbn URL', () => {
    const url = coverUrl({ cover_isbn: '9781234567890' });
    assert.ok(url.includes('9781234567890'));
  });

  test('returns null when no cover data', () => {
    assert.equal(coverUrl({}), null);
    assert.equal(coverUrl({ cover_i: null }), null);
  });
});

describe('calcPace', () => {
  test('returns null when no page data', () => {
    assert.equal(calcPace(0, new Date().toISOString(), 300), null);
    assert.equal(calcPace(null, new Date().toISOString(), 300), null);
    assert.equal(calcPace(100, null, 300), null);
  });

  test('returns ppd for a book started exactly 10 days ago', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = calcPace(200, tenDaysAgo, 400);
    assert.ok(result !== null);
    // 200 pages / 10 days = 20 ppd
    assert.ok(Math.abs(result.ppd - 20) < 1, `Expected ~20 ppd, got ${result.ppd}`);
    assert.ok('daysLeft' in result, 'should include daysLeft when totalPages > currentPage');
  });

  test('omits daysLeft when currentPage >= totalPages', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = calcPace(350, threeDaysAgo, 300);
    assert.ok(result !== null);
    assert.ok(!('daysLeft' in result));
  });

  test('returns null when ppd is below threshold', () => {
    const longAgo = new Date(Date.now() - 1000 * 24 * 60 * 60 * 1000).toISOString();
    const result = calcPace(1, longAgo, 500); // essentially 0 ppd
    assert.equal(result, null);
  });

  test('uses 0.5 day floor (same-day start does not divide by zero)', () => {
    const justNow = new Date().toISOString();
    const result = calcPace(50, justNow, 300);
    assert.ok(result !== null);
    assert.ok(result.ppd > 0);
  });
});
