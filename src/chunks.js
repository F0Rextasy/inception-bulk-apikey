'use strict';

/**
 * Pulls the register page's JS chunks through one exit and greps them for the
 * endpoints the page talks to — cheaper and far more reliable than reading the
 * network trace of a single lucky submission.
 *
 *   node src/chunks.js --proxy <line> [--host https://platform.inceptionlabs.ai]
 */

const fs = require('fs');
const path = require('path');
const { request, mapLimit, ensureOut, proxyLib } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);

const PROXY = arg('--proxy');
const RECON = arg('--recon');
const OUT = path.join(ensureOut(), 'chunks');
const CONC = 4;

(async () => {
  const proxy = PROXY ? proxyLib.parseProxy(PROXY) : null;
  const scripts = RECON ? JSON.parse(fs.readFileSync(RECON, 'utf8')).scripts : [];
  fs.mkdirSync(OUT, { recursive: true });
  const list = scripts.filter((s) => /_next\/static/.test(s));
  console.log(`${list.length} chunks to fetch`);
  const reports = [];
  await mapLimit(list, CONC, async (url) => {
    const name = url.split('/').pop();
    try {
      const r = await request(proxy, url, { timeoutMs: 40000 });
      if (r.status !== 200) {
        console.log(`${name} -> ${r.status}`);
        return;
      }
      fs.writeFileSync(path.join(OUT, name), r.text);
      const hits = {};
      for (const [label, re] of [
        ['api', /\/api\/[a-zA-Z0-9_\/\-\[\]\.]*/g],
        ['auth', /\/auth\/[a-zA-Z0-9_\/\-]*/g],
        ['register', /register[A-Za-z]*/g],
        ['verify', /verif[a-zA-Z]*/g],
        ['apikey', /api[-_ ]?keys?[a-zA-Z\/_\-]*/gi],
        ['dashboard', /\/dashboard[a-zA-Z0-9_\/\-]*/g],
        ['serverAction', /createServerReference\("([0-9a-f]+)"/g],
      ]) {
        const m = new Set();
        let x;
        while ((x = re.exec(r.text))) m.add(x[1] || x[0]);
        if (m.size) hits[label] = [...m].slice(0, 20);
      }
      reports.push({ name, bytes: r.text.length, hits });
      console.log(`${name} ${r.text.length}b ${Object.keys(hits).join(',')}`);
    } catch (e) {
      console.log(`${name} ERR ${String(e.message).slice(0, 80)}`);
    }
  });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(reports, null, 1));
  for (const r of reports) {
    console.log(`\n=== ${r.name}`);
    console.log(JSON.stringify(r.hits));
  }
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
