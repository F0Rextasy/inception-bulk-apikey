'use strict';

/**
 * Split-egress relay for the Inception browser bursts.
 *
 * Two measured facts drive it:
 *   1. the free exits can reach the Vercel-hosted console but usually CANNOT
 *      reach challenges.cloudflare.com (net::ERR_TIMED_OUT measured), so the
 *      Turnstile widget never solves and the sign-up POST has no token;
 *   2. Cloudflare's own WARP egress (socks5://127.0.0.1:40000) reaches
 *      challenges.cloudflare.com fine, but a single shared WARP exit is not
 *      where account traffic should live.
 *
 * So Chrome talks to this relay only, and the relay picks the upstream per
 * destination: `*.cloudflare.com` → WARP, everything else → a raced free exit.
 * Nothing ever leaves through the host's own line.
 *
 * Usage: node src/split-relay.js [port] [listFile]
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const { parseProxyText, openTunnel } = require('./proxy.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2] || '18140', 10);
const LIST = process.argv[3] || path.join(ROOT, 'out', 'relay-candidates.txt');
const LOG = path.join(ROOT, 'out', 'split-relay.log');
const CONNECT_TIMEOUT_MS = 8000;
const BUDGET_MS = 25000;
const BATCH = 3;

const WARP = { protocol: 'socks5', host: '127.0.0.1', port: 40000, raw: 'socks5://127.0.0.1:40000' };
const CF_HOST = /(^|\.)cloudflare\.com$/i;
const PROBE_HOST = 'platform.inceptionlabs.ai';

let list = parseProxyText(fs.readFileSync(LIST, 'utf8'));
if (!list.length) throw new Error(`no proxies in ${LIST}`);
const state = list.map((p) => ({ p, cooldownUntil: 0, fails: 0, oks: 0 }));
let cursor = 0;

/**
 * The pool churns: dead lines are replaced by new ones every few minutes, and a
 * relay that reads its list once starts cold in a way no amount of racing
 * fixes (measured by a sibling: 112 startup-time upstreams, ~95 % dead → every
 * CONNECT lost). So the list is re-read, and entries are *probed* warm.
 */
function reloadList() {
  let added = 0;
  for (const p of parseProxyText(fs.readFileSync(LIST, 'utf8'))) {
    const raw = p.raw || `${p.protocol}://${p.host}:${p.port}`;
    if (state.some((s) => (s.p.raw || `${s.p.protocol}://${s.p.host}:${s.p.port}`) === raw)) continue;
    state.push({ p, cooldownUntil: 0, fails: 0, oks: 0 });
    added++;
  }
  return added;
}

/** Probes cold upstreams against the console host and marks the responders. */
async function warmUp(limit = 40, conc = 6) {
  const cold = state.filter((s) => s.oks === 0 && s.cooldownUntil <= Date.now()).slice(0, limit);
  if (!cold.length) return 0;
  let i = 0;
  let warm = 0;
  const worker = async () => {
    for (;;) {
      const s = cold[i++];
      if (!s) return;
      try {
        const sock = await openTunnel(s.p, { host: PROBE_HOST, port: 443, timeoutMs: 7000 });
        // A tunnel is not enough — the line must answer a real TLS request.
        const tls = require('tls').connect({ socket: sock, servername: PROBE_HOST });
        await new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('tls timeout')), 10000);
          tls.once('secureConnect', () => {
            clearTimeout(t);
            res();
          });
          tls.once('error', rej);
        });
        tls.destroy();
        s.oks = 1;
        warm++;
      } catch {
        s.cooldownUntil = Date.now() + 60000;
      }
    }
  };
  await Promise.all(new Array(conc).fill(0).map(worker));
  return warm;
}

function logLine(msg) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG, line + '\n');
  } catch {}
}

function candidates() {
  const now = Date.now();
  const warm = [];
  const cold = [];
  state.forEach((s, idx) => {
    if (s.cooldownUntil > now) return;
    (s.oks > 0 ? warm : cold).push(idx);
  });
  warm.sort((a, b) => state[b].oks - state[a].oks);
  return [cursor, ...warm, ...cold].filter((v, i, arr) => arr.indexOf(v) === i && state[v] && state[v].cooldownUntil <= now);
}

function note(idx, ok) {
  const s = state[idx];
  if (ok) {
    s.oks++;
    s.fails = 0;
    cursor = idx;
  } else {
    s.fails++;
    s.oks = Math.max(0, s.oks - 1);
    s.cooldownUntil = Date.now() + (s.fails >= 3 ? 600000 : 90000);
  }
}

async function raceFreeExit(host, port) {
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
      return { sock: winner.sock, via: state[winner.idx].p.raw };
    } catch (e) {
      lastErr = e instanceof AggregateError ? e.errors[e.errors.length - 1] : e;
    }
  }
  throw lastErr || new Error('all upstreams failed');
}

async function upstream(host, port) {
  if (CF_HOST.test(host)) {
    const sock = await openTunnel(WARP, { host, port, timeoutMs: CONNECT_TIMEOUT_MS });
    return { sock, via: 'warp' };
  }
  return raceFreeExit(host, port);
}

const stats = {};
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
    const host = m[1];
    const t0 = Date.now();
    const bucket = (stats[host] = stats[host] || { ok: 0, fail: 0 });
    upstream(host, parseInt(m[2], 10))
      .then(({ sock, via }) => {
        bucket.ok++;
        logLine(`CONNECT ${host} OK via ${via === 'warp' ? 'warp' : via.slice(0, 40)} ${Date.now() - t0}ms`);
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const rest = buf.slice(end + 4);
        if (rest.length) sock.write(rest);
        client.pipe(sock);
        sock.pipe(client);
        sock.on('error', () => client.destroy());
        client.on('close', () => sock.destroy());
      })
      .catch((e) => {
        bucket.fail++;
        logLine(`CONNECT ${host} FAIL ${String((e && e.message) || e).slice(0, 70)} ${Date.now() - t0}ms`);
        try {
          client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        } catch {}
      });
  };
  client.on('data', onData);
});

setInterval(() => {
  const warm = state.filter((s) => s.oks > 0 && s.cooldownUntil <= Date.now()).length;
  const hosts = Object.entries(stats)
    .map(([h, v]) => `${h.split('.')[0]}:${v.ok}/${v.ok + v.fail}`)
    .slice(0, 6)
    .join(' ');
  logLine(`relay warm=${warm}/${state.length} ${hosts}`);
}, 30000).unref();

setInterval(async () => {
  const added = reloadList();
  const warm = await warmUp(30, 6);
  if (added || warm) logLine(`refresh: +${added} candidates, ${warm} warmed (${state.length} total)`);
}, 120000).unref();

server.listen(PORT, '127.0.0.1', async () => {
  logLine(`split relay on 127.0.0.1:${PORT} · ${list.length} upstreams · cloudflare.com -> warp · else raced exits`);
  const warm = await warmUp(60, 6);
  logLine(`warm-up: ${warm} upstreams answer ${PROBE_HOST}:443 (${state.length} total)`);
});
