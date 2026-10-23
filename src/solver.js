'use strict';

/**
 * src/solver.js — the repo's captcha engine and the `--auto` entry.
 *
 * inception (platform.inceptionlabs.ai) gates sign-up with Cloudflare
 * **Turnstile**: the register page is a React app that renders the widget with a
 * callback and never writes the hidden `cf-turnstile-response` input, so the only
 * reliable readiness signal is `window.turnstile.getResponse()` (measured: a
 * 700+ char token while the input stays empty — the input-only check reported
 * "no token" for ~170 exits even where the widget had solved).
 *
 * The browser is the operator's own Chrome, driven over CDP (src/browser.js); a
 * token is only good for the exit that solved it, so the page and the exit are
 * always the pair the caller will spend the token with.
 *
 * Locked one-command entry:
 *   const { solveCaptcha } = require('./solver.js');
 *   const { token, ms } = await solveCaptcha({ type, sitekey, url, proxy, page });
 */

const B = require('./browser');

/** The one page-global namespace this module owns. */
const NS = '__incTs';
const REGISTER_URL = 'https://platform.inceptionlabs.ai/auth/register';
const WIDGET = `[id*=cf-chl-widget][id$=_response],input[name="cf-turnstile-response"]`;

/**
 * Length of the Turnstile token the app will actually submit. `react-turnstile`
 * keeps the token in `window.turnstile.getResponse()`; the hidden input stays
 * empty, so the verdict is the max of both.
 */
const TOKEN_LEN = `(() => { try { const el = document.querySelector('${WIDGET}'); const inLen = el && el.value ? el.value.length : 0; let r = 0; if (window.turnstile && window.turnstile.getResponse) { try { r = String(window.turnstile.getResponse() || '').length; } catch (e) {} } return Math.max(inLen, r); } catch (e) { return 0; } })()`;

/**
 * Watch a page that already carries the widget until `window.turnstile` hands
 * back a token; pokes the visible checkbox once before the last window.
 * Resolves with the token **length** (0 when the budget ran out) — the caller
 * knows the token itself lives in the page and is submitted by the form.
 */
async function watchToken(page, { firstMs = 45000, pokeMs = 20000, poke = true, log = () => {} } = {}) {
  await page.waitFor(`!!document.querySelector('${WIDGET}')`, { timeoutMs: 25000, pollMs: 800 }).catch(() => null);
  let len = (await page.waitFor(TOKEN_LEN, { timeoutMs: firstMs, pollMs: 1000 })) || 0;
  if (len < 20 && poke) {
    await page.pokeTurnstile().catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    len = (await page.waitFor(TOKEN_LEN, { timeoutMs: pokeMs, pollMs: 1000 })) || 0;
  }
  log(`  solver: turnstile token len=${len}`);
  return len;
}

/**
 * One Turnstile solve, following the shared solver contract:
 *
 *   const { token, ms } = await solveCaptcha({ type, sitekey, url, proxy, page });
 *
 * Pass the `page` the form will be submitted from (the mint path does — one
 * exit, one page, one token). Without one this opens its own context on `cdp`
 * through `proxy` (and closes it again), which is what `--auto` does on its own.
 * Resolves with the widget's token string, or throws — never an empty token.
 */
async function solveCaptcha({
  type = 'turnstile',
  sitekey = null,
  url = REGISTER_URL,
  proxy = null,
  page = null,
  cdp = null,
  port = Number(process.env.INCEPTION_CDP_PORT || 9421),
  action = null,
  poke = true,
  log = () => {},
} = {}) {
  if (type !== 'turnstile') throw new Error(`solveCaptcha: unsupported captcha type "${type}" (inception is Turnstile only)`);
  const t0 = Date.now();
  let own = null;
  let target = page;
  if (!target) {
    if (!cdp) {
      cdp = await B.connect(port).catch(async () => {
        log(`  solver: no Chrome on :${port} — launching one`);
        B.launchChrome(port, null, {});
        return B.connect(port);
      });
    }
    own = await B.openContext(cdp, proxy);
    target = own.page;
    await target.goto(url);
  }
  try {
    const len = await watchToken(target, { poke, log });
    if (len < 20) {
      throw new Error(
        `solveCaptcha: no Turnstile token after ~65 s (sitekey ${sitekey || 'the page default'}) — ` +
          'the exit may not reach challenges.cloudflare.com, or the widget answered an error',
      );
    }
    const token = await target
      .eval(`(() => { try { return (window.turnstile && window.turnstile.getResponse && window.turnstile.getResponse()) || ''; } catch (e) { return ''; } })()`)
      .catch(() => '');
    if (!token) throw new Error('solveCaptcha: the widget reported a token length but getResponse() returned nothing');
    return { token: String(token), ms: Date.now() - t0 };
  } finally {
    if (own && cdp) await B.closeContext(cdp, own.ctx, own.targetId, own.detachProxyAuth).catch(() => null);
  }
}

module.exports = { solveCaptcha, watchToken, TOKEN_LEN, WIDGET, NS, REGISTER_URL };
