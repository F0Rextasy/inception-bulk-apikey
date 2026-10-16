'use strict';

/**
 * Exit supply for the browser steps.
 *
 * Measured on this host: the free pool's half-life against
 * platform.inceptionlabs.ai is 1-3 minutes and a 5x/5min stability screen
 * leaves 0 survivors, so nothing can be pinned for a whole phase. Instead every
 * browser step is short (checkpoint + form ≈ 20-40 s) and takes a fresh exit
 * that has *just* been probed at the point of use; dead lines cost one 20 s
 * probe, never a phase.
 *
 * State (probes, burns, per-exit outcomes) is persisted so a restart keeps the
 * knowledge and does not re-probe known corpses.
 */

const fs = require('fs');
const path = require('path');
const { ROOT, request, ensureOut, proxyLib } = require('./lib');

const OUT = ensureOut();
const STATE_FILE = path.join(OUT, 'exit-state.json');
// The purchased private-proxy class takes precedence for the
// reputation-gated register phase the moment the list file exists; the free
// reachers stay as the fallback tail. `token-capable` first is unchanged.
const RES_FILES = [
  process.env.RESIDENTIAL_PROXIES,
  path.join(OUT, 'residential-proxies.txt'),
].filter((f) => f && fs.existsSync(f));
const POOL_FILES = [
  path.join(ROOT, 'proxies.txt'),
  ...RES_FILES,
  path.join(OUT, 'token-capable.txt'), // exits where the Turnstile widget actually solved (rarest, best)
  path.join(OUT, 'platform-429.txt'), // router-injected reachers + own screen hits
  path.join(OUT, 'platform-reach.txt'), // re-sweeps of the union (any 2xx-4xx status)
  path.join(OUT, 'warm-platform.txt'), // stability survivors, appended when they exist
  path.join(OUT, 'api-live.txt'),
  path.join(OUT, 'relay-warm.txt'),
];

const PROBE_URL = 'https://platform.inceptionlabs.ai/auth/register';
const CF_PROBE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { exits: {}, updated: 0 };
  }
}

function saveState(state) {
  state.updated = Date.now();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {}
}

function readPool() {
  const seen = new Set();
  const out = [];
  for (const f of POOL_FILES) {
    if (!fs.existsSync(f)) continue;
    for (let line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.includes('\t')) {
        const cand = line.split('\t').find((x) => /^(https?|socks[45]):\/\//.test(x));
        if (!cand) continue;
        line = cand;
      }
      if (!/^(https?|socks[45]):\/\//.test(line)) continue;
      const p = proxyLib.parseProxy(line);
      if (!p || proxyLib.isLocalHost(p.host)) continue;
      const key = proxyLib.label(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

class ExitSupply {
  constructor({ files = POOL_FILES, probeTimeoutMs = 20000, requireCf = true } = {}) {
    this.requireCf = requireCf;
    this.files = files;
    this.probeTimeoutMs = probeTimeoutMs;
    this.state = loadState();
    this.pool = [];
    this.reload();
  }

  reload() {
    const files = this.files.filter((f) => fs.existsSync(f));
    const seen = new Set();
    const out = [];
    for (const f of files) {
      for (let line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.includes('\t')) {
          const cand = line.split('\t').find((x) => /^(https?|socks[45]):\/\//.test(x));
          if (!cand) continue;
          line = cand;
        }
        if (!/^(https?|socks[45]):\/\//.test(line)) continue;
        const p = proxyLib.parseProxy(line);
        if (!p || proxyLib.isLocalHost(p.host)) continue;
        const key = proxyLib.label(p);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    }
    this.pool = out;
    return out.length;
  }

  rec(label) {
    if (!this.state.exits[label]) this.state.exits[label] = { probes: 0, ok: 0, burns: 0, last: 0, outcomes: {} };
    return this.state.exits[label];
  }

  /** Marks an exit as recently good; `outcome` is free-form (form-ok, key-ok, …). */
  note(proxy, { ok, note } = {}) {
    const r = this.rec(proxyLib.label(proxy));
    r.probes++;
    r.last = Date.now();
    if (ok === true) r.ok++;
    if (ok === false) r.burns++;
    if (note) r.outcomes[note] = (r.outcomes[note] || 0) + 1;
    saveState(this.state);
  }

  save() {
    saveState(this.state);
  }

  /** Orders candidates: never-probed and recently-ok first, corpses last. */
  candidates({ exclude = new Set() } = {}) {
    const now = Date.now();
    return this.pool
      .filter((p) => !exclude.has(proxyLib.label(p)))
      .map((p) => {
        const r = this.rec(proxyLib.label(p));
        const staleOk = r.ok > 0 && now - r.last < 5 * 60 * 1000;
        const dead = r.burns >= 3 && r.ok === 0;
        return { p, score: (dead ? 1000 : 0) + (staleOk ? -100 : 0) + r.burns * 10 - r.ok, r };
      })
      .sort((a, b) => a.score - b.score)
      .map((x) => x.p);
  }

  /** Probes until an exit answers the platform host; returns { proxy, status, ms }. */
  async probeOne(proxy, url = PROBE_URL) {
    const t0 = Date.now();
    try {
      const r = await request(proxy, url, { timeoutMs: this.probeTimeoutMs, connectTimeoutMs: 8000 });
      const ok = r.status >= 200 && r.status < 500;
      if (!ok) {
        this.note(proxy, { ok: false, note: `probe-${r.status}` });
        return null;
      }
      // Sign-up needs Cloudflare's Turnstile widget too, and most exits that
      // reach Vercel cannot reach challenges.cloudflare.com at all (measured
      // net::ERR_TIMED_OUT) — without the widget there is no token, and without
      // the token the register POST is rejected. Both legs or nothing.
      if (this.requireCf) {
        const cf = await request(proxy, CF_PROBE_URL, { timeoutMs: Math.min(this.probeTimeoutMs, 15000), connectTimeoutMs: 6000 }).catch(() => null);
        if (!cf || !(cf.status === 200 || cf.status === 302 || cf.status === 301)) {
          this.note(proxy, { ok: false, note: `probe-cf-${cf ? cf.status : 'err'}` });
          return null;
        }
        this.note(proxy, { ok: true, note: `probe-${r.status}+cf` });
        return { proxy, status: r.status, cf: cf.status, ms: Date.now() - t0 };
      }
      this.note(proxy, { ok: true, note: `probe-${r.status}` });
      return { proxy, status: r.status, ms: Date.now() - t0 };
    } catch (e) {
      this.note(proxy, { ok: false, note: 'probe-err' });
      return null;
    }
  }

  /**
   * Finds up to `need` exits that answer right now, probing `maxProbe` candidates.
   * The pool is re-read on every call so router-injected lines are picked up.
   */
  async acquire(need = 1, { maxProbe = 12, exclude = new Set(), conc = 6 } = {}) {
    this.reload();
    const cands = this.candidates({ exclude }).slice(0, maxProbe);
    const found = [];
    let i = 0;
    const workers = new Array(Math.min(conc, cands.length)).fill(0).map(async () => {
      while (found.length < need && i < cands.length) {
        const p = cands[i++];
        const hit = await this.probeOne(p);
        if (hit) found.push(hit);
      }
    });
    await Promise.all(workers);
    return found;
  }
}

module.exports = { ExitSupply, readPool, PROBE_URL, CF_PROBE_URL };
