// public/utils.js — pure utility functions shared between browser and Node tests

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bookKey(b) {
  return b.key || (b.title + '::' + (b.author_name ? b.author_name[0] : ''));
}

function coverUrl(b) {
  if (b.cover_i)   return `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`;
  if (b.cover_isbn) return `https://covers.openlibrary.org/b/isbn/${b.cover_isbn}-M.jpg`;
  return null;
}

// Returns { ppd, daysLeft? } or null if not enough data.
function calcPace(currentPage, startedAt, totalPages) {
  if (!currentPage || !startedAt) return null;
  const msElapsed = Date.now() - new Date(startedAt).getTime();
  const daysElapsed = Math.max(0.5, msElapsed / 86400000);
  const ppd = +(currentPage / daysElapsed).toFixed(1);
  if (ppd < 0.1) return null;
  const out = { ppd };
  if (totalPages && totalPages > currentPage) {
    out.daysLeft = Math.ceil((totalPages - currentPage) / ppd);
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { escHtml, bookKey, coverUrl, calcPace };
