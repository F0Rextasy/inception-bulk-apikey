'use strict';

/**
 * Rescue UI: attach to the already-running mint browser (port) as a second CDP
 * client, find the signed-in platform.inceptionlabs.ai page, and (optionally)
 * complete "Create API Key" on it — used when the mint process wedges after
 * sign-in but the browser context still holds the authenticated session.
 *
 *   node src/rescue-ui.js --port 9966 [--create] [--target <targetId>]
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ensureOut, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const PORT = parseInt(arg('--port', '9966'), 10);
const CREATE = args.includes('--create');
const OUT = ensureOut();

(async () => {
  const cdp = await B.connect(PORT);
  const targets = await cdp.send('Target.getTargets', {}, null);
  const pages = targets.targetInfos.filter((t) => t.type === 'page');
  console.log(`pages: ${pages.length}`);
  for (const t of pages) console.log(`  ${t.targetId} ${String(t.url).slice(0, 110)}  ctx=${t.browserContextId || '-'}`);
  const hits = pages.filter((t) => /inceptionlabs\.ai/.test(t.url) && !/assets|favicon/.test(t.url));
  if (!hits.length) {
    console.log('no inceptionlabs page target; done');
    process.exit(0);
  }
  const pick = arg('--target') || hits[hits.length - 1].targetId;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: pick, flatten: true }, null);
  for (const d of ['Page', 'Runtime', 'Network']) await cdp.send(`${d}.enable`, {}, sessionId).catch(() => {});
  const page = new B.Page(cdp, sessionId, { reqs: [], responses: [], console: [] });

  const url = await page.url();
  console.log(`attached: ${pick} url=${url}`);
  await page.screenshot(path.join(OUT, 'rescue-attach.png'));
  const body = (await page.body()).replace(/\s+/g, ' ').slice(0, 300);
  console.log(`body: ${body}`);

  if (!CREATE) {
    process.exit(0);
  }

  if (!/\/dashboard\/api-keys/.test(await page.url())) {
    await page.goto('https://platform.inceptionlabs.ai/dashboard/api-keys');
    await page.waitFor(`/API Keys/i.test((document.body&&document.body.innerText)||'')`, { timeoutMs: 60000, pollMs: 900 });
  }
  await sleep(1000);
  const opened = await page.click(`[...document.querySelectorAll('button')].find(b => /create api key/i.test((b.innerText || '').trim()))`);
  console.log(`create-dialog click: ${opened}`);
  await sleep(1800);
  const nameInput = await page.waitFor(
    `(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const el = d.querySelector('input'); return el ? (el.id || el.name || 'dialog-input') : null; })()`,
    { timeoutMs: 15000, pollMs: 700 }
  );
  if (nameInput) {
    await page.eval(
      `(() => { const d = document.querySelector('[role=dialog]'); const el = d.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; el.focus(); setter.call(el, 'river-rescue'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`
    );
    await sleep(600);
  }
  const submitted = await page.click(
    `(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; return [...d.querySelectorAll('button')].find(b => /create key/i.test((b.innerText||'').trim()) && !b.disabled) || null; })()`
  );
  console.log(`create-key submitted=${submitted} nameInput=${nameInput}`);
  let key = null;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const found = await page
      .eval(`(() => { const cands = []; const d = document.querySelector('[role=dialog]'); if (d) { d.querySelectorAll('input,code,pre,span,div').forEach(e => { const v = e.value || e.innerText || ''; if (v && v.length > 20) cands.push(v.trim()); }); } return cands.join('\\n'); })()`)
      .catch(() => '');
    const m = /([A-Za-z0-9_\-]{24,})/.exec(String(found || ''));
    if (m && !/^river-/.test(m[1]) && m[1].length >= 24) {
      key = m[1];
      break;
    }
    await sleep(1500);
  }
  console.log(`KEY=${key || '(none)'}`);
  await page.screenshot(path.join(OUT, 'rescue-key.png'));
  if (key) fs.writeFileSync(path.join(OUT, 'rescue-key.txt'), key + '\n');
  process.exit(key ? 0 : 2);
})().catch((e) => {
  console.error('FATAL', (e && e.stack) || e);
  process.exit(1);
});
