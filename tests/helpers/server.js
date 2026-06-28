'use strict';
// Spawns the app server in a subprocess with an isolated test database.
const { spawn }  = require('child_process');
const path       = require('path');
const os         = require('os');

async function startServer({ port = 3001, dbPath } = {}) {
  const resolvedDb = dbPath || path.join(os.tmpdir(), `bookshelf-test-${Date.now()}.db`);
  const env = {
    ...process.env,
    PORT:           String(port),
    SESSION_SECRET: 'test-session-secret-not-for-production',
    NODE_ENV:       'test',
    DB_PATH:        resolvedDb,
  };

  const proc = spawn('node', [path.join(__dirname, '../../server.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', () => {});
  proc.stderr.on('data', d => {
    const msg = d.toString();
    if (!msg.includes('running at')) process.stderr.write('[server] ' + msg);
  });

  await waitForReady(`http://localhost:${port}`, 10000);

  const stop = () => new Promise(resolve => {
    proc.kill('SIGTERM');
    proc.on('exit', resolve);
  });

  return { stop, dbPath: resolvedDb, baseUrl: `http://localhost:${port}` };
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${url}/api/me`);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 120));
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

// Cookie-aware fetch wrapper. Returns { status, data, cookie }.
function makeClient(baseUrl) {
  let cookie = '';
  async function req(method, urlPath, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (cookie) opts.headers['Cookie'] = cookie;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(baseUrl + urlPath, opts);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data, headers: res.headers };
  }
  const get  = (p)       => req('GET',    p, undefined);
  const post = (p, body) => req('POST',   p, body);
  const del  = (p)       => req('DELETE', p, undefined);
  const patch= (p, body) => req('PATCH',  p, body);
  const reset = () => { cookie = ''; };
  return { get, post, del, patch, reset, getCookie: () => cookie };
}

module.exports = { startServer, makeClient };
