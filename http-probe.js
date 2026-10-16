'use strict';

/**
 * Cookies out of a live Chrome + a replay of them over plain HTTP through a
 * *different* exit. This decides the architecture: if a session minted in the
 * browser keeps working over HTTP from another exit (no Vercel checkpoint, no
 * Turnstile), the browser is needed only for the register burst and the mail
 * wait costs no exit at all.
 *
 *   node src/http-probe.js --port 9925 [--path /dashboard/api-keys]
 */

const fs = require('fs');
const path = require('path');
const B = require('./browser');
const { request, OUT, proxyLib } = require('./lib');
const { ExitSupply } = require('./exits');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const PORT = parseInt(arg('--port', '9925'), 10);
const PATH_ = arg('--path', '/dashboard/api-keys');
const HOST = 'https://platform.inceptionlabs.ai';

async function cookiesFrom(port) {
  const cdp = await B.connect(port);
  const t = await cdp.send('Target.getTargets', {}, null);
  const page = t.targetInfos.find((x) => x.type === 'page' && /inceptionlabs\.ai/.test(x.url)) || t.targetInfos.find((x) => x.type === 'page');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
  await cdp.send('Network.enable', {}, sessionId);
  const all = await cdp.send('Network.getAllCookies', {}, sessionId);
  return all.cookies || [];
}

(async () => {
  const cookies = (await cookiesFrom(PORT)).filter((c) => /inceptionlabs\.ai$/.test(c.domain));
  console.log(`${cookies.length} inception cookies: ${cookies.map((c) => c.name).join(', ')}`);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const supply = new ExitSupply();
  for (let attempt = 1; attempt <= 4; attempt++) {
    const [hit] = await supply.acquire(1, { maxProbe: 20 });
    if (!hit) {
      console.log('no live exit');
      continue;
    }
    console.log(`[${attempt}] replay via ${proxyLib.label(hit.proxy)} -> ${PATH_}`);
    try {
      const r = await request(hit.proxy, HOST + PATH_, { timeoutMs: 35000, headers: { cookie: cookieHeader, accept: 'text/html' } });
      console.log(`status=${r.status} bytes=${r.text.length}`);
      const text = r.text.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      console.log(`text: ${text.slice(0, 400)}`);
      fs.writeFileSync(path.join(OUT, 'http-probe.out.html'), r.text);
      fs.writeFileSync(path.join(OUT, 'http-probe.cookies.txt'), cookieHeader + '\n');
      process.exit(0);
    } catch (e) {
      console.log(`  ERR ${String(e.message).slice(0, 90)}`);
    }
  }
  process.exit(1);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
