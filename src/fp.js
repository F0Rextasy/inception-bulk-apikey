'use strict';

/**
 * Per-profile fingerprint (operator standard v3, spec §3).
 *
 * No two Chrome contexts of a fleet run may share a UA + viewport + timezone +
 * locale combination, so the pool is indexed by the account's ordinal: the same
 * run always produces the same combination per account, and the first 256
 * accounts never repeat one (4 UA x 4 viewport x 4 timezone x 4 locale, muxed).
 *
 *   SD_UA       one UA for a single deliberate run (backward compatible pin)
 *   SD_UA_POOL  your own pool — a file path (one UA per line) or a comma list
 *   SD_TZ       one timezone override (point it at the exit's country)
 */

const fs = require('fs');

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
];
const VIEWPORTS = [
  [1280, 900],
  [1366, 768],
  [1440, 900],
  [1536, 864],
];
const TIMEZONES = ['Europe/Berlin', 'America/New_York', 'Asia/Shanghai', 'Asia/Istanbul'];
const LOCALES = ['en-US,en', 'en-GB,en', 'de-DE,de', 'tr-TR,tr'];

function platformOf(ua) {
  if (/Macintosh|Mac OS X/.test(ua)) return 'MacIntel';
  if (/X11|Linux/.test(ua)) return 'Linux x86_64';
  return 'Win32';
}

/** `SD_UA_POOL` (file path or comma list) replaces the built-in pool. */
function uaPool() {
  const pinned = process.env.SD_UA;
  if (pinned) return [pinned];
  const raw = process.env.SD_UA_POOL;
  if (raw) {
    const list = raw.includes(',')
      ? raw.split(',')
      : String(fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8') : raw)
          .split(/\r?\n/);
    const clean = list.map((s) => s.trim()).filter(Boolean);
    if (clean.length) return clean;
  }
  return UA_POOL;
}

/** Deterministic, non-repeating combination for one account ordinal. */
function forIndex(i) {
  const n = Math.abs(parseInt(i, 10) || 0);
  const uas = uaPool();
  const ua = uas[n % uas.length];
  const vp = VIEWPORTS[Math.floor(n / uas.length) % VIEWPORTS.length];
  const tz = process.env.SD_TZ || TIMEZONES[Math.floor(n / (uas.length * VIEWPORTS.length)) % TIMEZONES.length];
  const languages = LOCALES[Math.floor(n / (uas.length * VIEWPORTS.length * TIMEZONES.length)) % LOCALES.length];
  return {
    index: n,
    ua,
    platform: platformOf(ua),
    width: vp[0],
    height: vp[1],
    timezone: tz,
    languages: languages.split(','),
    label: `ua${n % uas.length} vp${vp[0]}x${vp[1]} tz${tz}`,
  };
}

module.exports = { UA_POOL, VIEWPORTS, TIMEZONES, LOCALES, uaPool, forIndex };
