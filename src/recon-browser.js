'use strict';

/**
 * Browser-level recon: does a real Chrome clear the Vercel Security Checkpoint,
 * and what does the register page actually want? Dumps DOM, network trace,
 * cookies and a screenshot so the HTTP-only path (if any) can be derived.
 *
 *   node src/recon-browser.js [--proxy http://1.2.3.4:8080] [--url .../auth/register]
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const PROXY = arg('--proxy');
const URL_ = arg('--url', 'https://platform.inceptionlabs.ai/auth/register');
const PORT = parseInt(arg('--port', '9910'), 10);
const WAIT = parseInt(arg('--wait', '90000'), 10);
const OUT = ensureOut();
const TAG = arg('--tag', 'r1');

(async () => {
  const proxy = PROXY ? proxyLib.parseProxy(PROXY) : null; // no --proxy = direct
  const profile = path.join(OUT, `chrome-${PORT}`);
  console.log(`launching chrome port=${PORT} profile=${profile}`);
  B.launchChrome(PORT, profile, { headless: args.includes('--headless') });
  const cdp = await B.connect(PORT);
  const { ctx, targetId, page, net, detachProxyAuth } = await B.openContext(cdp, proxy);

  const t0 = Date.now();
  await page.goto(URL_);
  let passed = false;
  let last = '';
  while (Date.now() - t0 < WAIT) {
    const info = await page
      .eval(`(() => ({ url: location.href, title: document.title, text: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0,180) }))()`)
      .catch(() => null);
    if (info && info.text !== last) {
      console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${info.url} :: ${info.title} :: ${info.text}`);
      last = info.text;
    }
    if (
      info &&
      !/verifying your browser|security checkpoint/i.test(info.text) &&
      !/can’t be reached|can't be reached|ERR_|No internet|proxy server/i.test(info.text) &&
      /mercury|inception|create an account|sign in/i.test(info.text)
    ) {
      passed = true;
      break;
    }
    await sleep(2500);
  }

  console.log(`\n=== passed=${passed} after ${Math.round((Date.now() - t0) / 1000)}s`);
  const dump = {
    passed,
    url: await page.url(),
    title: await page.title(),
    bodyText: (await page.body()).slice(0, 8000),
    cookies: (await page.cookies()).cookies.map((c) => ({ name: c.name, domain: c.domain, secure: c.secure })),
    inputs: await page
      .eval(
        `[...document.querySelectorAll('input,select,textarea,button')].map(e => ({ tag: e.tagName, type: e.type||null, name: e.name||null, id: e.id||null, placeholder: e.placeholder||null, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '') || null, text: (e.innerText||'').slice(0,40) }))`
      )
      .catch(() => []),
    iframes: await page.eval(`[...document.querySelectorAll('iframe')].map(f => (f.src||'').slice(0,120))`).catch(() => []),
    scripts: await page.eval(`[...document.querySelectorAll('script[src]')].map(s => s.src)`).catch(() => []),
  };
  fs.writeFileSync(path.join(OUT, `${TAG}-recon.json`), JSON.stringify(dump, null, 1));
  fs.writeFileSync(path.join(OUT, `${TAG}-page.html`), await page.html());
  fs.writeFileSync(
    path.join(OUT, `${TAG}-net.json`),
    JSON.stringify(net.reqs.map((r) => ({ m: r.method, s: r.status, t: r.type, u: r.url.slice(0, 200), post: r.postData ? r.postData.slice(0, 800) : undefined, failed: r.failed })), null, 1)
  );
  await page.screenshot(path.join(OUT, `${TAG}-shot.png`));
  console.log(JSON.stringify({ ...dump, bodyText: dump.bodyText.slice(0, 1500) }, null, 1));
  console.log('console:', net.console.slice(0, 10));
  await B.closeContext(cdp, ctx, targetId, detachProxyAuth);
  console.log('done');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
