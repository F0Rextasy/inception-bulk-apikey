'use strict';

/**
 * Inception Labs minter — N accounts x 1 API key.
 *
 *   node src/mint.js --count 30 [--workers 3] [--start 0] [--broker 9700]
 *
 * Measured flow (2026-10-14):
 *   register  : browser burst on a fresh exit — Vercel Security Checkpoint
 *               (~5-20 s) must clear, then the form's Turnstile solves itself;
 *               POST /api/auth/register {name,email,password,cf-turnstile-response}
 *               answers "If this email is not already registered…" and the app
 *               moves to /thank-you.
 *   mail      : "Verify your email address" from noreply@inceptionlabs.ai
 *               carries https://platform.inceptionlabs.ai//auth/verify?token=…
 *   finish    : browser burst on a fresh exit — open the verify link, sign in
 *               (email+password), then /dashboard/api-keys → Create API Key.
 *
 * A burst is deliberately short: the free-exit half-life against this host is
 * 1-3 minutes and a 5x/5min stability screen leaves zero survivors, so exits are
 * probed at the point of use and dropped — never pinned across the mail wait.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const B = require('./browser');
const mail = require('./mail');
const { ExitSupply } = require('./exits');
const { ROOT, ensureOut, proxyLib, sleep, request, mapLimit } = require('./lib');
const fp = require('./fp');
const { presetArgv, resolvePreset } = require('./preset');

const OUT = ensureOut();
const KEYS_FILE = path.join(ROOT, 'keys.txt');
const MIRROR_FILE = path.join(os.homedir(), 'inception-keys.txt');
const ACCOUNTS_FILE = path.join(ROOT, 'accounts.json');
const STATE_FILE = path.join(OUT, 'mint-state.json');
const LOG_FILE = path.join(OUT, 'mint.log');

const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

const COUNT = parseInt(arg('--count', '30'), 10);
// Run shape (operator standard v3): `--preset` sets how many accounts run at a
// time and the pause between them; an explicit --workers/--conc/--gap wins, and
// with no --preset the run keeps its measured 3 workers (cap 4: one Chrome).
const eqArg = (n) => {
  const h = argv.find((a) => a.startsWith(`${n}=`));
  return h ? h.slice(n.length + 1) : null;
};
const SHAPE = resolvePreset({
  preset: presetArgv(argv) || arg('--preset', null),
  conc: arg('--conc', null) || eqArg('--conc'),
  gap: arg('--gap', null) || eqArg('--gap'),
  defaultConc: 3,
  defaultGap: 0,
});
const WORKERS = Math.max(1, Math.min(parseInt(arg('--workers', String(SHAPE.conc)), 10), 4));
const GAP_MS = Math.max(0, Math.round((SHAPE.gap == null ? 0 : SHAPE.gap) * 1000));
// Headless stays opt-in: this flow was measured headed (Vercel checkpoint +
// self-solving Turnstile). `--headless` (or SD_HEADLESS=1) switches the bursts
// over, and every context still carries its own UA/viewport/timezone/locale.
const HEADLESS = !process.argv.includes('--headed') && (process.argv.includes('--headless') || /^(1|true|yes)$/i.test(process.env.SD_HEADLESS || ''));
const START = parseInt(arg('--start', '0'), 10);
const PORT = parseInt(arg('--port', '9930'), 10);
const PROFILE_DIR = path.join(OUT, `chrome-${PORT}`);
const BROKER = `http://127.0.0.1:${arg('--broker', '9700')}`;
const FALLBACK_BROKER = `http://127.0.0.1:${arg('--fallback-broker', '9701')}`;
const MAIL_WAIT = parseInt(arg('--mail-wait', '300000'), 10);
const MAIL_WAIT_SHORT = parseInt(arg('--mail-wait-short', '45000'), 10); // register phase: only catches mail that is already fast
const PENDING_TOTAL = parseInt(arg('--pending-total', '2400000'), 10); // after this a pending account is written off (verify link lives 24 h)
const BURST_WAIT = parseInt(arg('--burst-wait', '75000'), 10);
const API_MODEL = arg('--model', 'mercury-2.5');
const STOP_KEYS = parseInt(arg('--stop-keys', '0'), 10); // batch ends once keys.txt holds this many keys (0 = run the whole count)
const FIXED_EXIT = arg('--exit-relay', null); // e.g. http://127.0.0.1:18140 (split relay)
const API_FILE = path.join(OUT, 'api-live.txt');

fs.mkdirSync(OUT, { recursive: true });

function log(...a) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}
process.on('unhandledRejection', (e) => log(`FATAL unhandledRejection: ${(e && e.stack) || e}`));
process.on('uncaughtException', (e) => log(`FATAL uncaughtException: ${(e && e.stack) || e}`));

// ---------------------------------------------------------------- state

function readJson(file, dflt) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return dflt;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 1));
}

function readKeys() {
  try {
    return fs
      .readFileSync(KEYS_FILE, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function recordKey(key) {
  const keys = readKeys();
  if (keys.includes(key)) return keys.length;
  keys.push(key);
  fs.writeFileSync(KEYS_FILE, keys.join('\n') + '\n');
  try {
    fs.writeFileSync(MIRROR_FILE, keys.join('\n') + '\n');
  } catch {}
  return keys.length;
}

function readAccounts() {
  return readJson(ACCOUNTS_FILE, []);
}

function recordAccount(acc) {
  const all = readAccounts();
  all.push(acc);
  writeJson(ACCOUNTS_FILE, all);
}

let state = readJson(STATE_FILE, { done: 0, startedAt: Date.now(), accounts: {} });
function saveState() {
  writeJson(STATE_FILE, state);
}

// ---------------------------------------------------------------- identity

const NAMES = [
  'Alex Morgan', 'Sam Rivera', 'Jordan Blake', 'Casey Quinn', 'Robin Vega', 'Devon Hale',
  'Riley Chen', 'Morgan Diaz', 'Avery Blake', 'Quinn Harper', 'Rowan Ellis', 'Skyler Nash',
  'Reese Calder', 'Elliot Vance', 'Marlowe Reed', 'Tatum Brooks', 'River Sutton', 'Phoenix Wade',
];
const FIRST = ['Alex', 'Sam', 'Jordan', 'Casey', 'Robin', 'Devon', 'Riley', 'Morgan', 'Avery', 'Quinn', 'Rowan', 'Skyler'];

function identity() {
  const name = NAMES[crypto.randomInt(0, NAMES.length)];
  const password = `${FIRST[crypto.randomInt(0, FIRST.length)]}${crypto.randomInt(100, 9999)}!${crypto.randomBytes(2).toString('hex')}`;
  return { name, password };
}

// ---------------------------------------------------------------- browser bursts

/** A hung CDP call must not eat the whole run: every step gets a hard ceiling. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

/**
 * Exits that pass BOTH probes are ~2.5 % of candidates, so throwing one away
 * after a single burst wastes the scarcest resource in the run. A proven exit
 * is therefore re-probed and reused for up to `REUSE_MAX` accounts (fresh
 * context and fresh mailbox each time); the exit is dropped the moment a burst
 * fails. This is a deliberate, documented trade-off against the toolchain’s
 * one-account-per-exit default.
 */
const REUSE_MAX = parseInt(process.env.INCEPTION_REUSE_MAX || '3', 10);
const recentGood = [];

// Every Chrome context of a run gets its own combination (spec §3): one run-wide
// sequence keeps the first 256 contexts distinct, `SD_UA`/`SD_UA_POOL` pin it.
let fpSeq = 0;
const nextFingerprint = () => fp.forIndex(++fpSeq);

async function freshContext(supply, cdp, { exclude, rounds = 3 } = {}) {
  const fingerprint = nextFingerprint();
  if (FIXED_EXIT) {
    const pinned = proxyLib.parseProxy(FIXED_EXIT);
    if (pinned) {
      const info = await B.openContext(cdp, pinned, { fingerprint });
      info.exit = { proxy: pinned, status: 'relay', ms: 0 };
      return info;
    }
  }
  // Reuse a proven line first (re-probed so a dead one costs seconds, not a burst).
  for (let i = recentGood.length - 1; i >= 0; i--) {
    const entry = recentGood[i];
    if (entry.uses >= REUSE_MAX || (exclude && exclude.has(proxyLib.label(entry.proxy)))) {
      recentGood.splice(i, 1);
      continue;
    }
    const hit = await supply.probeOne(entry.proxy);
    if (!hit) {
      recentGood.splice(i, 1);
      continue;
    }
    entry.uses++;
    const info = await B.openContext(cdp, entry.proxy, { fingerprint });
    info.exit = { ...hit, reused: entry.uses };
    return info;
  }
  for (let i = 1; i <= rounds; i++) {
    const [hit] = await supply.acquire(1, { maxProbe: 40, exclude });
    if (hit) {
      const info = await B.openContext(cdp, hit.proxy, { fingerprint });
      info.exit = hit;
      return info;
    }
    await sleep(1500);
  }
  return null;
}

/** Records an exit as proven-good so the next account can reuse it. */
function rememberExit(proxy) {
  if (!proxy) return;
  const label = proxyLib.label(proxy);
  if (recentGood.some((e) => proxyLib.label(e.proxy) === label)) return;
  recentGood.unshift({ proxy, uses: 1 });
}

/**
 * Length of the Turnstile token the app will actually submit. Measured on the
 * real page: `react-turnstile` renders with a callback and never writes the
 * hidden `cf-turnstile-response` input — the input stays empty while
 * `window.turnstile.getResponse()` returns a 700+ char token. Watching the
 * input (the old check) reported "no token" even when the widget had solved.
 */
const TURNSTILE_LEN = `(() => { try { const el = document.querySelector('[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]'); const inLen = el && el.value ? el.value.length : 0; let r = 0; if (window.turnstile && window.turnstile.getResponse) { try { r = String(window.turnstile.getResponse() || '').length; } catch (e) {} } return Math.max(inLen, r); } catch (e) { return 0; } })()`;

/** One register attempt: checkpoint -> form -> submit -> /thank-you. */
async function registerBurst(supply, cdp, acc, slot, { keepContext = false } = {}) {
  const tag = `s${slot}/reg`;
  const ctxInfo = await freshContext(supply, cdp);
  if (!ctxInfo) return { status: 'no-exit' };
  const { page, net } = ctxInfo;
  const proxy = ctxInfo.exit.proxy;
  let kept = false;
  try {
    log(`${tag}: exit ${proxyLib.label(proxy)} probe=${ctxInfo.exit.status} ${ctxInfo.exit.ms}ms`);
    const t0 = Date.now();
    await page.goto('https://platform.inceptionlabs.ai/auth/register');
    const ready = await page.waitFor(`!!document.querySelector('#email')`, { timeoutMs: BURST_WAIT, pollMs: 800 });
    if (!ready) {
      const body = (await page.body()).replace(/\s+/g, ' ').slice(0, 160);
      const netErr = /not private|ERR_CERT|ERR_SSL|can.t be reached|No internet|proxy server|DNS/i.test(body);
      supply.note(proxy, { ok: false, note: netErr ? 'burst-net-error' : /verifying your browser/i.test(body) ? 'burst-timeout-challenge' : 'burst-timeout-form' });
      return { status: netErr ? 'net-error' : 'no-form', note: body };
    }
    log(`${tag}: form in ${Math.round((Date.now() - t0) / 1000)}s`);

    // Turnstile renders itself; the app consumes the token via its callback and
    // never writes the hidden input, so the readiness signal is getResponse().
    await page.waitFor(`!!document.querySelector('[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]')`, { timeoutMs: 25000, pollMs: 800 }).catch(() => null);
    let token2 = (await page.waitFor(TURNSTILE_LEN, { timeoutMs: 45000, pollMs: 1000 })) || 0;
    if (token2 < 20) {
      await page.pokeTurnstile().catch(() => {});
      await sleep(3000);
      token2 = (await page.waitFor(TURNSTILE_LEN, { timeoutMs: 20000, pollMs: 1000 })) || 0;
    }
    if (token2 < 20) {
      // No token after ~70 s of watching: on a pool exit this will never come
      // and typing the form just burns the exit's remaining lifetime (measured:
      // attempts were eating the full 200 s burst ceiling as register-hang).
      supply.note(proxy, { ok: false, note: 'no-turnstile-token-early' });
      return { status: 'no-token', note: `turnstile token never appeared after ${Math.round((Date.now() - t0) / 1000)}s` };
    }
    log(`${tag}: turnstile token len=${token2} — filling`);
    await page.type('#name', acc.name);
    await page.type('#email', acc.email);
    await page.eval(
      `(() => { const s = document.querySelector('#hearAboutUs'); if (s && s.options.length > 2) { s.selectedIndex = 1 + ${crypto.randomInt(0, 3)}; s.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`
    );
    await page.type('#password', acc.password);
    await page.type('#confirmPassword', acc.password);
    const checked = await page.eval(`(() => { const c = document.querySelector('input[name=acceptTerms]'); return c ? c.checked : null; })()`);
    if (checked === false) {
      const ok = await page.click(`document.querySelector('input[name=acceptTerms]')`);
      if (!ok) await page.eval(`(() => { const c = document.querySelector('input[name=acceptTerms]'); if (c) c.click(); return true; })()`);
    }
    await sleep(300);
    // The managed widget can re-run (and blank) its token while the form is
    // typed; submitting without one costs a mailbox — the platform answers
    // 400 {"message":"Required"}. So the submit is gated on the token.
    let preSubmit = (await page.eval(TURNSTILE_LEN).catch(() => 0)) || 0;
    if (preSubmit < 20) preSubmit = (await page.waitFor(TURNSTILE_LEN, { timeoutMs: 25000, pollMs: 1000 })) || 0;
    if (preSubmit < 20) {
      supply.note(proxy, { ok: false, note: 'no-turnstile-token' });
      return { status: 'no-token', note: 'turnstile never produced a token' };
    }
    log(`${tag}: pre-submit token len=${preSubmit}`);
    const before = net.reqs.length;
    log(`${tag}: submitting`);
    await page.click(`[...document.querySelectorAll('button')].find(b => /create account/i.test(b.innerText || ''))`);

    let outcome = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const info = await page
        .eval(`(() => ({ url: location.href, text: (document.body?document.body.innerText:'').replace(/\\s+/g,' ') }))()`)
        .catch(() => null);
      const post = net.reqs.slice(before).find((r) => /\/api\/auth\/register/.test(r.url) && r.status);
      if (post && post.status >= 400) {
        outcome = { status: 'register-error', note: `${post.status} ${String(post.body || '').slice(0, 200)}` };
        break;
      }
      if (info && /thank-you/.test(info.url)) {
        outcome = { status: 'registered', note: String((net.reqs.slice(before).find((r) => /register/.test(r.url)) || {}).body || '').slice(0, 160) };
        break;
      }
      if (info && /already registered|error|invalid/i.test(info.text) && /register/i.test(info.url)) {
        outcome = { status: 'register-inline-error', note: info.text.slice(0, 160) };
        break;
      }
      await sleep(1200);
    }
    if (!outcome) {
      // A timeout is ambiguous: the POST may have answered 200 (mail sent,
      // account created) while the client never navigated (measured on WARP at
      // 19:33Z — the pilot's identical flow navigated at 18:32Z). Log what the
      // wire actually shows so the run is diagnosable, and let runAccount queue
      // the account as pending-mail: the mailbox is the ground truth.
      const posts = net.reqs.slice(before).filter((r) => /\/api\/auth\/register/.test(r.url));
      log(`${tag}: register-timeout wire: ${posts.map((r) => `${r.status || 'pending'} ${String(r.body || r.failed || '').slice(0, 120)}`).join(' | ') || '(no register POST seen)'}`);
    }
    const cookies = (await page.cookies()).cookies.filter((c) => /inceptionlabs\.ai$/.test(c.domain)).map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires }));
    supply.note(proxy, { ok: outcome && outcome.status === 'registered', note: outcome ? outcome.status : 'register-unknown' });
    const res = { status: outcome ? outcome.status : 'register-timeout', note: outcome ? outcome.note : await page.url(), cookies, exit: proxyLib.label(proxy) };
    if (outcome && outcome.status === 'registered') rememberExit(proxy);
    if (keepContext && res.status === 'registered') {
      res.ctxInfo = ctxInfo;
      kept = true;
    }
    return res;
  } catch (e) {
    supply.note(proxy, { ok: false, note: 'register-throw' });
    return { status: 'register-throw', note: String(e.message || e).slice(0, 200) };
  } finally {
    if (!kept) await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);
  }
}

/**
 * The finish steps inside an already-open context: verify link -> sign in ->
 * dashboard -> API keys -> create key -> read it. Kept separate from
 * `finishBurst` so the combined mode (same context as the register burst) can
 * reuse it; the caller owns the context.
 */
async function finishInContext(supply, acc, verifyLink, slot, ctxInfo, { tagSuffix = 'fin' } = {}) {
  const tag = `s${slot}/${tagSuffix}`;
  const { page, net } = ctxInfo;
  const proxy = ctxInfo.exit.proxy;
  try {
    log(`${tag}: exit ${proxyLib.label(proxy)} link=${verifyLink.slice(0, 90)}`);
    await page.goto(verifyLink);
    await page.waitFor(`!/(verifying your browser|security checkpoint)/i.test((document.body&&document.body.innerText)||'')`, {
      timeoutMs: BURST_WAIT,
      pollMs: 1200,
    });
    await sleep(2500);
    log(`${tag}: after link ${await page.url()} :: ${(await page.body()).replace(/\s+/g, ' ').slice(0, 160)}`);

    // Sign in (the verify page does not create a session itself).
    const onDash = /\/dashboard/.test(await page.url());
    if (!onDash) {
      if (!/\/auth\/login/.test(await page.url())) {
        await page.goto('https://platform.inceptionlabs.ai/auth/login');
      }
      const ready = await page.waitFor(`!!document.querySelector('#password')`, { timeoutMs: BURST_WAIT, pollMs: 900 });
      if (!ready) {
        supply.note(proxy, { ok: false, note: 'finish-no-login-form' });
        return { status: 'no-login-form', note: (await page.body()).slice(0, 160) };
      }
      await page.type('#email', acc.email);
      await page.type('#password', acc.password);
      await sleep(500);
      const before = net.reqs.length;
      await page.click(`[...document.querySelectorAll('button')].find(b => /^(sign in|log in)$/i.test((b.innerText || '').trim()))`);
      let signedIn = false;
      const deadline = Date.now() + 70000;
      while (Date.now() < deadline) {
        const url = await page.url();
        if (/dashboard|\/$|^https:\/\/platform\.inceptionlabs\.ai\/$/.test(url)) {
          const txt = await page.body();
          if (!/welcome back|sign in to inception/i.test(txt)) {
            signedIn = true;
            break;
          }
        }
        const err = net.reqs.slice(before).find((r) => /callback\/credentials/.test(r.url) && r.status && r.status >= 400);
        if (err) break;
        await sleep(1500);
      }
      const txt = (await page.body()).replace(/\s+/g, ' ');
      if (!signedIn && /invalid|incorrect|not verified|verify your email/i.test(txt)) {
        supply.note(proxy, { ok: false, note: 'login-rejected' });
        return { status: 'login-rejected', note: txt.slice(0, 200) };
      }
      log(`${tag}: signed in=${signedIn} url=${await page.url()}`);
    }

    // Dashboard -> API keys -> create.
    await page.goto('https://platform.inceptionlabs.ai/dashboard/api-keys');
    const onKeys = await page.waitFor(`/API Keys/i.test((document.body&&document.body.innerText)||'')`, { timeoutMs: BURST_WAIT, pollMs: 1000 });
    if (!onKeys) {
      supply.note(proxy, { ok: false, note: 'finish-no-keys-page' });
      return { status: 'no-keys-page', note: (await page.body()).slice(0, 200) };
    }
    await sleep(1500);
    const before = net.reqs.length;
    await page.click(`[...document.querySelectorAll('button')].find(b => /create api key/i.test((b.innerText || '').trim()))`);
    await sleep(1800);
    const nameInput = await page.waitFor(
      `(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const el = d.querySelector('input'); return el ? (el.id || el.name || 'dialog-input') : null; })()`,
      { timeoutMs: 15000, pollMs: 700 }
    );
    if (nameInput) {
      await page.eval(
        `(() => { const d = document.querySelector('[role=dialog]'); const el = d.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; el.focus(); setter.call(el, ${JSON.stringify(
          'river-' + crypto.randomBytes(3).toString('hex')
        )}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`
      );
      await sleep(700);
    }
    const submitted = await page.click(
      `(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; return [...d.querySelectorAll('button')].find(b => /create key/i.test((b.innerText||'').trim()) && !b.disabled) || null; })()`
    );
    log(`${tag}: create-key submitted=${submitted} nameInput=${nameInput}`);

    // The key is shown once — read it from the DOM, then from the wire.
    let key = null;
    const deadline2 = Date.now() + 45000;
    while (Date.now() < deadline2) {
      const found = await page
        .eval(
          `(() => { const cands = []; const d = document.querySelector('[role=dialog]'); if (d) { d.querySelectorAll('input,code,pre,span,div').forEach(e => { const v = e.value || e.innerText || ''; if (v && v.length > 20) cands.push(v.trim()); }); } return cands.join('\\n'); })()`
        )
        .catch(() => '');
      const m = /([A-Za-z0-9_\-]{24,})/.exec(String(found || ''));
      if (m && /^[A-Za-z0-9_\-]+$/.test(m[1]) && !/^river-/.test(m[1]) && m[1].length >= 24) {
        key = m[1];
        break;
      }
      const wire = net.reqs
        .slice(before)
        .map((r) => `${r.body || ''} ${r.postData || ''}`)
        .join('\n');
      const wm = /"(?:key|apiKey|token|secret|value)"\s*:\s*"([A-Za-z0-9_\-]{20,})"/.exec(wire);
      if (wm) {
        key = wm[1];
        break;
      }
      await sleep(1500);
    }
    // Fall back to the list: the page may render the key prefix + a copy control.
    if (!key) {
      const listText = await page.eval(`(() => (document.body.innerText||'').replace(/\\s+/g,' '))()`).catch(() => '');
      const lm = /(inc_[A-Za-z0-9_\-]{12,}|sk-[A-Za-z0-9_\-]{12,})/.exec(listText || '');
      if (lm) key = lm[1];
    }
    supply.note(proxy, { ok: !!key, note: key ? 'key-created' : 'key-missing' });
    try {
      fs.writeFileSync(path.join(OUT, `finish-${acc.email.split('@')[0]}.html`), await page.html());
    } catch {}
    return { status: key ? 'key' : 'key-missing', key, note: (await page.body()).replace(/\s+/g, ' ').slice(0, 200) };
  } catch (e) {
    supply.note(proxy, { ok: false, note: 'finish-throw' });
    return { status: 'finish-throw', note: String(e.message || e).slice(0, 200) };
  }
}

/** Standalone finish burst: takes (and closes) its own context. */
async function finishBurst(supply, cdp, acc, verifyLink, slot) {
  const ctxInfo = await freshContext(supply, cdp);
  if (!ctxInfo) return { status: 'no-exit' };
  try {
    return await withTimeout(finishInContext(supply, acc, verifyLink, slot, ctxInfo), 220000, 'finish-burst').catch((e) => ({
      status: 'finish-hang',
      note: String(e.message || e).slice(0, 120),
    }));
  } finally {
    await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);
  }
}

// ---------------------------------------------------------------- key verification

function apiExits() {
  try {
    return fs
      .readFileSync(API_FILE, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.split('\t')[0].trim())
      .filter((s) => /^(https?|socks[45]):\/\//.test(s))
      .map((s) => proxyLib.parseProxy(s))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Live check: models list + a one-token chat completion. */
async function verifyKey(key, { attempts = 6 } = {}) {
  const exits = apiExits();
  // The api host (CloudFront, no checkpoint) is the one place WARP is always
  // healthy, and the stored api-live pool goes stale within hours. Try WARP
  // first, then the pool. INCEPTION_VERIFY_EXIT overrides the fixed exit.
  const fixed = proxyLib.parseProxy(process.env.INCEPTION_VERIFY_EXIT || 'socks5://127.0.0.1:40000');
  const order = fixed ? [fixed] : [];
  const errors = [];
  for (let i = 0; i < attempts; i++) {
    const proxy = order.length ? order.shift() : exits.length ? exits[crypto.randomInt(0, exits.length)] : null;
    try {
      const models = await request(proxy, 'https://api.inceptionlabs.ai/v1/models', {
        timeoutMs: 25000,
        headers: { authorization: `Bearer ${key}` },
      });
      if (models.status !== 200) {
        errors.push(`models ${models.status}`);
        if (models.status === 401 || models.status === 403) return { ok: false, note: `models ${models.status}` };
        continue;
      }
      let list = [];
      try {
        list = JSON.parse(models.text).data || [];
      } catch {}
      const chat = await request(proxy, 'https://api.inceptionlabs.ai/v1/chat/completions', {
        method: 'POST',
        timeoutMs: 40000,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
        body: { model: API_MODEL, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], max_tokens: 8, temperature: 0 },
      });
      if (chat.status === 200) {
        let text = '';
        try {
          const j = JSON.parse(chat.text);
          text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        } catch {}
        return { ok: true, models: list.map((m) => m.id), sample: String(text).slice(0, 60) };
      }
      errors.push(`chat ${chat.status} ${chat.text.slice(0, 80)}`);
      if (chat.status === 401 || chat.status === 403) return { ok: false, note: `chat ${chat.status} ${chat.text.slice(0, 100)}` };
    } catch (e) {
      errors.push(String(e.message || e).slice(0, 60));
    }
    await sleep(1200);
  }
  return { ok: false, note: `unreachable: ${errors.slice(0, 4).join(' | ')}` };
}

// ---------------------------------------------------------------- one account

async function runAccount(supply, cdp, slot, { combined = false } = {}) {
  const acc = identity();
  let box = await mail.createInbox(BROKER, { label: `s${slot}`, attempts: 3, timeoutMs: 45000 }).catch(() => null);
  if (!box) box = await mail.createInbox(FALLBACK_BROKER, { label: `s${slot}`, attempts: 2, timeoutMs: 45000 }).catch(() => null);
  if (!box) return { status: 'no-mailbox' };
  acc.email = box.address;
  acc.mailToken = box.token;
  log(`s${slot}: account ${acc.email} (${acc.name})`);

  const reg = await registerWithRetries(supply, cdp, acc, slot, { keepContext: combined });
  log(`s${slot}: register -> ${reg.status} ${reg.note ? String(reg.note).slice(0, 120) : ''}`);
  const record = { email: acc.email, password: acc.password, name: acc.name, mail: box.token, register: reg.status, at: new Date().toISOString() };

  if (reg.status !== 'registered' && reg.status !== 'register-inline-error') {
    if (reg.status === 'register-timeout' || reg.status === 'register-hang') {
      // Ambiguous: the POST may have succeeded server-side (200 + mail) while
      // the client never navigated. The mailbox is the ground truth, so the
      // account goes to the pending queue; if the verify link never arrives it
      // expires as failed-mail and costs nothing but a poll.
      log(`s${slot}: register ${reg.status} is ambiguous -> queueing ${acc.email} as pending-mail to check the mailbox`);
      return { status: 'pending-mail', pending: { acc, box, record, at: Date.now() } };
    }
    recordAccount({ ...record, status: 'failed-register' });
    return { status: reg.status, record };
  }

  // While the register context is still open the checkpoint cookie is already
  // solved, so the verify+login+key steps can ride along in it — but the verify
  // mail's end-to-end latency (SES -> inbox provider -> broker) measured >5 min,
  // so holding the context open is pure waste. Default path: close the register
  // context, poll mail briefly, and if the link is not there yet hand the
  // account to the driver's pending queue, which finishes it in a fresh burst
  // once the mail lands (verify links live 24 h).
  const finish = async (cap) => {
    const mailRes = await mail.waitForMail(
      box,
      (msgs) => {
        const l = mail.pickVerifyLink(msgs);
        if (l) return l;
        return msgs.length ? { kind: 'mail', msgs } : null;
      },
      { timeoutMs: cap || MAIL_WAIT, pollMs: 6000, log: (m) => log(`s${slot}: ${m}`) }
    );
    const link = typeof mailRes.hit === 'string' ? mailRes.hit : mail.pickVerifyLink(mailRes.msgs || []);
    return { link, mailRes };
  };

  let ctxInfo = reg.ctxInfo || null;
  let link = null;
  if (ctxInfo) {
    const r = await finish(MAIL_WAIT);
    link = r.link;
    if (!link) {
      log(`s${slot}: no verify link in ${Math.round(MAIL_WAIT / 1000)}s (${JSON.stringify(r.mailRes).slice(0, 140)})`);
      await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);
      return { status: 'pending-mail', pending: { acc, box, record, at: Date.now() } };
    }
    log(`s${slot}: verify link ${String(link).slice(0, 100)}`);
    const alive = await ctxInfo.page.eval('1').catch(() => null);
    if (!alive) log(`s${slot}: register context died during the mail wait; falling back to a fresh burst`);
    else {
      const fin = await withTimeout(finishInContext(supply, acc, link, slot, ctxInfo, { tagSuffix: 'fin-combined' }), 220000, 'finish-combined').catch((e) => ({
        status: 'finish-hang',
        note: String(e.message || e).slice(0, 120),
      }));
      log(`s${slot}: finish(combined) -> ${fin.status} ${fin.note ? String(fin.note).slice(0, 120) : ''}`);
      await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);
      ctxInfo = null;
      if (fin.key) return await verifyAndRecord(supply, acc, record, fin);
    }
  } else {
    const r = await finish(MAIL_WAIT_SHORT);
    link = r.link;
    if (!link) {
      log(`s${slot}: mail not in yet (${JSON.stringify(r.mailRes).slice(0, 120)}); queued as pending`);
      return { status: 'pending-mail', pending: { acc, box, record, at: Date.now() } };
    }
  }
  if (ctxInfo) await B.closeContext(cdp, ctxInfo.ctx, ctxInfo.targetId, ctxInfo.detachProxyAuth);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const fin = await finishBurst(supply, cdp, acc, link, slot);
    log(`s${slot}: finish(try${attempt}) -> ${fin.status} ${fin.note ? String(fin.note).slice(0, 120) : ''}`);
    if (fin.key) return await verifyAndRecord(supply, acc, record, fin);
    if (fin.status === 'no-exit') {
      recordAccount({ ...record, status: 'failed-finish', finish: fin.status });
      return { status: fin.status, record };
    }
  }
  recordAccount({ ...record, status: 'failed-finish' });
  return { status: 'finish-failed', record };
}

/**
 * Register with up to `tries` fresh exits: an exit that answers the point-of-use
 * probe can still be TLS-MITM'd or die between probe and page, and each of those
 * costs one burst, not the account.
 */
async function registerWithRetries(supply, cdp, acc, slot, { keepContext = false, tries = 4 } = {}) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    const r = await withTimeout(registerBurst(supply, cdp, acc, slot, { keepContext }), 200000, 'register-burst').catch((e) => ({
      status: 'register-hang',
      note: String(e.message || e).slice(0, 120),
    }));
    if (r.status === 'registered' || r.status === 'register-inline-error') return r;
    last = r;
    if (r.status === 'register-error') return r; // the platform rejected the identity itself
    log(`s${slot}: register attempt ${i}/${tries} -> ${r.status}; next exit`);
    await sleep(600);
  }
  return last || { status: 'no-exit' };
}

/** Live-verifies a key and records it; shared by the combined and burst paths. */
async function verifyAndRecord(supply, acc, record, fin) {
  const v = await verifyKey(fin.key);
  log(`verify -> ${v.ok ? 'OK' : 'FAIL'} ${v.ok ? `${(v.models || []).slice(0, 3).join(',')} | ${v.sample}` : v.note}`);
  if (!v.ok) {
    recordAccount({ ...record, status: 'failed-verify', key: fin.key, note: v.note });
    return { status: 'verify-failed', record };
  }
  const n = recordKey(fin.key);
  recordAccount({ ...record, status: 'ok', keyPrefix: `${fin.key.slice(0, 4)}…${fin.key.slice(-4)}`, models: v.models, keys: n });
  log(`DONE keys=${n} (${fin.key.slice(0, 4)}…${fin.key.slice(-4)})`);
  return { status: 'ok', record };
}

// ---------------------------------------------------------------- driver

const PENDING_FILE = path.join(OUT, 'pending.json');

(async () => {
  log(`mint start count=${COUNT} workers=${WORKERS} start=${START} chrome=${PORT} broker=${BROKER}`);
  const chromePid = B.launchChrome(PORT, PROFILE_DIR, { headless: HEADLESS });
  const cdp = await B.connect(PORT);
  const supply = new ExitSupply();

  const queue = [];
  for (let i = 0; i < COUNT; i++) queue.push(START + i);

  let ok = 0;
  let attempted = 0;
  const results = [];

  // Accounts whose register burst succeeded but whose verify mail had not
  // landed yet (measured end-to-end latency > 5 min). `sweepPending` finishes
  // them once the link arrives; the queue is persisted so a restart does not
  // orphan registrations that already cost a mailbox.
  const pending = [];
  const savePending = () =>
    writeJson(PENDING_FILE, pending.map((p) => ({ acc: p.acc, mail: p.box.token, base: p.box.base, record: p.record, at: p.at })));
  for (const p of readJson(PENDING_FILE, [])) {
    pending.push({ acc: p.acc, box: new mail.Mailbox(p.base, p.acc.email, p.mail), record: p.record, at: p.at });
  }
  if (pending.length) log(`resumed ${pending.length} pending account(s) from a previous run`);

  /** Polls pending boxes in parallel (broker calls only), then finishes the ones with links sequentially (one browser context, one exit). */
  let sweepBusy = false;
  const sweepPending = async (slot, { pollMs = 25000 } = {}) => {
    if (!pending.length || sweepBusy) return;
    sweepBusy = true;
    try {
    // NOTE: waitForMail() filters mail by arrival age (it is built for "mail
    // that arrives during this wait"). Pending mail is by definition OLDER, so
    // this path reads the box directly and caches message ids, reading each
    // body exactly once (a /read costs ~20-50 s on the Mailtrap chain).
    const readLink = async (p) => {
      const list = await p.box.list().catch(() => []);
      if (!Array.isArray(list) || !list.length) return null;
      p.cache = p.cache || {};
      for (const m of list) {
        if (!/verify|confirm|welcome/i.test(String(m.subject || ''))) continue;
        if (p.cache[m.id]) continue;
        const full = await p.box.read(m.id).catch(() => null);
        p.cache[m.id] = true;
        const text = `${(full && full.subject) || m.subject || ''}\n${(full && full.text) || ''}\n${(full && full.html) || ''}`;
        const link = mail.pickVerifyLink([{ text }]);
        if (link) return link;
      }
      return null;
    };
    const expired = [];
    const found = [];
    await mapLimit(pending.slice(), 4, async (p) => {
      if (Date.now() - p.at > PENDING_TOTAL) {
        expired.push(p);
        return;
      }
      const link = await readLink(p).catch(() => null);
      if (link) found.push({ p, link });
    });
    for (const p of expired) {
      pending.splice(pending.indexOf(p), 1);
      recordAccount({ ...p.record, status: 'failed-mail' });
      log(`s${slot}: pending ${p.acc.email} expired after ${Math.round((Date.now() - p.at) / 60000)}min without a verify link`);
    }
    if (expired.length) savePending();
    for (const { p, link } of found) {
      pending.splice(pending.indexOf(p), 1);
      savePending();
      log(`s${slot}: pending ${p.acc.email}: verify link in ${Math.round((Date.now() - p.at) / 60000)}min -> finishing`);
      let done = null;
      for (let attempt = 1; attempt <= 3 && !done; attempt++) {
        const fin = await finishBurst(supply, cdp, p.acc, link, slot);
        log(`s${slot}: pending finish(try${attempt}) -> ${fin.status} ${fin.note ? String(fin.note).slice(0, 120) : ''}`);
        if (fin.key) done = await verifyAndRecord(supply, p.acc, p.record, fin);
        else if (fin.status === 'no-exit') break;
      }
      if (done && done.status === 'ok') {
        ok++;
        results.push({ idx: `pend:${p.acc.email}`, status: 'ok', record: done.record });
      } else {
        recordAccount({ ...p.record, status: 'failed-finish', finish: (done && done.status) || 'finish-failed' });
        results.push({ idx: `pend:${p.acc.email}`, status: (done && done.status) || 'failed-finish' });
      }
    }
    } finally {
      sweepBusy = false;
    }
  };

  const worker = async (slot) => {
    for (;;) {
      if (STOP_KEYS && readKeys().length >= STOP_KEYS) {
        log(`stop-keys reached (${STOP_KEYS}); ending the register queue`);
        queue.length = 0;
        return;
      }
      const idx = queue.shift();
      if (idx === undefined) return;
      attempted++;
      const t0 = Date.now();
      console.log(`… #${idx} başladı (${FIXED_EXIT ? proxyLib.label(proxyLib.parseProxy(FIXED_EXIT)) : 'pool exits'})`);
      const r = await withTimeout(runAccount(supply, cdp, slot), 600000, 'account').catch((e) => ({ status: 'hang', note: String(e.message || e).slice(0, 160) }));
      if (r.status === 'hang' || r.status === 'throw') {
        const reaped = await B.reapOrphans(cdp).catch(() => 0);
        log(`slot${slot}: reaped ${reaped} leaked context(s)`);
      }
      if (r.status === 'ok') {
        ok++;
        console.log(`✓ #${idx} KEY ALINDI: ${(r.record && r.record.keyPrefix) || '(key)'} [${ok} ok / ${attempted} deneme]`);
      } else {
        console.log(`✗ #${idx} key yok: ${r.status}`);
      }
      if (r.status === 'pending-mail' && r.pending) {
        pending.push(r.pending);
        savePending();
      }
      state.accounts[`${START}-${idx}`] = { status: r.status, at: Date.now() };
      state.done = ok;
      saveState();
      supply.save();
      results.push({ idx, ...r });
      log(`progress: slot${slot} idx=${idx} ${r.status} ok=${ok}/${attempted} pending=${pending.length} ${Math.round((Date.now() - t0) / 1000)}s`);
      // Between registrations, collect whatever mail already landed.
      await sweepPending(slot).catch((e) => log(`sweep error: ${String((e && e.message) || e).slice(0, 120)}`));
      if (GAP_MS) await sleep(GAP_MS);
    }
  };

  await Promise.all(new Array(WORKERS).fill(0).map((_, i) => worker(i)));

  // Drain: the verify mails land 5-15 min after registration; wait for them and
  // finish every account inside the pending window.
  while (pending.some((p) => Date.now() - p.at <= PENDING_TOTAL) && !(STOP_KEYS && readKeys().length >= STOP_KEYS)) {
    log(`drain: ${pending.length} pending account(s) — polling mail`);
    await sweepPending(0, { pollMs: 90000 }).catch((e) => log(`sweep error: ${String((e && e.message) || e).slice(0, 120)}`));
    if (pending.some((p) => Date.now() - p.at <= PENDING_TOTAL)) await sleep(15000);
  }

  log(`mint done: ok=${ok} attempted=${attempted} pending-left=${pending.length}`);
  console.log(`INCEPTION ${ok}/${attempted} OK`);
  for (const r of results) log(`  ${r.idx} ${r.status} ${r.record ? r.record.email : r.note || ''}`);
  // Clean close (spec §3): stop the Chrome this run started and drop its profile.
  if (!process.argv.includes('--keep-profile')) {
    try {
      process.kill(chromePid);
    } catch {}
    await sleep(800);
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }
  process.exit(0);
})().catch((e) => {
  log(`FATAL ${(e && e.stack) || e}`);
  process.exit(1);
});
