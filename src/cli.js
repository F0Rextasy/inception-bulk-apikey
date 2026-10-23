#!/usr/bin/env node
'use strict';

/**
 * Command dispatcher for inception-bulk-apikey.
 *
 *   node src/cli.js mint     create fresh accounts and mint one key each
 *   node src/cli.js finish   log in to accounts already created and finish their key
 *   node src/cli.js verify   re-check keys that are already on disk
 *   node src/cli.js screen   keep only proxy exits that reach the provider
 *   node src/cli.js help
 *
 * Every task spawns the matching module in this folder, so a crash in one run
 * never leaves state behind in this process.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { parseRouterArgs } = require('./connect-9router.js');

const TASKS = {
  mint: { file: 'mint.js', note: 'create fresh accounts and mint one key each' },
  finish: { file: 'finish.js', note: 'log in to accounts already created and finish their key' },
  verify: { file: 'verify-keys.js', note: 're-check keys that are already on disk' },
  screen: { file: 'screen.js', note: 'keep only proxy exits that reach the provider' },
};

function help() {
  console.log('inception-bulk-apikey — one account per key\n');
  console.log('usage: node src/cli.js <task> [options]\n');
  console.log('tasks:');
  for (const [name, t] of Object.entries(TASKS)) console.log('  ' + name.padEnd(9) + ' ' + t.note);
  console.log('\noptions: every task takes its own flags — ask it directly:');
  console.log('  node src/<task-file> --help');
  console.log('  --count N          keys to mint (the one-command path: node src/cli.js --count N)');
  console.log('  --auto             solve the Turnstile with src/solver.js (default)');
  console.log('  --connect-9router  register the keys in 9Router after the task finishes');
  console.log('  keys-dead.txt      keys verify called dead (401/403) are written beside keys.txt');
  console.log('  --connect-omniroute  register the keys in OmniRoute after the task finishes');
  console.log('\nproxy pool:');
  console.log('  one exit per line in proxies.txt — scheme://host:port[#comment], user:pass@ supported');
  console.log('\nno options? run the interactive launcher:  node src/launcher.js');
}

const argv = process.argv.slice(2);
const task = argv[0];
if (!task || task === 'help' || task === '--help' || task === '-h') {
  help();
  process.exit(0);
}
const entry = TASKS[task];
if (!entry) {
  console.error('unknown task: ' + task + '\n');
  help();
  process.exit(1);
}
const rest = argv.slice(1);
const connect9 = rest.includes('--connect-9router');
const connectOr = rest.includes('--connect-omniroute');
const child = spawnSync(process.execPath, [path.join(__dirname, entry.file), ...rest], {
  windowsHide: true,
  stdio: 'inherit',
  env: process.env,
});
const status = child.status === null ? 1 : child.status;
if (!connect9 && !connectOr) process.exit(status);
const connectKeysFile = connectOr
  ? require('./connect-omniroute.js').connectKeysFile
  : require('./connect-9router.js').connectKeysFile;
const flags = rest.filter((a) => a !== '--connect-9router' && a !== '--connect-omniroute');
connectKeysFile(parseRouterArgs(flags)).then(
  () => {
    process.exitCode = status;
  },
  (e) => {
    console.error('[' + (connectOr ? 'omniroute' : '9router') + '] ' + (e && e.message ? e.message : e));
    process.exitCode = 1;
  }
);
