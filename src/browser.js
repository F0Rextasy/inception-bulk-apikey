'use strict';

/**
 * Chrome/CDP layer for the Inception miner.
 *
 * The platform sits behind Vercel's Security Checkpoint (the raw HTTP fetch
 * answers 429 + `x-vercel-mitigated: challenge`), so the sign-up flow has to
 * originate from a real browser the challenge can clear. One browser context
 * per account, each with its own proxy, so the exit address is never shared.
 *
 * The user agent is deliberately NOT overridden: the real Chrome build is what
 * the checkpoint fingerprints, and a spoofed UA that disagrees with the actual
 * binary is one of the few genuinely inconsistent signals left.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { CDP } = require('./cdp');
const proxyLib = require('./proxy');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome(port, profileDir, { headless = false } = {}) {
  fs.mkdirSync(profileDir, { recursive: true });
  const flags = [
    headless ? '--headless=new' : '--start-maximized',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-domain-reliability',
    '--disable-breakpad',
    '--disable-default-apps',
    '--no-service-autorun',
    '--no-first-run',
    '--no-default-browser-check',
    '--metrics-recording-only',
    '--password-store=basic',
    '--lang=en-US',
    '--window-size=1366,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  const child = spawn(CHROME, flags, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}

async function waitForPort(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(600);
  }
  throw new Error(`Chrome debug port ${port} never came up`);
}

async function connect(port, opts = {}) {
  const wsUrl = await waitForPort(port);
  const cdp = new CDP(wsUrl, opts);
  await cdp.connect();
  return cdp;
}

class Page {
  constructor(cdp, sessionId, net) {
    this.cdp = cdp;
    this.s = sessionId;
    this.net = net;
  }
  async eval(expr) {
    const r = await this.cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, this.s);
    if (r.exceptionDetails) {
      throw new Error(
        `eval: ${r.exceptionDetails.text} ${(r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''}`.slice(0, 240)
      );
    }
    return r.result.value;
  }
  async goto(url, { waitUntil = 'none' } = {}) {
    await this.cdp.send('Page.navigate', { url }, this.s);
    if (waitUntil === 'load') await this.waitLoad();
  }
  async waitLoad(timeoutMs = 45000) {
    try {
      await this.cdp.waitFor('Page.loadEventFired', { timeoutMs, sessionId: this.s });
      return true;
    } catch {
      return false;
    }
  }
  async body() {
    try {
      return await this.eval('document.body ? document.body.innerText : ""');
    } catch {
      return '';
    }
  }
  async html() {
    try {
      return await this.eval('document.documentElement.outerHTML');
    } catch {
      return '';
    }
  }
  async url() {
    try {
      return await this.eval('location.href');
    } catch {
      return '';
    }
  }
  async title() {
    try {
      return await this.eval('document.title');
    } catch {
      return '';
    }
  }
  async waitFor(expr, { timeoutMs = 30000, pollMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const v = await this.eval(expr);
        if (v) return v;
      } catch {}
      await sleep(pollMs);
    }
    return null;
  }
  async rect(finder) {
    return this.eval(
      `(() => { try { const el = ${finder}; if (!el) return null; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, left: r.left }; } catch (e) { return null; } })()`
    );
  }
  async mouseClick(x, y) {
    const from = this._lastMouse || { x: x - 60 - Math.random() * 140, y: y - 40 - Math.random() * 90 };
    const steps = 2 + Math.floor(Math.random() * 3);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mx = from.x + (x - from.x) * t + (Math.random() * 6 - 3);
      const my = from.y + (y - from.y) * t + (Math.random() * 6 - 3);
      await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my }, this.s);
      await sleep(25 + Math.random() * 45);
    }
    this._lastMouse = { x, y };
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, this.s);
    await sleep(35 + Math.random() * 80);
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, this.s);
    await sleep(45 + Math.random() * 70);
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, this.s);
  }
  async click(finder, { scroll = true } = {}) {
    if (scroll) {
      try {
        await this.eval(`(() => { const el = ${finder}; if (el) el.scrollIntoView({block:'center'}); return !!el; })()`);
        await sleep(110);
      } catch {}
    }
    const r = await this.rect(finder);
    if (!r) return false;
    await this.mouseClick(r.x, r.y);
    return true;
  }
  /** Types with real key events; falls back to the native setter for React inputs. */
  async type(selector, text, { clear = true, jitter = 70 } = {}) {
    if (!(await this.click(`document.querySelector(${JSON.stringify(selector)})`))) return false;
    await sleep(80);
    if (clear) {
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }, this.s);
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }, this.s);
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, this.s);
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, this.s);
      await sleep(50);
    }
    for (const ch of text) {
      const code = ch === ' ' ? 'Space' : /[a-zA-Z]/.test(ch) ? `Key${ch.toUpperCase()}` : /[0-9]/.test(ch) ? `Digit${ch}` : '';
      const vk = ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0);
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, windowsVirtualKeyCode: vk, text: ch }, this.s);
      await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk }, this.s);
      await sleep(jitter + Math.random() * jitter);
    }
    const got = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.value : null; })()`);
    if (got !== text) {
      await this.eval(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const d = Object.getOwnPropertyDescriptor(proto, 'value'); el.focus(); d.set.call(el, ${JSON.stringify(
          text
        )}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`
      );
    }
    return true;
  }
  async selectOption(selector, value) {
    return this.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.value = ${JSON.stringify(
        value
      )}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`
    );
  }
  /** Clicks the Turnstile checkbox if a widget is rendered (real mouse event). */
  async pokeTurnstile() {
    const info = await this.eval(
      `(() => { const f = [...document.querySelectorAll('iframe')].find(f => /challenges\\.cloudflare\\.com/.test(f.src || '')); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`
    );
    if (!info || info.w < 10) return false;
    await this.mouseClick(info.x + Math.min(30, info.w / 2), info.y + info.h / 2);
    return true;
  }
  async screenshot(file) {
    const r = await this.cdp.send('Page.captureScreenshot', { format: 'png' }, this.s);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
  async responseBody(requestId) {
    const r = await this.cdp.send('Network.getResponseBody', { requestId }, this.s).catch(() => null);
    if (!r) return '';
    return r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
  }
  async cookies() {
    return this.cdp.send('Network.getAllCookies', {}, this.s).catch(() => ({ cookies: [] }));
  }
}

/**
 * Fresh incognito context with its own exit. Returns the page plus the network
 * buffer (`net.reqs` = every request with its status, `net.responses` bodies
 * fetched on demand).
 */
async function openContext(cdp, proxy, { capture = /.*/, blockAnalytics = true } = {}) {
  const ctx = await cdp.createBrowserContext(proxy ? { proxyServer: proxyLib.browserUrl(proxy) } : {});
  liveContexts.add(ctx);
  const { targetId, sessionId } = await cdp.newPage({ browserContextId: ctx, url: 'about:blank' });
  for (const domain of ['Page', 'Runtime', 'Network', 'DOM']) {
    await cdp.send(`${domain}.enable`, {}, sessionId);
  }
  if (blockAnalytics) {
    // Third-party analytics are pure noise for a 30 s burst on a flaky exit —
    // and they must not leak out of the exit, so they are blocked, not bypassed.
    await cdp
      .send(
        'Network.setBlockedURLs',
        { urls: ['*google-analytics.com*', '*googletagmanager.com*', '*googlesyndication.com*', '*doubleclick.net*', '*pagead2*', '*region1.google-analytics.com*'] },
        sessionId
      )
      .catch(() => {});
  }
  const detachProxyAuth = proxy && proxy.username ? await proxyLib.attachProxyAuth(cdp, sessionId, proxy) : async () => {};
  const net = { reqs: [], responses: [], console: [] };
  const tracked = new Map();
  cdp.on(
    'Network.requestWillBeSent',
    (p) => {
      if (!capture.test(p.request.url)) return;
      const rec = {
        requestId: p.requestId,
        method: p.request.method,
        url: p.request.url,
        type: p.type,
        postData: (p.request.postData || '').slice(0, 4000),
      };
      tracked.set(p.requestId, rec);
      net.reqs.push(rec);
    },
    sessionId
  );
  cdp.on(
    'Network.responseReceived',
    (p) => {
      const rec = tracked.get(p.requestId);
      if (!rec) return;
      rec.status = p.response.status;
      rec.mime = p.response.mimeType;
      rec.headers = p.response.headers;
      net.responses.push(rec);
    },
    sessionId
  );
  cdp.on('Network.loadingFailed', (p) => {
    const rec = tracked.get(p.requestId);
    if (rec) rec.failed = p.errorText;
  }, sessionId);
  // Bodies of API-ish traffic: the sign-up action's response is what says
  // whether a verify mail was sent, and the key endpoint's body carries the key.
  const INTERESTING = /\/api\/|_next\/.*action|register|signup|sign-up|verify|auth|key/i;
  cdp.on(
    'Network.loadingFinished',
    (p) => {
      const rec = tracked.get(p.requestId);
      if (!rec || rec.body !== undefined) return;
      if (!INTERESTING.test(rec.url) && !/json/.test(rec.mime || '')) return;
      cdp
        .send('Network.getResponseBody', { requestId: p.requestId }, sessionId)
        .then((r) => {
          if (!r) return;
          const body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
          if (body) rec.body = body.slice(0, 6000);
        })
        .catch(() => {});
    },
    sessionId
  );
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const t = (p.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
    if (/error|challenge|fail|denied/i.test(t)) net.console.push(`${p.type}: ${t.slice(0, 240)}`);
  }, sessionId);
  cdp.on('Runtime.exceptionThrown', (p) => {
    net.console.push(`EXC: ${JSON.stringify(p.exceptionDetails).slice(0, 240)}`);
  }, sessionId);
  const page = new Page(cdp, sessionId, net);
  return { ctx, targetId, sessionId, page, net, detachProxyAuth };
}

/**
 * Every context this process opened and has not closed yet. `reapOrphans`
 * uses it to dispose only *unowned* contexts, so a timeout that leaks a
 * browser context cannot take a parallel worker's context down with it.
 */
const liveContexts = new Set();

async function closeContext(cdp, ctx, targetId, detach) {
  try {
    if (detach) await detach();
  } catch {}
  if (targetId) await cdp.closePage(targetId);
  if (ctx) await cdp.disposeBrowserContext(ctx);
  if (ctx) liveContexts.delete(ctx);
}

/** Disposes contexts no live worker owns (leaks from timed-out bursts). */
async function reapOrphans(cdp) {
  let reaped = 0;
  try {
    const t = await cdp.send('Target.getTargets', {}, null);
    const owned = new Set();
    for (const info of t.targetInfos) if (info.browserContextId) owned.add(info.browserContextId);
    for (const ctx of owned) {
      if (liveContexts.has(ctx)) continue;
      await cdp.disposeBrowserContext(ctx);
      reaped++;
    }
  } catch {}
  return reaped;
}

module.exports = { CHROME, launchChrome, waitForPort, connect, openContext, closeContext, reapOrphans, liveContexts, Page, sleep };
