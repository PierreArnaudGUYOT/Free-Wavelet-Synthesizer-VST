// Node bench of the web engine (core.js) of Okto MultiWave Synth 1.0.6: the same chords as vst/devtest/cpu_bench.cpp
// (3 s at 48 kHz, blocks of 128, notes off at 2 s), CPU % of real time (process.cpuUsage), min of reps, and a hash of the output
// (the bits of every sample) so that two engines can be compared for bit-identity.
//   node jsbench.js <repo root> <cases.txt> [--chords 3,6,8] [--reps 3] [--out f.csv] [--every k] [--core core.js]
'use strict';
const fs = require('fs'), path = require('path');
const root = process.argv[2], casesPath = process.argv[3];
const args = process.argv.slice(4);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const chords = opt('--chords', '3,6,8').split(',').map(Number), reps = +opt('--reps', 3), outPath = opt('--out', ''), every = +opt('--every', 1);
const coreFile = opt('--core', path.resolve(root, 'web/js/core.js'));
const SPEC = require(path.resolve(root, 'web/js/spec.js'));
const C = require(path.resolve(coreFile))(SPEC);
const CH = { 3: [60, 64, 67], 6: [48, 55, 60, 64, 67, 71], 8: [36, 48, 55, 60, 64, 67, 71, 76] };
const sr = 48000, blk = 128, secs = 3, n = Math.floor(sr * secs / blk) * blk, offAt = Math.floor(2 * sr / blk) * blk;
const L = new Float32Array(n), R = new Float32Array(n);
const LU = new Uint32Array(L.buffer), RU = new Uint32Array(R.buffer);
const fnv = (h, u) => { for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
const lines = fs.readFileSync(casesPath, 'utf8').split('\n').filter(l => l.trim());
const out = ['idx,chord,vel,cpu_pct,median_pct,build_ms,hash'];
let k = 0;
for (const line of lines) {
  if (k++ % every) continue;
  const bar = line.lastIndexOf(' | ');
  const parts = line.slice(0, bar).trim().split(/\s+/).map(Number);
  const idx = parts[0], params = Float64Array.from(parts.slice(1));
  let tb, bms = 1e9;
  for (let r = 0; r < 2; r++) { const t0 = process.hrtime.bigint(); tb = C.buildTables(params, true); bms = Math.min(bms, Number(process.hrtime.bigint() - t0) / 1e6); }
  for (const cs of chords) {
    const runs = []; let hash = 0;
    for (let r = 0; r < reps + 1; r++) {   // one warm-up run (JIT) is dropped
      const eng = new C.Engine(sr);
      for (let i = 0; i < params.length; i++) eng.setParam(i, params[i]);
      eng.setTables(tb);
      const c0 = process.cpuUsage();
      for (let o = 0; o < n; o += blk) {
        if (o === 0) for (const nn of CH[cs]) eng.noteOn(nn, 0.9);
        if (o === offAt) for (const nn of CH[cs]) eng.noteOff(nn);
        eng.process(L.subarray(o, o + blk), R.subarray(o, o + blk), blk);
      }
      const c1 = process.cpuUsage(c0);
      if (r > 0) runs.push((c1.user + c1.system) / 1e6 / secs * 100);
      if (r === 0) hash = fnv(fnv(2166136261, LU), RU);
    }
    runs.sort((a, b) => a - b);
    out.push(`${idx},${cs},0.9,${runs[0].toFixed(4)},${runs[runs.length >> 1].toFixed(4)},${bms.toFixed(2)},${hash.toString(16)}`);
  }
  if (outPath) fs.writeFileSync(outPath, out.join('\n') + '\n');
}
if (!outPath) console.log(out.join('\n')); else fs.writeFileSync(outPath, out.join('\n') + '\n');
