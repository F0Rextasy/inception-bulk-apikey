'use strict';

/**
 * Token-capable exit feeder.
 *
 * The gate that actually matters for Inception is not reachability — it is
 * whether Cloudflare's Turnstile widget solves for that exit's IP. Reachability
 * probes (429 on the console, 302 on the widget script) are necessary but NOT
 * sufficient: three exits that answered both still produced an empty
 * `cf-chl-widget-*_response` and `POST /api/auth/register` answers
 * `400 {"message":"Required"}` without a token (measured).
 *
 * So this feeder loads the real register page in a real Chrome per candidate
 * exit and waits for the hidden Turnstile input to fill. Winners are appended to
 * out/token-capable.txt, which `exits.js` prefers.
 *
 *   node src/token-screen.js [--candidates out/relay-candidates.txt] [--port 9945] [--chunk 12] [--watch 35]
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const OUT = ensureOut();
const CAND_FILE = path.resolve(arg('--candidates', path.join(OUT, 'relay-candidates.txt')));
const HIT_FILE = path.join(OUT, 'token-capable.txt');
const SEEN_FILE = path.join(OUT, 'token-screen-seen.json');
const PORT = parseInt(arg('--port', '9945'), 10);
const CHUNK = parseInt(arg('--chunk', '12'), 10);
const WATCH = parseInt(arg('--watch', '35'), 10);
const CONC = Math.min(parseInt(arg('--conc', '2'), 10), 3);

const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(OUT, 'token-screen.log'), line + '\n');
  } catch {}
};

const seen = new Set(fs.existsSync(SEEN_FILE) ? JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')) : []);
const saveSeen = () => fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen]));

function candidates() {
  const out = [];
  for (const f of [path.join(OUT, 'platform-429.txt'), path.join(OUT, 'platform-reach.txt'), CAND_FILE]) {
    if (!fs.existsSync(f)) continue;
    for (let line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      line = line.trim().split('\t')[0];
      if (!/^(https?|socks[45]):\/\//.test(line)) continue;
      const p = proxyLib.parseProxy(line);
      if (!p || proxyLib.isLocalHost(p.host)) continue;
      const label = proxyLib.label(p);
      if (seen.has(label)) continue;
      if (out.some((x) => proxyLib.label(x) === label)) continue;
      out.push(p);
    }
  }
  return out;
}

/** Loads the register page through `proxy` and reports the Turnstile verdict. */
async function testExit(cdp, proxy) {
  let ctxInfo = null;
  try {
    ctxInfo = await B.openContext(cdp, proxy);
    const { page } = ctxInfo;
    await page.goto('https://platform.inceptionlabs.ai/auth/register');
    const t0 = Date.now();
    let token = 0;
    let state = 'no-page';
    while (Date.now() - t0 < WATCH * 1000) {
      // CORRECTED 2026-10-14: the app renders Turnstile with a callback and the
      // hidden input is never filled; the token lives in window.turnstile
      // .getResponse(). The old input-only check reported "no token ever" for
      // ~170 exits even where the widget had solved (proxy: 752-char token, input
      // still empty). Verdict must be max(input, getResponse).
      const info = await page
        .eval(
          `(() => { const el = document.querySelector('[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]'); const inLen = el && el.value ? el.value.length : -1; let r = -1; try { if (window.turnstile && window.turnstile.getResponse) r = String(window.turnstile.getResponse() || '').length; } catch (e) {} const body = (document.body&&document.body.innerText)||''; return { token: Math.max(inLen, r), form: !!document.querySelector('#email'), challenge: /verifying your browser|security checkpoint/i.test(body), err: /can.t be reached|ERR_|No internet/i.test(body) }; })()`
        )
        .catch(() => null);
      if (!info) break;
      token = info.token;
      state = info.err ? 'neterr' : info.challenge ? 'challenge' : info.form ? 'form' : 'other';
      if (token > 20 || state === 'neterr') break;
      await sleep(2000);
    }
    return { proxy, token, state, ms: Date.now() - t0 };
  } catch (e) {
    return { proxy, token: -1, state: 'throw', note: String(e.message || e).slice(0, 80) };
  } finally {
    if (ctxInfo) await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);
  }
}

(async () => {
  log(`token screen start candidates=${CAND_FILE} chunk=${CHUNK} watch=${WATCH}s`);
  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);
  for (let round = 1; ; round++) {
    const cands = candidates().slice(0, CHUNK);
    if (!cands.length) {
      log('no new candidates; sleeping 120s');
      await sleep(120000);
      continue;
    }
    log(`round ${round}: testing ${cands.length} exits`);
    let i = 0;
    const results = [];
    await Promise.all(
      new Array(CONC).fill(0).map(async () => {
        for (;;) {
          const p = cands[i++];
          if (!p) return;
          const r = await testExit(cdp, p);
          results.push(r);
          seen.add(proxyLib.label(p));
          saveSeen();
          if (r.token > 20) {
            fs.appendFileSync(HIT_FILE, `${proxyLib.label(p)}\n`);
            log(`TOKEN ok ${proxyLib.label(p)} len=${r.token} in ${r.ms}ms`);
          } else {
            log(`no token ${proxyLib.label(p)} state=${r.state} ${r.ms}ms ${r.note || ''}`);
          }
        }
      })
    );
    log(`round ${round} done: ${results.filter((r) => r.token > 20).length}/${results.length} produced a token`);
  }
})().catch((e) => {
  log('FATAL', (e && e.stack) || e);
  process.exit(1);
});
