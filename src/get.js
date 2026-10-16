'use strict';

/**
 * Fetch one URL through the first exits that answer, saving body + headers.
 * Used for recon: it walks the live list (newest measurements first) and does
 * not spend a browser session until a raw HTTP fetch has told us what the page
 * even is.
 *
 *   node src/get.js --url https://platform.inceptionlabs.ai/signup --save-out out/signup.html
 */

const fs = require('fs');
const path = require('path');
const { pool, request, ensureOut, proxyLib } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const URL_ = arg('--url');
const SAVE = arg('--save-out');
const ACCEPT = arg('--accept', 'text/html,application/xhtml+xml');
const TRIES = parseInt(arg('--tries', '12'), 10);
const TIMEOUT = parseInt(arg('--timeout', '30000'), 10);
const LIVE = path.resolve(arg('--live', path.join(ensureOut(), 'platform-live.txt')));
const SHOW = parseInt(arg('--show', '2500'), 10);

function candidates() {
  const out = [];
  if (fs.existsSync(LIVE)) {
    const lines = fs.readFileSync(LIVE, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const l of lines.slice().reverse()) out.push(proxyLib.parseProxy(l));
  }
  for (const p of pool()) out.push(p);
  return out.filter(Boolean);
}

(async () => {
  const cands = candidates();
  let tried = 0;
  for (const p of cands) {
    if (tried >= TRIES) break;
    tried++;
    try {
      const r = await request(p, URL_, { timeoutMs: TIMEOUT, headers: { accept: ACCEPT } });
      console.log(`# ${proxyLib.label(p)} -> ${r.status} ${r.ms}ms ${r.text.length}b`);
      if (r.status >= 500) continue;
      if (SAVE) {
        fs.mkdirSync(path.dirname(path.resolve(SAVE)), { recursive: true });
        fs.writeFileSync(path.resolve(SAVE), r.text);
        console.log(`saved ${path.resolve(SAVE)}`);
      }
      console.log(`exit=${proxyLib.label(p)}`);
      console.log(JSON.stringify(r.headers, null, 1).slice(0, 1200));
      console.log(r.text.slice(0, SHOW));
      return;
    } catch (e) {
      console.log(`# ${proxyLib.label(p)} -> ERR ${String(e.message || e).slice(0, 110)}`);
    }
  }
  console.log(`gave up after ${tried} exits`);
  process.exit(2);
})();
