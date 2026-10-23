// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: the real-time measure of the demo (tools/dropouts.js: the whole demo in a headless, muted browser, AudioContext.playbackStats) with each engine,
// normal and in Windows Efficiency mode (--eco), one run after the other (never side by side), engines interleaved. Writes wasm/out/logs/dropouts_<n>.txt and a summary.
//   node wasm/dropouts_all.js [--rounds 1]   (EDGE_PATH: the browser; default C:/Users/Pierra/tools/chrome/chrome.exe when it exists)
'use strict';
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const ROUNDS = +arg('rounds', 1);
const env = Object.assign({}, process.env);
if (!env.EDGE_PATH && fs.existsSync('C:/Users/Pierra/tools/chrome/chrome.exe')) env.EDGE_PATH = 'C:/Users/Pierra/tools/chrome/chrome.exe';
const runs = [];
for (let r = 0; r < ROUNDS; r++) for (const eco of [false, true]) for (const e of (r % 2 ? ['wasm', 'js'] : ['js', 'wasm'])) runs.push({ e, eco });
const logs = path.join(__dirname, 'out', 'logs');
fs.mkdirSync(logs, { recursive: true });
const summary = [];
runs.forEach((run, k) => {
  const args = [path.join(ROOT, 'tools', 'dropouts.js'), '--engine', run.e, '--label', `wasmproto_${run.e}_${k}`];
  if (run.eco) args.push('--eco');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', windowsHide: true, timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(logs, `dropouts_${k}_${run.e}${run.eco ? '_eco' : ''}.txt`), out);
  const m = /TOTAL: (\d+) dropouts, (\d+) ms of sound missing/.exec(out);
  const line = `${run.e.padEnd(4)} ${run.eco ? 'eco   ' : 'normal'} ${m ? `${m[1]} dropouts, ${m[2]} ms missing` : 'FAILED: ' + out.trim().split('\n').slice(-2).join(' | ')} (${((Date.now() - t0) / 1000).toFixed(0)} s)`;
  console.log(line);
  summary.push(line);
});
fs.writeFileSync(path.join(logs, 'dropouts_summary.txt'), summary.join('\n') + '\n');
