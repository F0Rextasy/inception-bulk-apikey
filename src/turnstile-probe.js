'use strict';

/**
 * What blocks the Turnstile token?
 *
 *   node src/turnstile-probe.js [--bypass] [--exit <line>] [--port 9940]
 *
 * Loads /auth/register on a probed exit, then watches for 75 s: the widget's
 * hidden input, the trust chain of challenges.cloudflare.com requests, and any
 * Cloudflare error codes on screen. `--bypass` lets challenges.cloudflare.com
 * leave directly (the provider host still goes through the exit), which is the
 * one lever that turned "no token ever" into "token in 6 s" for a sibling
 * provider.
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ExitSupply } = require('./exits');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const BYPASS = args.includes('--bypass');
const EXIT = arg('--exit');
const PORT = parseInt(arg('--port', '9940'), 10);
const WATCH = parseInt(arg('--watch', '75000'), 10);
const OUT = ensureOut();
const TAG = BYPASS ? 'ts-bypass' : 'ts-exit';
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

(async () => {
  const supply = new ExitSupply();
  let proxy = null;
  if (EXIT) proxy = proxyLib.parseProxy(EXIT);
  else {
    const [hit] = await supply.acquire(1, { maxProbe: 30 });
    if (!hit) throw new Error('no live exit');
    proxy = hit.proxy;
    log(`exit ${proxyLib.label(proxy)} probe=${hit.status} ${hit.ms}ms`);
  }

  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);
  const ctx = await cdp.createBrowserContext(
    BYPASS ? { proxyServer: proxyLib.browserUrl(proxy), proxyBypassList: 'challenges.cloudflare.com' } : { proxyServer: proxyLib.browserUrl(proxy) }
  );
  const { targetId, sessionId } = await cdp.newPage({ browserContextId: ctx, url: 'about:blank' });
  for (const d of ['Page', 'Runtime', 'Network']) await cdp.send(`${d}.enable`, {}, sessionId);
  const cfReqs = [];
  cdp.on('Network.requestWillBeSent', (p) => {
    if (/cloudflare\.com/.test(p.request.url)) cfReqs.push({ phase: 'req', url: p.request.url.slice(0, 110), method: p.request.method });
  }, sessionId);
  cdp.on('Network.responseReceived', (p) => {
    if (/cloudflare\.com/.test(p.response.url)) cfReqs.push({ phase: 'res', url: p.response.url.slice(0, 110), status: p.response.status });
  }, sessionId);
  cdp.on('Network.loadingFailed', (p) => {
    cfReqs.push({ phase: 'fail', id: p.requestId, err: p.errorText, canceled: p.canceled });
  }, sessionId);
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const t = (p.args || []).map((a) => a.value || a.description || a.type).join(' ');
    if (/turnstile|challenge|error|fail/i.test(t)) log('console:', t.slice(0, 200));
  }, sessionId);

  const page = new B.Page(cdp, sessionId, { reqs: [], responses: [], console: [] });
  await page.goto('https://platform.inceptionlabs.ai/auth/register');
  const ready = await page.waitFor(`!!document.querySelector('#email')`, { timeoutMs: 75000, pollMs: 900 });
  log(`form ready=${!!ready}`);
  if (ready) {
    const t0 = Date.now();
    let lastW = '';
    while (Date.now() - t0 < WATCH) {
      const state = await page
        .eval(
          `(() => { const el = document.querySelector('[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]'); const f = [...document.querySelectorAll('iframe')].map(f => (f.src||'').slice(0,70)); return { tokenLen: el ? (el.value||'').length : -1, frames: f, text: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200) }; })()`
        )
        .catch((e) => ({ err: String(e.message).slice(0, 80) }));
      const w = JSON.stringify(state);
      if (w !== lastW) {
        log(JSON.stringify(state).slice(0, 400));
        lastW = w;
      }
      if (state.tokenLen > 20) break;
      await sleep(3000);
    }
  }
  fs.writeFileSync(path.join(OUT, `${TAG}-cf.json`), JSON.stringify(cfReqs, null, 1));
  log(`cf requests: ${cfReqs.length}`);
  for (const r of cfReqs.slice(0, 25)) log('  ' + JSON.stringify(r));
  await page.screenshot(path.join(OUT, `${TAG}.png`));
  await B.closeContext(cdp, ctx, targetId, async () => {});
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
