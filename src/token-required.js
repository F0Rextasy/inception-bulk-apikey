'use strict';

/**
 * Is the Turnstile token actually required by POST /api/auth/register?
 *
 *   node src/token-required.js --port 9936 [--broker 9700]
 *
 * Runs the register POST *inside an already-loaded, checkpoint-cleared page*
 * with an empty `cf-turnstile-response`. A 200 means the captcha is decorative
 * for this endpoint (the whole flow gets much simpler); a 4xx names the gate.
 * Uses a real broker mailbox so the mail can be checked afterwards.
 */

const B = require('./browser');
const mail = require('./mail');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const PORT = parseInt(arg('--port', '9936'), 10);
const BROKER = `http://127.0.0.1:${arg('--broker', '9700')}`;

(async () => {
  const box = await mail.createInbox(BROKER, { attempts: 2, timeoutMs: 60000 });
  console.log(`mailbox ${box.address}`);
  // The probe attaches to an already-running Chrome (the batch's) — launch one
  // when nothing answers, so it also works standalone after a park/cleanup.
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`);
  } catch {
    const path = require('path');
    const { OUT } = require('./lib');
    console.log(`launching chrome on ${PORT}`);
    B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  }
  const cdp = await B.connect(PORT);
  const t = await cdp.send('Target.getTargets', {}, null);
  const pages = t.targetInfos.filter((x) => x.type === 'page');
  console.log(`${pages.length} pages`);
  // Standalone: a fresh Chrome has only about:blank — load the register page in
  // it first, because the POST is only meaningful once the checkpoint cleared.
  const hasPage = pages.some((p) => /inceptionlabs\.ai/.test(p.url || ''));
  if (!hasPage && pages.length) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pages[0].targetId, flatten: true }, null);
    for (const d of ['Page', 'Runtime', 'Network']) await cdp.send(`${d}.enable`, {}, sessionId).catch(() => {});
    await cdp.send('Page.navigate', { url: 'https://platform.inceptionlabs.ai/auth/register' }, sessionId);
    const page = new B.Page(cdp, sessionId, { reqs: [], responses: [], console: [] });
    const ready = await page.waitFor(`!!document.querySelector('#email')`, { timeoutMs: 90000, pollMs: 1200 });
    console.log(`register page ready=${!!ready}`);
    if (ready) pages[0].url = 'https://platform.inceptionlabs.ai/auth/register';
  }
  for (const p of pages) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: p.targetId, flatten: true }, null);
    const info = await cdp
      .send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId)
      .catch(() => null);
    const url = (info && info.result && info.result.value) || '';
    if (!/inceptionlabs\.ai/.test(url)) continue;
    console.log(`testing in ${url.slice(0, 80)}`);
    const probePassword = 'Probe' + Date.now() + '!7';
    const expr = `(async () => { try { const r = await fetch('/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: 'Probe Token', email: ${JSON.stringify(
      box.address
    )}, password: ${JSON.stringify(probePassword)}, 'cf-turnstile-response': ${JSON.stringify(process.env.CF_TOKEN || '')} }) }); return { status: r.status, body: (await r.text()).slice(0, 300) }; } catch (e) { return { error: String(e).slice(0, 200) }; } })()`;
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId).catch((e) => ({ error: e }));
    console.log('RESULT', JSON.stringify(r.result ? r.result.value : r).slice(0, 500));
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
