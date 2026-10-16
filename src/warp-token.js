'use strict';

/**
 * WARP Turnstile probe: can the shared WARP exit produce a cf-turnstile token?
 *
 *   node src/warp-token.js [--exit socks5://127.0.0.1:40000] [--port 9942] [--watch 240]
 *
 * Differences from token-screen.js: (1) localhost proxy addresses are allowed
 * (it is the WARP SOCKS endpoint, not a pool exit), (2) it interacts like a
 * user (mouse moves, scroll, typing) because the widget is "managed" and gives
 * far more tokens when the page sees activity, (3) at t=45 s it calls
 * turnstile.reset() once and re-waits, (4) it logs the Cloudflare widget state
 * and any challenge-platform responses so a failure is explainable.
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const EXIT = arg('--exit', 'socks5://127.0.0.1:40000');
const PORT = parseInt(arg('--port', '9942'), 10);
const WATCH = parseInt(arg('--watch', '240'), 10) * 1000;
const OUT = ensureOut();
const LOG = path.join(OUT, 'warp-token.log');

const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG, line + '\n');
  } catch {}
};

const STATE_EXPR = `(() => {
  const widget = document.querySelector('[id^=cf-chl-widget]');
  const input = document.querySelector('[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]');
  const frames = [...document.querySelectorAll('iframe')].map(f => ({ src: (f.src||'').slice(0, 90), w: Math.round(f.getBoundingClientRect().width), h: Math.round(f.getBoundingClientRect().height) })).filter(f => /cloudflare/.test(f.src));
  let ts = null;
  try { ts = window.turnstile ? { has: true, id: widget && widget.id, resp: (window.turnstile.getResponse ? String(window.turnstile.getResponse() || '').length : -1) } : { has: false }; } catch (e) { ts = { err: String(e).slice(0, 60) }; }
  return {
    tokenLen: input ? (input.value || '').length : -1,
    widgetIds: [...document.querySelectorAll('[id^=cf-chl-widget]')].map(e => e.id + ':' + (e.tagName)),
    frames,
    ts,
    text: ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').slice(-160),
  };
})()`;

(async () => {
  const proxy = proxyLib.parseProxy(EXIT);
  if (!proxy) throw new Error(`bad --exit ${EXIT}`);
  log(`warp-token start exit=${proxyLib.label(proxy)} port=${PORT} watch=${WATCH / 1000}s`);
  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);

  const { ctx, targetId, sessionId, page, net, detachProxyAuth } = await B.openContext(cdp, proxy);
  const cf = [];
  cdp.on('Network.responseReceived', (p) => {
    if (/cloudflare\.com/.test(p.response.url) && !/api\.js|static/.test(p.response.url)) {
      cf.push({ u: p.response.url.replace(/^https:\/\/challenges\.cloudflare\.com/, '').slice(0, 110), s: p.response.status });
    }
  }, sessionId);
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const t = (p.args || []).map((a) => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ');
    if (/turnstile|challenge|cloudflare|error/i.test(t)) log('console:', t.slice(0, 240));
  }, sessionId);

  try {
    await page.goto('https://platform.inceptionlabs.ai/auth/register');
    const ready = await page.waitFor(`!!document.querySelector('#email')`, { timeoutMs: 90000, pollMs: 900 });
    log(`form ready=${!!ready}`);
    if (!ready) {
      log(`body: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 200)}`);
      throw new Error('form never appeared');
    }

    const t0 = Date.now();
    let last = '';
    let didActivity = false;
    let didReset = false;
    let didType = false;
    let token = -1;
    while (Date.now() - t0 < WATCH) {
      const st = await page.eval(STATE_EXPR).catch((e) => ({ err: String(e.message).slice(0, 90) }));
      token = st.tokenLen !== undefined ? st.tokenLen : -1;
      const w = JSON.stringify(st);
      if (w !== last) {
        log(JSON.stringify(st).slice(0, 460));
        last = w;
      }
      if (token > 20) break;
      const el = Date.now() - t0;

      // Real-user signal: move, scroll, and interact with the form early on.
      if (!didType && el > 6000) {
        didType = true;
        await page.type('#name', 'Alex Morgan').catch(() => {});
        await page.type('#email', 'probe@example.com').catch(() => {});
        log('typed into name/email');
      }
      if (!didActivity && el > 10000) {
        didActivity = true;
        for (const [x, y] of [[400, 300], [700, 420], [520, 610], [760, 380]]) {
          await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
          await sleep(140 + Math.random() * 220);
        }
        await page.eval(`window.scrollBy(0, 140); true`);
        await sleep(400);
        await page.eval(`window.scrollBy(0, -80); true`);
        log('activity burst done');
      }

      // One widget reset if the solve loop looks stuck.
      if (!didReset && el > 45000) {
        didReset = true;
        const r = await page.eval(`(() => { try { if (!window.turnstile) return 'no-turnstile'; const id = (document.querySelector('[id^=cf-chl-widget]') || {}).id; window.turnstile.reset(id); return 'reset:' + id; } catch (e) { return 'err:' + String(e).slice(0, 60); } })()`).catch((e) => 'throw:' + e.message);
        log(`turnstile reset -> ${r}`);
      }

      // If an interactive widget shows, click its checkbox once at 90s.
      if (el > 90000 && !global.__poked) {
        const frames = st.frames || [];
        const f = frames.find((x) => x.w > 20 && x.h > 20);
        if (f) {
          global.__poked = true;
          const box = await page.eval(`(() => { const f = [...document.querySelectorAll('iframe')].find(f => /challenges\\.cloudflare\\.com/.test(f.src||'') && f.getBoundingClientRect().width > 20); if(!f) return null; const r = f.getBoundingClientRect(); return { x: r.left + 28, y: r.top + r.height/2 }; })()`);
          if (box) {
            await page.mouseClick(box.x, box.y);
            log(`poked visible widget at ${box.x},${box.y}`);
          }
        }
      }
      await sleep(2500);
    }

    log(`final tokenLen=${token} after ${Math.round((Date.now() - t0) / 1000)}s`);
    if (token > 20) {
      const tok = await page.eval(`(() => { const i = document.querySelector('[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]'); return i ? i.value : ''; })()`);
      fs.writeFileSync(path.join(OUT, 'warp-token-ok.txt'), tok + '\n');
      log(`WARP TOKEN OK len=${(tok || '').length}`);
    }
    log('cf responses: ' + JSON.stringify(cf.slice(-18)));
    await page.screenshot(path.join(OUT, 'warp-token.png'));
  } finally {
    await B.closeContext(cdp, ctx, targetId, detachProxyAuth).catch(() => {});
    process.exit(0);
  }
})().catch((e) => {
  log('FATAL', (e && e.stack) || e);
  process.exit(1);
});
