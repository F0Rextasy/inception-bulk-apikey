'use strict';

/**
 * Broker timing probe (no browser, loopback only).
 *
 *   node src/broker-timing.js
 *
 * The batch's slowest step is the verify mail: the register burst is 30 s on
 * proxy but the mail pipeline (SES -> Mailtrap/inboxes.com -> local broker)
 * took >5 min for the pilot account. This measures /create and empty /list on
 * both brokers, plus /read of one known message, so the batch picks the fast
 * family and the right poll cadence.
 */

const http = require('http');

function call(base, path, { method = 'GET', body = null, timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    const port = parseInt(base.split(':')[2], 10);
    const payload = body === null ? null : Buffer.from(JSON.stringify(body));
    const t0 = Date.now();
    const req = http.request(
      { method, host: '127.0.0.1', port, path, headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {} },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ ms: Date.now() - t0, status: res.statusCode, json, text });
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ ms: Date.now() - t0, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  for (const [base, folder] of [['http://127.0.0.1:9700', 'inception-bulk'], ['http://127.0.0.1:9701', 'inception-bulk']]) {
    const c = await call(base, '/create', { method: 'POST', body: { folder }, timeoutMs: 150000 });
    const addr = (c.json && c.json.address) || '(none)';
    const tok = (c.json && c.json.token) || '';
    console.log(`${base} /create ${c.ms}ms status=${c.status} ${addr}`);
    if (tok) {
      for (let i = 1; i <= 3; i++) {
        const l = await call(base, `/list?token=${encodeURIComponent(tok)}`);
        const n = Array.isArray(l.json) ? l.json.length : ((l.json && (l.json.messages || l.json.data)) || []).length;
        console.log(`${base} /list#${i} ${l.ms}ms status=${l.status} msgs=${n}`);
      }
    }
  }
  // Known pilot message (arrived late): can its body be read?
  const tok = process.argv[2];
  const id = process.argv[3];
  if (tok && id) {
    const r = await call('http://127.0.0.1:9700', `/read?id=${encodeURIComponent(id)}&token=${encodeURIComponent(tok)}`);
    const link = /https?:\/\/[^\s"'<>\\]+/.exec(JSON.stringify(r.json || r.text));
    console.log(`/read ${r.ms}ms link=${link ? link[0].slice(0, 110) : '(none)'}`);
  }
})();
