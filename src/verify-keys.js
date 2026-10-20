'use strict';

/**
 * Standalone re-verifier: every key in keys.txt gets `GET /v1/models` and one
 * tiny chat completion through api.inceptionlabs.ai (CloudFront — no Vercel
 * checkpoint on this host, so plain HTTP through an api-capable exit works).
 * The proxy pool is OPTIONAL: without one the calls leave this machine
 * directly (a pool is recommended at scale).
 *
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, request, ensureOut, proxyLib, mapLimit, sleep } = require('./lib');

const KEYS_FILE = path.join(ROOT, 'keys.txt');
const OUT = ensureOut();
const API = 'https://api.inceptionlabs.ai/v1';

const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const MODEL = arg('--model', 'mercury-2.5');
const CHAT_LIMIT = parseInt(arg('--chat', '30'), 10);

function apiExits() {
  const out = [];
  for (const f of [path.join(ROOT, 'proxies.txt'), path.join(OUT, 'api-live.txt'), path.join(OUT, 'api-live.jsonl')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const p = line.split('\t')[0].trim();
      if (!/^(https?|socks[45]):\/\//.test(p)) continue;
      const parsed = proxyLib.parseProxy(p);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

async function withExit(fn, { attempts = 8 } = {}) {
  const exits = apiExits();
  // A fixed exit via INCEPTION_VERIFY_EXIT wins; otherwise everything goes
  // through the pool in proxies.txt. With neither, the call goes out directly —
  // a pool is recommended at scale, but nothing here requires one.
  const fixed = process.env.INCEPTION_VERIFY_EXIT ? proxyLib.parseProxy(process.env.INCEPTION_VERIFY_EXIT) : null;
  const order = fixed ? [fixed] : [];
  if (!order.length && !exits.length) console.log('no exit list — verifying WITHOUT a proxy (direct)');
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const proxy = order.length ? order.shift() : exits.length ? exits[crypto.randomInt(0, exits.length)] : null;
    try {
      return await fn(proxy);
    } catch (e) {
      lastErr = e;
      await sleep(400);
    }
  }
  throw lastErr || new Error('no exit');
}

async function checkKey(key, { chat }) {
  const models = await withExit((proxy) =>
    request(proxy, `${API}/models`, { timeoutMs: 25000, headers: { authorization: `Bearer ${key}`, accept: 'application/json' } })
  );
  if (models.status !== 200) return { key, ok: false, note: `models ${models.status} ${models.text.slice(0, 120)}` };
  let list = [];
  try {
    list = JSON.parse(models.text).data || [];
  } catch {}
  let sample = null;
  if (chat) {
    const r = await withExit((proxy) =>
      request(proxy, `${API}/chat/completions`, {
        method: 'POST',
        timeoutMs: 60000,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: { model: MODEL, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], max_tokens: 8, temperature: 0 },
      })
    );
    if (r.status !== 200) return { key, ok: false, note: `chat ${r.status} ${r.text.slice(0, 140)}`, models: list.map((m) => m.id) };
    try {
      const j = JSON.parse(r.text);
      sample = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    } catch {}
  }
  return { key, ok: true, models: list.map((m) => m.id), sample: sample === null ? undefined : String(sample).slice(0, 80) };
}

(async () => {
  const only = arg('--only');
  const keys = (only ? [only] : fs.readFileSync(KEYS_FILE, 'utf8').split(/\r?\n/)).map((s) => s.trim()).filter(Boolean);
  console.log(`${keys.length} keys to verify; exits=${apiExits().length || 'direct'}; model=${MODEL}`);
  let i = 0;
  const results = await mapLimit(keys, 4, async (key) => {
    const idx = i++;
    const r = await checkKey(key, { chat: idx < CHAT_LIMIT }).catch((e) => ({ key, ok: false, note: `throw ${String(e.message).slice(0, 80)}` }));
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${key.slice(0, 4)}…${key.slice(-4)} ${r.ok ? `${(r.models || []).length} models | ${r.sample ?? ''}` : r.note}`);
    return r;
  });
  const okCount = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, 'verify-report.json'), JSON.stringify({ at: new Date().toISOString(), model: MODEL, ok: okCount, total: results.length, results }, null, 1));
  console.log(`verified ${okCount}/${results.length}`);
  process.exit(okCount === results.length ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e && e.stack);
  process.exit(1);
});
