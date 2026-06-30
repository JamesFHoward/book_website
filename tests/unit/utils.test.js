'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { escHtml, bookKey, coverUrl, calcPace, isQualitySearchResult } = require('../../public/utils.js');

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

describe('isQualitySearchResult', () => {
  const good = { cover_i: 123, first_publish_year: 2001, author_name: ['J.K. Rowling'], title: 'Harry Potter' };

  test('good book passes all conditions', () => {
    assert.equal(isQualitySearchResult(good), true);
  });

  test('rejects when cover_i is null', () => {
    assert.equal(isQualitySearchResult({ ...good, cover_i: null }), false);
  });

  test('rejects when cover_i is absent', () => {
    const { cover_i: _, ...rest } = good;
    assert.equal(isQualitySearchResult(rest), false);
  });

  test('rejects when first_publish_year is absent', () => {
    const { first_publish_year: _, ...rest } = good;
    assert.equal(isQualitySearchResult(rest), false);
  });

  test('rejects when author_name is absent', () => {
    const { author_name: _, ...rest } = good;
    assert.equal(isQualitySearchResult(rest), false);
  });

  test('rejects when author_name is an empty array', () => {
    assert.equal(isQualitySearchResult({ ...good, author_name: [] }), false);
  });

  test('rejects when title is a single character', () => {
    assert.equal(isQualitySearchResult({ ...good, title: 'a' }), false);
  });

  test('rejects when title equals author (garbage entry)', () => {
    assert.equal(isQualitySearchResult({ ...good, title: 'asdasd', author_name: ['asdasd'] }), false);
  });

  test('author with exactly 3 unique chars passes (boundary — condition is strictly < 3)', () => {
    // 'asd' → authorCompact = 'asd' → unique chars {a,s,d} = 3 → 3 < 3 is false → passes
    assert.equal(isQualitySearchResult({ ...good, author_name: ['asd'] }), true);
  });

  test('rejects author with fewer than 3 unique non-space chars (single char repeated)', () => {
    // 'aa aa' → authorCompact = 'aaaa' → unique chars {a} = 1 → 1 < 3 → rejected
    assert.equal(isQualitySearchResult({ ...good, author_name: ['aa aa'] }), false);
  });

  test('rejects title where all words are identical (repeated-word garbage)', () => {
    assert.equal(isQualitySearchResult({ ...good, title: 'asd asd' }), false);
  });

  test('two-word distinct title passes', () => {
    assert.equal(isQualitySearchResult({ cover_i: 123, first_publish_year: 1937, author_name: ['J.R.R. Tolkien'], title: 'The Hobbit' }), true);
  });

  test('two-character title passes (boundary — condition is strictly < 2)', () => {
    assert.equal(isQualitySearchResult({ cover_i: 99, first_publish_year: 1986, author_name: ['Stephen King'], title: 'It' }), true);
  });
});
