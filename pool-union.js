'use strict';
/**
 * Unions every pool file we have into out/relay-candidates.txt (deduped, no
 * loopback lines). Run again after router injections; the relay reads its list
 * once at startup, so restart it after refreshing.
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const FILES = [
  '../proxies.txt',
  path.join(OUT, 'platform-429.txt'),
  path.join(OUT, 'api-live.txt'),
  path.join(OUT, 'warm-platform.txt'),
  path.join(__dirname, 'out', 'union-live.txt'),
  path.join(__dirname, 'out', 'router.tsv'),
];
const seen = new Set();
const out = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  for (let line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.includes('\t')) {
      const c = line.split('\t').find((x) => /^(https?|socks[45]):\/\//.test(x));
      if (!c) continue;
      line = c;
    }
    if (!/^(https?|socks[45]):\/\//.test(line)) continue;
    if (/^[a-z]+:\/\/(127\.|localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
}
fs.writeFileSync(path.join(OUT, 'relay-candidates.txt'), out.join('\n') + '\n');
console.log(`${out.length} relay candidates`);
