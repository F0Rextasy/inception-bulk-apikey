'use strict';

/**
 * Rescue for an account whose password was lost when the mint wedged mid-finish
 * (the account: registered + email verified, sign-in never completed, password
 * only in the dead process's memory).
 *
 *   node src/rescue-reset.js --email <addr> --box 5986 [--exit <line>] [--port 9967]
 *
 * Path: /auth/forgot-password -> mail (broker box) -> reset link -> new password
 * -> sign in -> /dashboard/api-keys -> create key -> print it (and verify).
 * Non-creating (no cap impact). Defaults to a point-of-use probed pool exit.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const B = require('./browser');
const mail = require('./mail');
const { ExitSupply } = require('./exits');
const { ensureOut, proxyLib, sleep, request } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const EMAIL = arg('--email');
const BOX = arg('--box');
const LINK = arg('--link');
const EXIT = arg('--exit');
const PORT = parseInt(arg('--port', '9967'), 10);
const OUT = ensureOut();
const LOG = path.join(OUT, 'rescue-reset.log');

const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};

(async () => {
  if (!EMAIL || !BOX) throw new Error('need --email and --box');
  const supply = new ExitSupply();
  let proxy = null;
  if (EXIT) proxy = proxyLib.parseProxy(EXIT);
  else {
    const [hit] = await supply.acquire(1, { maxProbe: 30 });
    if (!hit) throw new Error('no live exit');
    proxy = hit.proxy;
    log(`exit ${proxyLib.label(proxy)} probe=${hit.status} ${hit.ms}ms`);
  }

  const box = new mail.Mailbox('http://127.0.0.1:9700', EMAIL, BOX);
  const since = Date.now() - 60000;

  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);
  const ctxInfo = await B.openContext(cdp, proxy);
  const { page, net } = ctxInfo;
  const detach = ctxInfo.detachProxyAuth;
  try {
    let link = LINK || null;
    if (!link) {
      log('goto forgot-password');
      await page.goto('https://platform.inceptionlabs.ai/auth/forgot-password');
      const ready = await page.waitFor(`!!document.querySelector('#email')`, { timeoutMs: 90000, pollMs: 900 });
      log(`form ready=${!!ready} body=${(await page.body()).replace(/\s+/g, ' ').slice(0, 140)}`);
      if (!ready) throw new Error('forgot-password form never appeared');
      await page.type('#email', EMAIL);
      await sleep(400);
      const clicked = await page.click(`[...document.querySelectorAll('button')].find(b => /(send|reset|continue)/i.test((b.innerText||'').trim()))`);
      log(`submit clicked=${clicked}`);
      await sleep(2500);
      log(`after submit url=${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 200)}`);

      // Direct box read: waitForMail()'s digest filters by arrival age (built
      // for "mail that arrives during this wait") and missed the reset mail
      // that was demonstrably present; the sweeper path reads by id, no filter.
      const cache = {};
      const readLink = async () => {
        const list = await box.list().catch(() => []);
        // Newest message first: a spent reset token from an earlier attempt may
        // still be in the box; the fresh mail has the higher (snowflake) id.
        const cands = list
          .filter((m) => /reset|password/i.test(String(m.subject || '')))
          .sort((a, b) => String(b.id).localeCompare(String(a.id), 'en', { numeric: true }));
        for (const m of cands) {
          if (cache[m.id]) continue;
          const full = await box.read(m.id).catch(() => null);
          cache[m.id] = true;
          const text = `${(full && full.subject) || m.subject || ''}\n${(full && full.text) || ''}\n${(full && full.html) || ''}`;
          const l = mail.pickVerifyLink([{ text }], /inceptionlabs\.ai/);
          if (l) return l;
        }
        return null;
      };
      const deadline = Date.now() + 480000;
      while (Date.now() < deadline && !link) {
        link = await readLink();
        if (!link) {
          log('reset mail not found yet');
          await sleep(10000);
        }
      }
      log(`reset link: ${link}`);
    } else {
      log(`using provided reset link: ${link}`);
    }
    if (!link) throw new Error('no reset link');

    const newPass = `River${crypto.randomInt(1000, 9999)}!${crypto.randomBytes(3).toString('hex')}`;
    log(`new password generated (logged now so a crash cannot lose it): ${newPass}`);
    log('open reset link');
    await page.goto(link);
    await page.waitFor(`!/(verifying your browser|security checkpoint)/i.test((document.body&&document.body.innerText)||'')`, { timeoutMs: 90000, pollMs: 1200 }).catch(() => null);
    await sleep(2500);
    log(`after link url=${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 200)}`);

    const inputs = await page.eval(`[...document.querySelectorAll('input')].map(i => ({ id: i.id, name: i.name, type: i.type }))`);
    log(`inputs: ${JSON.stringify(inputs)}`);
    const passSel = inputs.find((i) => /pass|password/i.test(i.id || i.name || ''));
    if (passSel) {
      const ids = inputs.filter((i) => i.type === 'password');
      for (const i of ids) {
        await page.type(`#${i.id}`, newPass);
      }
      const ok = await page.click(`[...document.querySelectorAll('button')].find(b => /(reset|update|save|set|change|continue)/i.test((b.innerText||'').trim()))`);
      log(`reset submitted=${ok}`);
      await sleep(3000);
      log(`after reset url=${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 200)}`);
    }

    // Sign in with the new password.
    if (!/\/dashboard/.test(await page.url())) {
      await page.goto('https://platform.inceptionlabs.ai/auth/login');
      await page.waitFor(`!!document.querySelector('#password')`, { timeoutMs: 90000, pollMs: 900 });
      await page.type('#email', EMAIL);
      await page.type('#password', newPass);
      await sleep(500);
      const before = net.reqs.length;
      await page.click(`[...document.querySelectorAll('button')].find(b => /^(sign in|log in)$/i.test((b.innerText || '').trim()))`);
      const deadline = Date.now() + 90000;
      let signedIn = false;
      while (Date.now() < deadline) {
        const url = await page.url();
        if (/\/dashboard/.test(url) || /^https:\/\/platform\.inceptionlabs\.ai\/$/.test(url)) {
          // The app lands on the site root after a successful sign-in (measured);
          // /dashboard/* appears once it routes on. Require the login form to be
          // gone so a bounced /auth/login?callbackUrl=… URL is not a false pass.
          const txt = await page.body();
          if (!/welcome back|sign in to inception/i.test(txt)) {
            signedIn = true;
            break;
          }
        }
        if (/\/auth\/login/.test(url)) {
          const pre = net.reqs.slice(before).find((r) => /\/api\/auth\/login\b/.test(r.url) && r.body);
          if (pre) {
            try {
              const j = JSON.parse(pre.body);
              if (j && j.success === false && j.resetTime) {
                const waitMs = Math.min(180000, Math.max(5000, Date.parse(j.resetTime) - Date.now() + 3000));
                log(`login rate-limited, waiting ${Math.round(waitMs / 1000)}s (resetTime ${j.resetTime})`);
                await sleep(waitMs);
                await page.click(`[...document.querySelectorAll('button')].find(b => /^(sign in|log in)$/i.test((b.innerText || '').trim()))`).catch(() => {});
              }
            } catch {}
          }
        }
        await sleep(2000);
      }
      log(`signed in=${signedIn} url=${await page.url()}`);
      if (!signedIn) throw new Error('sign-in failed');
    }

    await page.goto('https://platform.inceptionlabs.ai/dashboard/api-keys');
    await page.waitFor(`/API Keys/i.test((document.body&&document.body.innerText)||'')`, { timeoutMs: 75000, pollMs: 1000 });
    await sleep(1200);
    const before = net.reqs.length;
    await page.click(`[...document.querySelectorAll('button')].find(b => /create api key/i.test((b.innerText || '').trim()))`);
    await sleep(1800);
    await page.waitFor(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; return d.querySelector('input') ? true : null; })()`, { timeoutMs: 15000, pollMs: 700 }).catch(() => null);
    await page.eval(
      `(() => { const d = document.querySelector('[role=dialog]'); if (!d) return false; const el = d.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; el.focus(); setter.call(el, 'river-rescue'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`
    );
    await sleep(600);
    const sub = await page.click(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; return [...d.querySelectorAll('button')].find(b => /create key/i.test((b.innerText||'').trim()) && !b.disabled) || null; })()`);
    log(`create-key submitted=${sub}`);
    let key = null;
    const deadline2 = Date.now() + 45000;
    while (Date.now() < deadline2) {
      const found = await page
        .eval(`(() => { const cands = []; const d = document.querySelector('[role=dialog]'); if (d) { d.querySelectorAll('input,code,pre,span,div').forEach(e => { const v = e.value || e.innerText || ''; if (v && v.length > 20) cands.push(v.trim()); }); } return cands.join('\\n'); })()`)
        .catch(() => '');
      const m = /(sk_[A-Za-z0-9_\-]{16,})/.exec(String(found || ''));
      if (m) { key = m[1]; break; }
      const wire = net.reqs.slice(before).map((r) => `${r.body || ''} ${r.postData || ''}`).join('\n');
      const wm = /"(?:key|apiKey|token|secret|value)"\s*:\s*"(sk_[A-Za-z0-9_\-]{16,})"/.exec(wire);
      if (wm) { key = wm[1]; break; }
      await sleep(1500);
    }
    log(`KEY=${key || '(none)'} newPass=${newPass}`);
    if (key) fs.writeFileSync(path.join(OUT, 'rescue-reset-key.txt'), `${key}\n${EMAIL}\n${newPass}\n`);
    await page.screenshot(path.join(OUT, 'rescue-reset.png'));
    process.exit(key ? 0 : 2);
  } finally {
    await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, detach).catch(() => {});
  }
})().catch((e) => {
  log('FATAL', (e && e.stack) || e);
  process.exit(1);
});
