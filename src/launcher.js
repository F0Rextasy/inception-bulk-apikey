#!/usr/bin/env node
'use strict';

/**
 * Interactive launcher for inception-bulk-apikey — a menu over the task modules.
 * Settings persist in launcher.config.json at the checkout root (beside
 * proxies.txt and keys.txt).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { connect9Router, connectKeysFile, readKeys, defaultKeysFile } = require('./connect-9router.js');

const HERE = __dirname; // the task modules live beside this launcher
const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'launcher.config.json');
const POOL = path.join(ROOT, 'proxies.txt');
const KEYS = path.join(ROOT, 'keys.txt');

const defaults = { count: 30, conc: 2 };
let cfg = { ...defaults };
try { Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG, 'utf8'))); } catch (e) {}
const save = () => fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
const ARGS = {"mint":["--count","count","--workers","conc"],"finish":[],"verify":[],"screen":[]};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, fb) => new Promise((r) => rl.question(q + (fb !== undefined ? ' [' + fb + ']' : '') + ': ', (a) => r(String(a).trim() || fb)));

const LOGO = String.raw`
  ██╗███╗   ██╗ ██████╗███████╗██████╗ ████████╗██╗ ██████╗ ███╗   ██╗
  ██║████╗  ██║██╔════╝██╔════╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
  ██║██╔██╗ ██║██║     █████╗  ██████╔╝   ██║   ██║██║   ██║██╔██╗ ██║
  ██║██║╚██╗██║██║     ██╔══╝  ██╔═══╝    ██║   ██║██║   ██║██║╚██╗██║
  ██║██║ ╚████║╚██████╗███████╗██║        ██║   ██║╚██████╔╝██║ ╚████║
  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝        ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝`;

function banner() {
  const w = 78;
  const box = (s) => '  │ ' + s.padEnd(w) + ' │';
  console.log(LOGO);
  console.log('  ┌' + '─'.repeat(w + 2) + '┐');
  console.log(box('inception-bulk-apikey  ·  one account per key'));
  console.log(box('open source · MIT · inception-bulk-apikey contributors'));
  console.log('  └' + '─'.repeat(w + 2) + '┘\n');
}

const count = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length; } catch (e) { return 0; } };

function run(args) {
  console.log('\n▶ node src/' + args.join(' ') + '\n');
  const r = spawnSync(process.execPath, args, { windowsHide: true, cwd: HERE, stdio: 'inherit' });
  if (r.status !== 0) console.log('\n⚠ exited with code ' + r.status);
}

function argsFor(task) {
  const spec = ARGS[task] || [];
  return spec.map((v) => (v === 'count' ? String(cfg.count) : v === 'conc' ? String(cfg.conc) : v));
}

async function settings() {
  console.log('\nSettings');
  console.log('  1) count      ' + cfg.count);
  console.log('  2) conc       ' + cfg.conc);
  console.log('  0) back');
  const p = await ask('choose', '0');
  if (p === '1') cfg.count = parseInt(await ask('count', cfg.count), 10) || cfg.count;
  if (p === '2') cfg.conc = parseInt(await ask('concurrency', cfg.conc), 10) || cfg.conc;
  save();
}

async function connectRouter() {
  const base = await ask('9Router base', cfg.routerBase || 'http://localhost:20128');
  const password = await ask('9Router password', cfg.routerPassword || '123456');
  cfg.routerBase = base;
  cfg.routerPassword = password;
  save();
  console.log('\n▶ 9Router ' + base + ' — one connection per key\n');
  try {
    await connectKeysFile({ base, password });
  } catch (e) {
    if (readKeys(defaultKeysFile()).length) {
      console.log('\n⚠ ' + (e && e.message ? e.message : e));
      return;
    }
    const apiKey = await ask('keys.txt is empty — paste one API key', '');
    if (!apiKey) return;
    try {
      await connect9Router({ base, password, apiKey });
    } catch (e2) {
      console.log('\n⚠ ' + (e2 && e2.message ? e2.message : e2));
    }
  }
}

async function main() {
  process.stdout.write('\x1b[2J\x1b[H');
  banner();
  console.log('  proxy exits: ' + (count(POOL) || 'none — running WITHOUT a proxy (direct)') + '     keys on disk: ' + count(KEYS) + '\n');
  console.log('  1) mint      create fresh accounts and mint one key each');
  console.log('  2) finish    log in to accounts already created and finish their key');
  console.log('  3) verify    re-check keys that are already on disk');
  console.log('  4) screen    keep only proxy exits that reach the provider');
  console.log('  5) Settings');
  console.log('  6) Connect to 9Router');
  console.log('  0) Exit\n');
  const choice = await ask('choose', '1');
  if (choice === '1') {
    run(['mint.js', ...argsFor('mint')]);
  }
  else if (choice === '2') {
    run(['finish.js', ...argsFor('finish')]);
  }
  else if (choice === '3') {
    run(['verify-keys.js', ...argsFor('verify')]);
  }
  else if (choice === '4') {
    run(['screen.js', ...argsFor('screen')]);
  }
  else if (choice === '5') {
    await settings();
  }
  else if (choice === '6') {
    await connectRouter();
  } else {
    rl.close();
    return;
  }
  await ask('\npress enter for the menu', '');
  return main();
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Interactive launcher: run `node src/launcher.js` and pick a menu item.');
  process.exit(0);
}

main().catch((e) => { console.error('launcher failed:', e.stack || e.message); process.exit(1); });
