// A/B bench of two web engines (core.js files) on the same chords, interleaved render after render so that both see the same machine:
// 3 s at 48 kHz, blocks of 128, notes off at 2 s, CPU % of real time = process CPU time (user + system) of the render, min of reps per engine,
// and the FNV hash of the output of each engine (equal = bit-identical).
//   node jsab.js <repo root> <cases.txt> <coreA.js> <coreB.js> [--chords 6] [--reps 3] [--every 2] [--out f.csv]
'use strict';
const fs = require('fs'), path = require('path');
const root = process.argv[2], casesPath = process.argv[3], coreA = process.argv[4], coreB = process.argv[5];
const args = process.argv.slice(6);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const chords = opt('--chords', '6').split(',').map(Number), reps = +opt('--reps', 3), every = +opt('--every', 1), outPath = opt('--out', '');
const SPEC = require(path.resolve(root, 'web/js/spec.js'));
const CA = require(path.resolve(coreA))(SPEC), CB = require(path.resolve(coreB))(SPEC);
const CH = { 3: [60, 64, 67], 6: [48, 55, 60, 64, 67, 71], 8: [36, 48, 55, 60, 64, 67, 71, 76] };
const sr = 48000, blk = 128, secs = 3, n = Math.floor(sr * secs / blk) * blk, offAt = Math.floor(2 * sr / blk) * blk;
const L = new Float32Array(n), R = new Float32Array(n), LU = new Uint32Array(L.buffer), RU = new Uint32Array(R.buffer);
const fnv = (h, u) => { for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
function render(C, tb, params, cs) {
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
  return { pct: (c1.user + c1.system) / 1e6 / secs * 100, hash: fnv(fnv(2166136261, LU), RU) };
}
const lines = fs.readFileSync(casesPath, 'utf8').split('\n').filter(l => l.trim());
const out = ['idx,chord,a_pct,b_pct,ratio,same_hash'];
let k = 0, sa = 0, sb = 0, cnt = 0, same = 0;
for (const line of lines) {
  if (k++ % every) continue;
  const bar = line.lastIndexOf(' | ');
  const parts = line.slice(0, bar).trim().split(/\s+/).map(Number);
  const idx = parts[0], params = Float64Array.from(parts.slice(1));
  const tbA = CA.buildTables(params, true), tbB = CB.buildTables(params, true);
  for (const cs of chords) {
    let a = 1e9, b = 1e9, ha = 0, hb = 0;
    render(CA, tbA, params, cs); render(CB, tbB, params, cs);   // warm-up (JIT) of both
    for (let r = 0; r < reps; r++) {
      const ra = render(CA, tbA, params, cs), rb = render(CB, tbB, params, cs);
      a = Math.min(a, ra.pct); b = Math.min(b, rb.pct); ha = ra.hash; hb = rb.hash;
    }
    out.push(`${idx},${cs},${a.toFixed(4)},${b.toFixed(4)},${(b / a).toFixed(3)},${ha === hb}`);
    sa += a; sb += b; cnt++; if (ha === hb) same++;
  }
}
out.push(`# n=${cnt} mean A ${(sa / cnt).toFixed(3)} %  mean B ${(sb / cnt).toFixed(3)} %  B/A ${(sb / sa).toFixed(3)}  bit-identical ${same}/${cnt}`);
if (outPath) fs.writeFileSync(outPath, out.join('\n') + '\n');
console.log(out.join('\n'));
