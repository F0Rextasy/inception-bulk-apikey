'use strict';

/**
 * Stability ("warm") screen: a line that answers now is not a line that
 * survives a 3-minute sign-up phase. Each candidate is probed 5 times, 60 s
 * apart, and only exits answering 4/5+ are kept.
 *
 *   node src/warm-screen.js --in out/platform-429.txt --url https://platform.inceptionlabs.ai/auth/register \
 *        --out out/warm-platform.txt --rounds 5 --gap 60000 --conc 8
 */

const fs = require('fs');
const path = require('path');
const { pool, request, mapLimit, ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const IN_FILE = arg('--in');
const URL_ = arg('--url', 'https://platform.inceptionlabs.ai/auth/register');
const OUT_FILE = path.resolve(arg('--out', path.join(ensureOut(), 'warm.txt')));
const ROUNDS = parseInt(arg('--rounds', '5'), 10);
const GAP = parseInt(arg('--gap', '60000'), 10);
const CONC = Math.min(parseInt(arg('--conc', '8'), 10), 8);
const TIMEOUT = parseInt(arg('--timeout', '20000'), 10);
const LIMIT = parseInt(arg('--limit', '200'), 10);
const MIN_OK = parseInt(arg('--min-ok', '4'), 10);

function candidates() {
  const out = [];
  const seen = new Set();
  const push = (p) => {
    if (!p || seen.has(proxyLib.label(p))) return;
    seen.add(proxyLib.label(p));
    out.push(p);
  };
  if (IN_FILE && fs.existsSync(IN_FILE)) {
    for (const l of fs.readFileSync(IN_FILE, 'utf8').split(/\r?\n/)) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      push(proxyLib.parseProxy(t));
    }
  } else {
    for (const p of pool()) push(p);
  }
  return out.slice(0, LIMIT);
}

(async () => {
  const cands = candidates();
  // A 429 means "edge answered, checkpoint stands" — exactly what a browser
  // phase needs; a 200 would mean the line is special, keep it too.
  const score = new Map(cands.map((p) => [proxyLib.label(p), 0]));
  console.log(`${cands.length} candidates, ${ROUNDS} rounds x ${GAP / 1000}s`);
  for (let round = 1; round <= ROUNDS; round++) {
    await mapLimit(cands, CONC, async (proxy) => {
      const label = proxyLib.label(proxy);
      try {
        const r = await request(proxy, URL_, { timeoutMs: TIMEOUT });
        if (r.status >= 200 && r.status < 500) score.set(label, score.get(label) + 1);
      } catch {}
    });
    const alive = [...score.values()].filter((v) => v >= round - (ROUNDS - MIN_OK)).length;
    console.log(`round ${round}/${ROUNDS} done; exits still at >=${MIN_OK}: ${alive}`);
    if (round < ROUNDS) await sleep(GAP);
  }
  const good = [...score.entries()].filter(([, v]) => v >= MIN_OK);
  good.sort((a, b) => b[1] - a[1]);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, good.map(([l, v]) => `${l}\t${v}/${ROUNDS}`).join('\n') + '\n');
  fs.writeFileSync(
    OUT_FILE.replace(/\.txt$/, '.json'),
    JSON.stringify(
      [...score.entries()].map(([l, v]) => ({ proxy: l, hits: v })).sort((a, b) => b.hits - a.hits),
      null,
      1
    )
  );
  console.log(`warm pool: ${good.length}/${cands.length} -> ${OUT_FILE}`);
  console.log(good.slice(0, 40).map(([l, v]) => `${l} ${v}/${ROUNDS}`).join('\n'));
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
