'use strict';
/**
 * Failover relay for Chrome, adapted from sv-relay.js.
 *
 * A browser phase here lasts 30-60 s, while a free exit's half-life is 1-3
 * minutes: a single pinned exit dies mid-page. This local HTTP CONNECT proxy
 * races up to BATCH upstreams per request, first tunnel wins, and puts dead
 * ones on a cooldown, so the page load survives a line dying underneath it.
 * Egress stays proxy-only — there is no direct fallback.
 *
 * Usage: node src/relay.js [port] [listFile]
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const { parseProxyText, openTunnel } = require('./proxy.js');

const PORT = parseInt(process.argv[2] || '18130', 10);
const LIST = process.argv[3] || path.join(__dirname, 'out', 'relay-candidates.txt');
const OUT_WARM = path.join(__dirname, 'out', 'relay-warm.txt');
const CONNECT_TIMEOUT_MS = 8000;
const BUDGET_MS = 25000;
const BATCH = 3;

const list = parseProxyText(fs.readFileSync(LIST, 'utf8'));
if (!list.length) throw new Error(`no proxies in ${LIST}`);
const state = list.map((p) => ({ p, cooldownUntil: 0, fails: 0, oks: 0 }));
let cursor = 0;

function candidates() {
  const now = Date.now();
  const warm = [];
  const cold = [];
  let i = 0;
  for (const s of state) {
    const idx = i++;
    if (s.cooldownUntil > now) continue;
    if (s.oks > 0) warm.push(idx);
    else cold.push(idx);
  }
  warm.sort((a, b) => state[b].oks - state[a].oks);
  const ordered = [cursor, ...warm, ...cold].filter((v, i, arr) => arr.indexOf(v) === i && state[v] && state[v].cooldownUntil <= now);
  return ordered;
}

function note(idx, ok) {
  const s = state[idx];
  if (ok) {
    s.oks++;
    s.fails = 0;
    cursor = idx;
    writeWarm();
  } else {
    s.fails++;
    s.oks = Math.max(0, s.oks - 1);
    s.cooldownUntil = Date.now() + (s.fails >= 3 ? 600000 : 90000);
  }
}

let warmWrittenAt = 0;
function writeWarm() {
  if (Date.now() - warmWrittenAt < 5000) return;
  warmWrittenAt = Date.now();
  const warm = state.filter((s) => s.oks > 0 && s.cooldownUntil <= Date.now()).map((s) => s.p.raw);
  try {
    fs.writeFileSync(OUT_WARM, warm.join('\n') + (warm.length ? '\n' : ''));
  } catch (e) {}
}

async function raceTunnel(host, port) {
  const deadline = Date.now() + BUDGET_MS;
  const tried = new Set();
  let lastErr = null;
  while (Date.now() < deadline) {
    const order = candidates().filter((i) => !tried.has(i));
    if (!order.length) break;
    const batch = order.slice(0, BATCH);
    batch.forEach((i) => tried.add(i));
    const attempts = batch.map((i) =>
      openTunnel(state[i].p, { host, port, timeoutMs: CONNECT_TIMEOUT_MS }).then(
        (sock) => ({ idx: i, sock }),
        (err) => {
          note(i, false);
          throw err;
        }
      )
    );
    try {
      const winner = await Promise.any(attempts);
      attempts.forEach((p) =>
        p
          .then((r) => {
            if (r.sock !== winner.sock) r.sock.destroy();
          })
          .catch(() => {})
      );
      note(winner.idx, true);
      return { sock: winner.sock, proxy: state[winner.idx].p };
    } catch (e) {
      lastErr = e instanceof AggregateError ? e.errors[e.errors.length - 1] : e;
    }
  }
  throw lastErr || new Error('all upstreams failed');
}

const server = net.createServer((client) => {
  client.once('error', () => {});
  let buf = Buffer.alloc(0);
  const onData = (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const end = buf.indexOf('\r\n\r\n');
    if (end === -1) return;
    client.removeListener('data', onData);
    const head = buf.slice(0, end).toString('latin1');
    const line = head.split('\r\n')[0];
    const m = /^CONNECT ([^\s:]+):(\d+)/i.exec(line);
    if (!m) {
      client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
      return;
    }
    raceTunnel(m[1], parseInt(m[2], 10))
      .then(({ sock }) => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const rest = buf.slice(end + 4);
        if (rest.length) sock.write(rest);
        client.pipe(sock);
        sock.pipe(client);
        sock.on('error', () => client.destroy());
        client.on('close', () => sock.destroy());
      })
      .catch(() => {
        try {
          client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        } catch (e) {}
      });
  };
  client.on('data', onData);
});

setInterval(() => {
  const warm = state.filter((s) => s.oks > 0 && s.cooldownUntil <= Date.now()).length;
  console.log(`relay ${new Date().toISOString().slice(11, 19)} warm=${warm}/${state.length}`);
  writeWarm();
}, 30000).unref();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`relay on 127.0.0.1:${PORT} · ${list.length} upstreams · batch ${BATCH} · proxy-only`);
});
