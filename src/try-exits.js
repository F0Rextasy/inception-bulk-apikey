'use strict';

/**
 * Walks a list of exits through one real Chrome and reports which ones clear
 * the Vercel Security Checkpoint. One context per exit; the browser itself is
 * launched once, because a cold Chrome start is ~8 s and the challenge verdict
 * is a property of the exit, not of the browser.
 *
 *   node src/try-exits.js --proxies out/platform-429.txt --wait 45000 --port 9915
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { ensureOut, proxyLib, sleep } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const PROXY_FILE = arg('--proxies');
const PROXY_LIST = arg('--list');
const WAIT = parseInt(arg('--wait', '45000'), 10);
const PORT = parseInt(arg('--port', '9915'), 10);
const LIMIT = parseInt(arg('--limit', '30'), 10);
const TAG = arg('--tag', 'try');
const OUT = ensureOut();

function lines() {
  const out = [];
  if (PROXY_LIST) out.push(...PROXY_LIST.split(','));
  if (PROXY_FILE && fs.existsSync(PROXY_FILE)) out.push(...fs.readFileSync(PROXY_FILE, 'utf8').split(/\r?\n/));
  return out.map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).slice(0, LIMIT);
}

(async () => {
  const list = lines();
  console.log(`${list.length} exits to try`);
  B.launchChrome(PORT, path.join(OUT, `chrome-${PORT}`));
  const cdp = await B.connect(PORT);
  const results = [];
  for (const line of list) {
    const proxy = proxyLib.parseProxy(line);
    if (!proxy) continue;
    const t0 = Date.now();
    let rec = { proxy: line, verdict: 'unknown' };
    let ctxInfo = null;
    try {
      ctxInfo = await B.openContext(cdp, proxy);
      const { page } = ctxInfo;
      await page.goto('https://platform.inceptionlabs.ai/auth/register');
      let verdict = 'timeout';
      let text = '';
      while (Date.now() - t0 < WAIT) {
        const info = await page
          .eval(`(() => ({ text: (document.body ? document.body.innerText : '').replace(/\\s+/g,' '), title: document.title, url: location.href }))()`)
          .catch(() => null);
        if (!info) {
          await sleep(1200);
          continue;
        }
        text = info.text;
        if (/failed to verify|code 99/i.test(info.text)) {
          verdict = 'failed';
          break;
        }
        // Chrome's own error page is not a pass: only real site content counts.
        if (/can’t be reached|can't be reached|ERR_|No internet|proxy server/i.test(info.text)) {
          verdict = 'neterr';
          break;
        }
        if (!/verifying your browser|security checkpoint/i.test(info.text) && info.text.length > 40 && /mercury|inception|sign in|create an account/i.test(info.text)) {
          verdict = 'passed';
          break;
        }
        await sleep(1500);
      }
      const cookies = (await page.cookies()).cookies.map((c) => c.name).join(',');
      rec = { proxy: line, verdict, ms: Date.now() - t0, text: text.slice(0, 140), cookies };
      if (verdict === 'passed') {
        fs.writeFileSync(path.join(OUT, `${TAG}-passed.txt`), fs.existsSync(path.join(OUT, `${TAG}-passed.txt`)) ? fs.readFileSync(path.join(OUT, `${TAG}-passed.txt`), 'utf8') + line + '\n' : line + '\n');
      }
    } catch (e) {
      rec = { proxy: line, verdict: 'err', ms: Date.now() - t0, error: String(e.message || e).slice(0, 140) };
    }
    console.log(JSON.stringify(rec));
    results.push(rec);
    if (ctxInfo) await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);
    fs.writeFileSync(path.join(OUT, `${TAG}-exits.json`), JSON.stringify(results, null, 1));
  }
  console.log(`done: ${results.filter((r) => r.verdict === 'passed').length}/${results.length} passed`);
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
