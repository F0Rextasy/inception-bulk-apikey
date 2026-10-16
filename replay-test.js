'use strict';

/**
 * "Can a browser-minted session be replayed over HTTP from another exit?"
 * The exits die fast, so the probe and the replay happen in the same breath:
 * probe candidates in parallel, and the instant one answers, fire the replay
 * through it. Also dumps the cookie header for reuse.
 *
 *   node src/replay-test.js --port 9925 [--path /dashboard/api-keys]
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { request, OUT, proxyLib, mapLimit } = require('./lib');
const { ExitSupply } = require('./exits');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const PORT = parseInt(arg('--port', '9925'), 10);
const PATH_ = arg('--path', '/dashboard/api-keys');
const HOST = 'https://platform.inceptionlabs.ai';
const MAX_CAND = parseInt(arg('--max', '60'), 10);

async function cookiesFrom(port) {
  const cdp = await B.connect(port);
  const t = await cdp.send('Target.getTargets', {}, null);
  const page = t.targetInfos.find((x) => x.type === 'page' && /inceptionlabs\.ai/.test(x.url)) || t.targetInfos.find((x) => x.type === 'page');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
  await cdp.send('Network.enable', {}, sessionId);
  const all = await cdp.send('Network.getAllCookies', {}, sessionId);
  return (all.cookies || []).filter((c) => /inceptionlabs\.ai$/.test(c.domain));
}

(async () => {
  const cookies = await cookiesFrom(PORT);
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  fs.writeFileSync(path.join(OUT, 'session-cookies.txt'), header + '\n');
  console.log(`${cookies.length} cookies saved; ${header.length} bytes`);

  const supply = new ExitSupply();
  supply.reload();
  const cands = supply.candidates().slice(0, MAX_CAND);
  console.log(`${cands.length} candidates`);

  let done = false;
  await mapLimit(cands, 6, async (proxy) => {
    if (done) return;
    try {
      const probe = await request(proxy, HOST + '/auth/register', { timeoutMs: 15000, connectTimeoutMs: 6000 });
      if (!(probe.status >= 200 && probe.status < 500)) return;
      console.log(`probe ok ${proxyLib.label(proxy)} ${probe.status} ${probe.ms}ms — replaying`);
      const r = await request(proxy, HOST + PATH_, {
        timeoutMs: 30000,
        connectTimeoutMs: 6000,
        headers: { cookie: header, accept: 'text/html' },
      });
      const text = r.text.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      console.log(`REPLAY via ${proxyLib.label(proxy)} status=${r.status} bytes=${r.text.length}`);
      console.log(`  text: ${text.slice(0, 300)}`);
      if (!done) {
        done = true;
        fs.writeFileSync(path.join(OUT, 'replay-result.txt'), `via ${proxyLib.label(proxy)} status=${r.status}\n${text.slice(0, 2000)}\n`);
        fs.writeFileSync(path.join(OUT, 'replay-result.html'), r.text);
      }
      supply.note(proxy, { ok: true, note: 'replay-ok' });
    } catch (e) {
      supply.note(proxy, { ok: false, note: 'replay-err' });
    }
  });
  console.log(done ? 'REPLAY SUCCEEDED' : 'no replay succeeded');
  process.exit(done ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
