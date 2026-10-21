'use strict';

/**
 * Shared plumbing for the Inception Labs miner: pool loading, a status-aware
 * HTTP client that exits through a proxy, and a concurrent screen that keeps
 * results on disk as it goes (a run gets restarted mid-run often enough
 * that an in-memory-only screen costs hours of re-probing).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const proxyLib = require('./proxy');

// Everything user-facing (proxies.txt, keys.txt, accounts.json, out/) lives at
// the checkout root, one level above src/.
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');

/**
 * Private-proxy class support: when a purchased list lands (RESIDENTIAL_PROXIES
 * env), it is preferred for reputation-gated phases; the free union stays for
 * cheap HTTP work. Absent file = exactly the old behavior.
 */
function residentialFiles() {
  const fs = require('fs');
  const cands = [process.env.RESIDENTIAL_PROXIES, path.join(OUT, 'residential-proxies.txt')];
  return cands.filter((f) => f && fs.existsSync(f));
}

function poolFiles({ includeRouter = true } = {}) {
  const files = [path.join(ROOT, 'proxies.txt'), ...residentialFiles(), path.join(OUT, 'union-live.txt')];
  if (includeRouter) files.push(path.join(OUT, 'router.tsv'));
  return files;
}

function pool({ includeRouter = true } = {}) {
  const seen = new Set();
  const out = [];
  for (const f of poolFiles({ includeRouter })) {
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      // router.tsv is `label<TAB>proxy<TAB>meta`; take the proxy column.
      if (line.includes('\t') || line.includes(' ')) {
        const parts = line.split(/[\t ]+/).filter(Boolean);
        const cand = parts.find((p) => /^(https?|socks[45]):\/\//.test(p));
        if (cand) line = cand;
        else continue;
      }
      const p = proxyLib.parseProxy(line);
      if (!p || proxyLib.isLocalHost(p.host)) continue;
      const key = proxyLib.label(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** Status-aware GET/POST through a proxy. Returns { status, headers, text, ms }. */
function request(proxy, url, { method = 'GET', headers = {}, body, timeoutMs = 25000, connectTimeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload =
      body === undefined || body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const finalHeaders = {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      accept: '*/*',
      ...headers,
    };
    if (payload && !Object.keys(finalHeaders).some((h) => h.toLowerCase() === 'content-type')) {
      finalHeaders['Content-Type'] = 'application/json';
    }
    if (payload && !Object.keys(finalHeaders).some((h) => h.toLowerCase() === 'content-length')) {
      finalHeaders['Content-Length'] = payload.length;
    }
    const started = Date.now();
    let agent;
    if (proxy) {
      const p = { ...proxy, connectTimeoutMs, timeoutMs };
      agent = proxyLib.agentFor(p, url);
    }
    const req = lib.request(
      {
        method,
        host: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        agent,
        headers: finalHeaders,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, text, ms: Date.now() - started })
        );
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs `worker` over items with a hard concurrency cap. */
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(
      (async () => {
        for (;;) {
          const idx = next++;
          if (idx >= items.length) return;
          out[idx] = await worker(items[idx], idx);
        }
      })()
    );
  }
  await Promise.all(runners);
  return out;
}

function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
  return OUT;
}

module.exports = { ROOT, OUT, pool, request, sleep, mapLimit, ensureOut, proxyLib };
