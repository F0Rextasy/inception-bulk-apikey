'use strict';

/**
 * Discovers the post-registration half of the flow on one existing account:
 * open the verify link -> sign in -> dashboard -> API keys -> create a key.
 * Every step logs the DOM, the network and a screenshot so the batch minter can
 * copy the observed shapes instead of guessing.
 *
 *   node src/finish.js --email a@b --password 'x' --verify "<url>" --port 9925
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ExitSupply } = require('./exits');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const EMAIL = arg('--email');
const PASSWORD = arg('--password');
const VERIFY = arg('--verify');
const PORT = parseInt(arg('--port', '9925'), 10);
const TAG = arg('--tag', 'f1');
const OUT = ensureOut();
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function snap(page, name) {
  try {
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.html`), await page.html());
    await page.screenshot(path.join(OUT, `${TAG}-${name}.png`));
    log(`snap ${name} url=${await page.url()}`);
  } catch (e) {
    log(`snap ${name} failed ${e.message}`);
  }
}

(async () => {
  const supply = new ExitSupply();
  const [hit] = await supply.acquire(1, { maxProbe: 20 });
  if (!hit) throw new Error('no live exit');
  log(`exit ${proxyLib.label(hit.proxy)} probe=${hit.status} ${hit.ms}ms`);

  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);
  const { ctx, targetId, page, net, detachProxyAuth } = await B.openContext(cdp, hit.proxy);

  if (VERIFY) {
    log('opening verify link');
    await page.goto(VERIFY);
    await page.waitFor(`!/(verifying your browser|security checkpoint)/i.test(document.body?document.body.innerText:'')`, { timeoutMs: 60000, pollMs: 1000 });
    await sleep(3000);
    log(`verify page: ${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 400)}`);
    await snap(page, 'verify');
  }

  // Sign-in if the verify step did not already leave a session.
  const onDashboard = await page.waitFor(`/\\/dashboard/.test(location.href)`, { timeoutMs: 8000, pollMs: 1000 });
  if (!onDashboard) {
    log('going to /auth/login');
    await page.goto('https://platform.inceptionlabs.ai/auth/login');
    const ready = await page.waitFor(`!!document.querySelector('input[type=email],#email')`, { timeoutMs: 60000, pollMs: 900 });
    log(`login form ready=${!!ready}`);
    await snap(page, 'login');
    if (ready) {
      const emailSel = (await page.eval(`document.querySelector('#email') ? '#email' : 'input[type=email]'`)) || '#email';
      const pwSel = (await page.eval(`document.querySelector('#password') ? '#password' : 'input[type=password]'`)) || '#password';
      await page.type(emailSel, EMAIL);
      await page.type(pwSel, PASSWORD);
      await sleep(600);
      // Turnstile may be invisible; give it a moment and poke if visible.
      await page.pokeTurnstile().catch(() => {});
      await sleep(1200);
      const before = net.reqs.length;
      const clicked = await page.click(`[...document.querySelectorAll('button')].find(b => /^(sign in|log in|continue)$/i.test((b.innerText||'').trim()))`);
      log(`sign-in clicked=${clicked}`);
      if (!clicked) await page.eval(`(() => { const b=[...document.querySelectorAll('button')].find(b=>/sign in/i.test(b.innerText||'')); if(b) b.click(); return true; })()`);
      for (let i = 0; i < 30; i++) {
        await sleep(1500);
        const url = await page.url();
        if (/dashboard/.test(url)) break;
        const txt = (await page.body()).replace(/\s+/g, ' ');
        if (/invalid|incorrect|error|failed/i.test(txt) && i > 3) log(`login says: ${txt.slice(0, 240)}`);
      }
      log(`after sign-in: ${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 300)}`);
      await snap(page, 'after-signin');
      for (const r of net.reqs.slice(before).filter((r) => r.method === 'POST')) {
        log(`POST ${r.status} ${r.url.slice(0, 110)}`);
        if (r.postData) log(`  req ${r.postData.slice(0, 300)}`);
        if (r.body) log(`  res ${String(r.body).slice(0, 300)}`);
      }
    }
  }

  // Dashboard + API keys.
  log('going to /dashboard/api-keys');
  await page.goto('https://platform.inceptionlabs.ai/dashboard/api-keys');
  await sleep(6000);
  log(`api-keys page: ${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 700)}`);
  await snap(page, 'api-keys');
  const buttons = await page.eval(`[...document.querySelectorAll('button,a')].map(b => ({ tag:b.tagName, t:(b.innerText||'').trim().slice(0,50), href:b.href||null })).filter(x => x.t)`);
  log('controls: ' + JSON.stringify(buttons).slice(0, 1600));
  const inputs = await page.eval(`[...document.querySelectorAll('input,textarea,select')].map(e => ({id:e.id||e.name, type:e.type, ph:e.placeholder}))`);
  log('inputs: ' + JSON.stringify(inputs).slice(0, 800));

  // Try to create a key.
  const before = net.reqs.length;
  const created = await page.click(`[...document.querySelectorAll('button')].find(b => /create|new|generate|add/i.test((b.innerText||'').trim()))`);
  log(`create clicked=${created}`);
  await sleep(5000);
  log(`after create: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 700)}`);
  await snap(page, 'after-create');
  for (const r of net.reqs.slice(before)) {
    if (r.method === 'POST' || /key/i.test(r.url)) {
      log(`${r.method} ${r.status} ${r.url.slice(0, 130)}`);
      if (r.postData) log(`  req ${String(r.postData).slice(0, 400)}`);
      if (r.body) log(`  res ${String(r.body).slice(0, 700)}`);
    }
  }
  fs.writeFileSync(path.join(OUT, `${TAG}-net.json`), JSON.stringify(net.reqs.map((r) => ({ m: r.method, s: r.status, u: r.url.slice(0, 200), post: r.postData && r.postData.slice(0, 800), body: r.body && String(r.body).slice(0, 1500) })), null, 1));
  log('done; chrome left running on port ' + PORT);
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
