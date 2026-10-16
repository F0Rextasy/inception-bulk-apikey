'use strict';

/**
 * Exit screen for the Inception hosts: probes every pool line against one URL
 * and streams results to disk as they land, so a kill at any moment keeps what
 * was already measured and a re-run resumes instead of re-probing.
 *
 *   node src/screen.js --url https://platform.inceptionlabs.ai/login \
 *        --out out/platform-live.txt [--concurrency 8] [--timeout 30000] [--limit 600]
 */

const fs = require('fs');
const path = require('path');
const { pool, request, mapLimit, ensureOut, proxyLib } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const URL_ = arg('--url', 'https://platform.inceptionlabs.ai/login');
const OUT_FILE = path.resolve(arg('--out', path.join(ensureOut(), 'platform-live.txt')));
const LOG_FILE = OUT_FILE.replace(/\.txt$/, '.jsonl');
const CONC = Math.min(parseInt(arg('--concurrency', '8'), 10), 8);
const TIMEOUT = parseInt(arg('--timeout', '30000'), 10);
const LIMIT = parseInt(arg('--limit', '1000'), 10);
const OK_MIN = parseInt(arg('--ok-min', '200'), 10);
const OK_MAX = parseInt(arg('--ok-max', '399'), 10);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

function doneSet() {
  const s = new Set();
  if (!fs.existsSync(LOG_FILE)) return s;
  for (const line of fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      s.add(JSON.parse(t).proxy);
    } catch {}
  }
  return s;
}

const done = doneSet();
const all = pool();
const todo = all.filter((p) => !done.has(proxyLib.label(p))).slice(0, LIMIT);

console.log(`pool=${all.length} already=${done.size} probing=${todo.length} -> ${OUT_FILE}`);

const append = (file, text) => fs.appendFileSync(file, text);

let ok = 0;
let fail = 0;

(async () => {
  const t0 = Date.now();
  await mapLimit(todo, CONC, async (proxy, i) => {
    const label = proxyLib.label(proxy);
    try {
      const res = await request(proxy, URL_, { timeoutMs: TIMEOUT, connectTimeoutMs: 8000, headers: { accept: 'text/html' } });
      const hit = res.status >= OK_MIN && res.status <= OK_MAX;
      if (hit) {
        ok++;
        append(OUT_FILE, `${label}\n`);
      } else fail++;
      append(LOG_FILE, JSON.stringify({ proxy: label, status: res.status, ms: res.ms, hit }) + '\n');
      if ((ok + fail) % 25 === 0 || hit)
        console.log(
          `[${ok + fail}/${todo.length}] ${label} -> ${res.status} ${res.ms}ms  ok=${ok} fail=${fail} (${Math.round(
            (Date.now() - t0) / 1000
          )}s)`
        );
    } catch (e) {
      fail++;
      append(LOG_FILE, JSON.stringify({ proxy: label, error: String(e.message || e).slice(0, 160), ms: Date.now() - t0 }) + '\n');
    }
  });
  console.log(`DONE ok=${ok} fail=${fail} of ${todo.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
