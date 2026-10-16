'use strict';

/**
 * One full account attempt, driven from a real browser, with every step logged:
 * register form -> submit -> whatever verification follows -> dashboard -> API
 * key. Everything (requests, bodies, cookies, screenshots, DOM) lands in
 * out/pilot-<tag>-* so the batch minter can be written from measurements
 * instead of guesses.
 *
 *   node src/pilot.js --proxy <line> --port 9920 --tag p1
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const B = require('./browser');
const mail = require('./mail');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const PROXY = arg('--proxy');
const PORT = parseInt(arg('--port', '9920'), 10);
const TAG = arg('--tag', 'p1');
const BROKER = arg('--broker', 'http://127.0.0.1:9700');
const MAIL_WAIT = parseInt(arg('--mail-wait', '180000'), 10);
const KEEP = args.includes('--keep-open');
const OUT = ensureOut();

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function randomPassword() {
  return `River${crypto.randomInt(100, 999)}!${crypto.randomBytes(2).toString('hex')}`;
}

const NAMES = ['Alex Morgan', 'Sam Rivera', 'Jordan Blake', 'Casey Quinn', 'Robin Vega', 'Devon Hale'];

async function snap(page, name) {
  try {
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.html`), await page.html());
    await page.screenshot(path.join(OUT, `${TAG}-${name}.png`));
    log(`snapshot ${name} @ ${await page.url()}`);
  } catch (e) {
    log(`snapshot ${name} failed: ${e.message}`);
  }
}

(async () => {
  if (!PROXY) throw new Error('--proxy required');
  const proxy = proxyLib.parseProxy(PROXY);
  log(`launch chrome port=${PORT} exit=${proxyLib.label(proxy)}`);
  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);
  const { ctx, targetId, page, net, detachProxyAuth } = await B.openContext(cdp, proxy);

  const t0 = Date.now();
  await page.goto('https://platform.inceptionlabs.ai/auth/register');
  const ready = await page.waitFor(`!!document.querySelector('#email')`, { timeoutMs: 75000, pollMs: 800 });
  log(`form ready=${!!ready} after ${Math.round((Date.now() - t0) / 1000)}s url=${await page.url()}`);
  if (!ready) {
    await snap(page, 'noform');
    log('BODY:', (await page.body()).replace(/\s+/g, ' ').slice(0, 300));
    process.exit(2);
  }
  await snap(page, 'form');

  const box = await mail.createInbox(BROKER, { label: TAG });
  log(`mailbox ${box.address} token=${box.token}`);

  const password = randomPassword();
  const name = NAMES[crypto.randomInt(0, NAMES.length)];
  await page.type('#name', name);
  await page.type('#email', box.address);
  await page.eval(`(() => { const s = document.querySelector('#hearAboutUs'); if (s && s.options.length > 2) { s.selectedIndex = 1 + ${crypto.randomInt(0, 3)}; s.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
  await page.type('#password', password);
  await page.type('#confirmPassword', password);
  const checked = await page.eval(`(() => { const c = document.querySelector('input[name=acceptTerms],input[type=checkbox]'); return c ? c.checked : null; })()`);
  if (checked === false) {
    const ok = await page.click(`document.querySelector('input[name=acceptTerms],input[type=checkbox]')`);
    if (!ok) await page.eval(`(() => { const c = document.querySelector('input[name=acceptTerms],input[type=checkbox]'); if (c) c.click(); return true; })()`);
  }
  await sleep(400);
  const pre = { checked: await page.eval(`(() => { const c = document.querySelector('input[name=acceptTerms],input[type=checkbox]'); return c ? c.checked : null; })()`), values: await page.eval(`[...document.querySelectorAll('input,select')].map(e => ({id:e.id||e.name, v: e.type==='password' ? '(pw)' : (e.type==='checkbox'? e.checked : e.value)}))`) };
  log('pre-submit', JSON.stringify(pre));
  await snap(page, 'filled');

  const before = net.reqs.length;
  const clicked = await page.click(`[...document.querySelectorAll('button')].find(b => /create account/i.test(b.innerText || ''))`);
  log(`submit clicked=${clicked}`);
  if (!clicked) {
    await page.eval(`(() => { const b = [...document.querySelectorAll('button')].find(b => /create account/i.test(b.innerText||'')); if (b) b.click(); return true; })()`);
  }

  // Watch the outcome: navigation, inline error, or a "check your email" screen.
  let outcome = null;
  const deadline = Date.now() + 90000;
  let prevText = '';
  while (Date.now() < deadline) {
    const info = await page
      .eval(`(() => ({ url: location.href, text: (document.body?document.body.innerText:'').replace(/\\s+/g,' ') }))()`)
      .catch(() => null);
    if (info && info.text !== prevText) {
      prevText = info.text;
      log(`page: ${info.url} :: ${info.text.slice(0, 300)}`);
    }
    if (info && /check your (email|inbox)|verif|confirm your email|link|sent/i.test(info.text) && !/register/i.test(info.url)) {
      outcome = 'verify';
      break;
    }
    const post = net.reqs.slice(before).find((r) => r.method === 'POST');
    if (post && post.status) {
      outcome = outcome || `post:${post.status}`;
    }
    if (net.reqs.slice(before).some((r) => r.status >= 400 && r.method === 'POST')) break;
    await sleep(1500);
  }
  log(`outcome=${outcome} url=${await page.url()}`);
  await snap(page, 'after-submit');
  const posts = net.reqs.filter((r) => r.method === 'POST');
  for (const p of posts) {
    log(`POST ${p.status} ${p.url.slice(0, 120)}`);
    if (p.postData) log(`  req: ${p.postData.slice(0, 1200)}`);
    if (p.body) log(`  res: ${p.body.slice(0, 1200)}`);
  }

  // Mail: link or code?
  const res = await mail.waitForMail(box, (msgs) => {
    const link = mail.pickVerifyLink(msgs);
    if (link) return { kind: 'link', link };
    const code = mail.pickCode(msgs);
    if (code) return { kind: 'code', code };
    if (msgs.length) return { kind: 'mail', msgs };
    return null;
  }, { timeoutMs: MAIL_WAIT, pollMs: 5000, log });
  log('mail result:', JSON.stringify(res).slice(0, 700));

  if (res.hit && res.hit.kind === 'link') {
    log(`opening verify link`);
    await page.goto(res.hit.link);
    await sleep(4000);
    log(`after link: ${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 300)}`);
    await snap(page, 'after-link');
  } else if (res.hit && res.hit.kind === 'code') {
    log(`code ${res.hit.code}; looking for a code input`);
    const hasCodeInput = await page.waitFor(`!!document.querySelector('input[inputmode=numeric],input[maxlength="6"],input[name*=code i],input[id*=code i]')`, { timeoutMs: 15000 });
    log(`code input present=${!!hasCodeInput}`);
    if (hasCodeInput) {
      await page.type('input[inputmode=numeric],input[maxlength="6"],input[name*=code i],input[id*=code i]', res.hit.code);
      await page.click(`[...document.querySelectorAll('button')].find(b => /verify|continue|submit|confirm/i.test(b.innerText || ''))`);
      await sleep(6000);
      log(`after code: ${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 300)}`);
      await snap(page, 'after-code');
    }
  }

  fs.writeFileSync(
    path.join(OUT, `${TAG}-net.json`),
    JSON.stringify(
      net.reqs.map((r) => ({ m: r.method, s: r.status, u: r.url.slice(0, 200), post: r.postData ? r.postData.slice(0, 1000) : undefined, body: r.body ? r.body.slice(0, 2000) : undefined, failed: r.failed })),
      null,
      1
    )
  );
  log(`final url=${await page.url()}`);
  log(`final text=${(await page.body()).replace(/\s+/g, ' ').slice(0, 600)}`);
  log('console:', JSON.stringify(net.console.slice(0, 8)));
  const ck = (await page.cookies()).cookies.map((c) => c.name);
  log('cookies:', ck.join(','));

  if (!KEEP) {
    await B.closeContext(cdp, ctx, targetId, detachProxyAuth);
    log('context closed (chrome left running)');
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
