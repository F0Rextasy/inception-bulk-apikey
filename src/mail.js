'use strict';

/**
 * Mailbox access through the local broker (127.0.0.1:9700 Mailtrap /
 * 127.0.0.1:9701 inboxes.com). The broker owns the upstream credentials and
 * its own proxy chain; from here it is plain loopback HTTP, so no exit is
 * spent on mail.
 *
 *   POST /create                     -> { address, token }
 *   GET  /list?token=<token>         -> [ { id, subject, from, … } ]
 *   GET  /read?token=<token>&id=<id> -> { subject, text, html, … }
 */

const http = require('http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function brokerRequest(base, path, { method = 'GET', body = null, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(
      {
        method,
        host: '127.0.0.1',
        port: parseInt(base.split(':')[2], 10),
        path,
        headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {},
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`broker timeout ${path}`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

class Mailbox {
  constructor(base, address, token, label = '') {
    this.base = base;
    this.address = address;
    this.token = token;
    this.label = label;
    this.createdAt = Date.now();
  }

  async list() {
    const r = await brokerRequest(this.base, `/list?token=${encodeURIComponent(this.token)}`);
    if (Array.isArray(r.json)) return r.json;
    const j = r.json || {};
    return j.messages || j.data || j.messageList || j.msgs || [];
  }

  async read(id) {
    const r = await brokerRequest(this.base, `/read?id=${encodeURIComponent(id)}&token=${encodeURIComponent(this.token)}`);
    return r.json || { text: r.text };
  }

  /** Full text of every message received after `since`: subject + text + html. */
  async digest(since = 0) {
    const msgs = await this.list().catch(() => []);
    const parts = [];
    for (const m of msgs) {
      const ts = Date.parse(m.created_at || m.date || m.receivedAt || 0) || 0;
      if (since && ts && ts < since - 120000) continue;
      const full = await this.read(m.id).catch(() => null);
      parts.push({
        id: m.id,
        subject: String(m.subject || (full && full.subject) || ''),
        from: String(m.from || (full && full.from) || ''),
        at: ts,
        text: `${(full && full.subject) || m.subject || ''}\n${(full && full.text) || ''}\n${(full && full.html) || ''}`,
      });
    }
    return parts;
  }
}

/** Creates an inbox on the given broker; retries because the broker's chain flaps. */
async function createInbox(base = 'http://127.0.0.1:9700', { attempts = 5, label = '', timeoutMs = 120000, folder = 'inception-bulk' } = {}) {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      // Per-caller folder: our mail never shares a folder
      // with another provider, so no sweep can ever touch it and vice versa.
      const r = await brokerRequest(base, '/create', { method: 'POST', body: folder ? { folder } : {}, timeoutMs });
      const j = r.json;
      if (j && j.address && j.token && j.token !== 'undefined') return new Mailbox(base, j.address, j.token, label);
      last = `status=${r.status} body=${r.text.slice(0, 140)}`;
    } catch (e) {
      last = String(e.message || e);
    }
    await sleep(1500 + i * 1200);
  }
  throw new Error(`broker ${base} create failed: ${last}`);
}

/** Polls until `pick(list)` returns a value (verify link / code / any mail). */
async function waitForMail(box, pick, { timeoutMs = 240000, pollMs = 5000, log } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastNote = 'no messages yet';
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    try {
      const msgs = await box.digest(Date.now() - timeoutMs - 60000);
      if (msgs.length) lastNote = `${msgs.length} msg(s): ${msgs.map((m) => m.subject.slice(0, 50)).join(' | ').slice(0, 120)}`;
      const hit = pick(msgs);
      if (hit) return { hit, msgs };
    } catch (e) {
      lastNote = `poll error ${String(e.message || e).slice(0, 80)}`;
    }
    if (log && polls % 4 === 0) log(`mailbox ${box.address}: ${lastNote}`);
    await sleep(pollMs);
  }
  return { error: `no mail in ${Math.round(timeoutMs / 1000)}s (last: ${lastNote})` };
}

const LINK_RE = /https?:\/\/[^\s"'<>\\]+/g;

/** Any link that looks like an account-confirmation link (direct host first). */
function pickVerifyLink(msgs, hostPattern = /inceptionlabs\.ai/) {
  const scored = [];
  for (const m of msgs) {
    const urls = [...String(m.text).matchAll(LINK_RE)].map((x) => x[0].replace(/&amp;/g, '&').replace(/[.,);'"]+$/, ''));
    for (const u of urls) {
      if (!hostPattern.test(u)) continue;
      let host = '';
      try {
        host = new URL(u).hostname;
      } catch {}
      const direct = hostPattern.test(host) && /(verify|confirm|token|auth|activate|callback)/i.test(u);
      if (direct) scored.push({ u, score: 0 });
      else if (hostPattern.test(host)) scored.push({ u, score: 2 });
      else scored.push({ u, score: 1 }); // tracker/redirector that carries the real URL
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.length ? scored[0].u : null;
}

/** 6-digit (or 4–8 digit) code from a mail body. */
function pickCode(msgs, re = /\b(\d{6})\b/) {
  for (const m of msgs) {
    const text = String(m.text).replace(/<[^>]+>/g, ' ');
    const near = /(?:code|verification|verify|otp)\D{0,40}(\d{4,8})/i.exec(text);
    if (near) return near[1];
    const any = re.exec(text);
    if (any) return any[1];
  }
  return null;
}

module.exports = { Mailbox, createInbox, waitForMail, pickVerifyLink, pickCode, brokerRequest, sleep };
