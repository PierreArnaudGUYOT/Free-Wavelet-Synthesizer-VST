// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: the CPU of the web engine (core.js) against the C++ engine compiled to WebAssembly (scalar and SIMD), in Node (V8, as Chrome / Edge). Each measure
// is a fresh process (wasm/bench_one.js: a dense chord of 16 voices, quanta of 128 samples at 48 kHz); the presets are the 20 heaviest for core.js (a first quick pass
// ranks the 208) and the 30 of the demo's tour; each (preset, engine) is measured --reps times, the engines interleaved, and the median is kept.
//   node wasm/bench.js [--reps 3] [--procs 4] [--secs 2] [--heavy 20] [--out wasm/out/bench.json]
'use strict';
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web/js/spec.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const REPS = +arg('reps', 3), PROCS = +arg('procs', 4), SECS = arg('secs', '2'), HEAVY = +arg('heavy', 20);
const OUT = arg('out', path.join(__dirname, 'out', 'bench.json'));
const ENGINES = ['js', 'scalar', 'simd'];
const run1 = (eng, idx, secs, warm) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [path.join(__dirname, 'bench_one.js'), eng, String(idx), '--secs', String(secs), '--warm', String(warm)], { windowsHide: true });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
  p.on('close', c => (c ? rej(new Error(`${eng} ${idx}: ${err}`)) : res(JSON.parse(out.trim().split('\n').pop()))));
});
async function pool(jobs, n, onDone) {
  const res = new Array(jobs.length); let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < jobs.length) { const k = next++; res[k] = await jobs[k](); done++; if (onDone) onDone(done, jobs.length); }
  }));
  return res;
}
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
(async () => {
  const t0 = Date.now();
  // 1. rank the presets by core.js's cost (one short measure each)
  const rankFile = path.join(__dirname, 'out', 'rank.json');
  let rank;
  if (fs.existsSync(rankFile)) rank = JSON.parse(fs.readFileSync(rankFile, 'utf8'));
  else {
    const r = await pool(SPEC.PRESETS.map((p, i) => () => run1('js', i, 0.5, 0.3)), PROCS, (d, n) => { if (d % 20 === 0) process.stdout.write(`rank ${d}/${n}\r`); });
    rank = r.map(x => ({ idx: x.idx, mean: x.mean })).sort((a, b) => b.mean - a.mean);
    fs.mkdirSync(path.dirname(rankFile), { recursive: true });
    fs.writeFileSync(rankFile, JSON.stringify(rank));
  }
  const heavy = rank.slice(0, HEAVY).map(x => x.idx);
  const byName = new Map(SPEC.PRESETS.map((p, i) => [p.name, i]));
  (SPEC.DEMO_PRESETS || []).forEach((p, k) => byName.set(p.name, 1000 + k));   // the demo's own presets first, as app.js demoPreset
  const presetOf = i => (i >= 1000 ? SPEC.DEMO_PRESETS[i - 1000] : SPEC.PRESETS[i]);
  const tour = SPEC.TOUR.map(nm => byName.get(nm)).filter(i => i !== undefined);
  const missing = SPEC.TOUR.filter(nm => !byName.has(nm));
  const rows = [...heavy.map(i => ({ group: 'heavy', idx: i })), ...tour.map(i => ({ group: 'demo', idx: i }))];
  // 2. every (row, engine) REPS times, engines interleaved
  const jobs = [];
  for (let r = 0; r < REPS; r++) for (const row of rows) for (const e of (r % 2 ? ENGINES.slice().reverse() : ENGINES)) jobs.push(() => run1(e, row.idx, SECS, 0.5).then(x => ({ row, x })));
  const res = await pool(jobs, PROCS, (d, n) => { if (d % 10 === 0) process.stdout.write(`measure ${d}/${n}\r`); });
  const table = rows.map(row => {
    const o = { group: row.group, idx: row.idx, name: presetOf(row.idx).name };
    for (const e of ENGINES) {
      const xs = res.filter(r => r.row === row && r.x.eng === e).map(r => r.x);
      o[e] = { med: med(xs.map(x => x.med)), mean: med(xs.map(x => x.mean)), p99: med(xs.map(x => x.p99)), max: med(xs.map(x => x.max)) };
      if (e !== 'js') { o[e].copyMs = med(xs.map(x => x.copyMs)); o[e].wasmBuildMs = med(xs.map(x => x.wasmBuildMs)); o[e].memMB = med(xs.map(x => x.memMB)); }
      else o.buildMs = med(xs.map(x => x.buildMs));
      o.sets = xs[0].sets;
    }
    return o;
  });
  fs.writeFileSync(OUT, JSON.stringify({ reps: REPS, procs: PROCS, secs: SECS, missingTour: missing, table }, null, 1));
  const f = v => v.toFixed(3);
  const budget = 128 / 48000 * 1000;
  console.log(`\nms per 128-sample quantum (budget ${budget.toFixed(2)} ms), dense 16-voice chord, median of ${REPS} fresh processes (${PROCS} side by side)`);
  console.log('group | preset | sets | core.js | WASM scalar | WASM simd | speed-up simd (scalar) | p99 js / simd | build js / wasm ms | copy ms');
  for (const o of table) console.log(`${o.group.padEnd(5)} | ${o.name.slice(0, 34).padEnd(34)} | ${String(o.sets).padStart(2)} | ${f(o.js.mean)} | ${f(o.scalar.mean)} | ${f(o.simd.mean)} | ${(o.js.mean / o.simd.mean).toFixed(2)}x (${(o.js.mean / o.scalar.mean).toFixed(2)}x) | ${f(o.js.p99)} / ${f(o.simd.p99)} | ${o.buildMs.toFixed(0)} / ${o.simd.wasmBuildMs.toFixed(0)} | ${o.simd.copyMs.toFixed(1)}`);
  for (const g of ['heavy', 'demo']) {
    const t = table.filter(o => o.group === g);
    const gm = (k) => Math.exp(t.reduce((a, o) => a + Math.log(o.js.mean / o[k].mean), 0) / t.length);
    const sum = k => t.reduce((a, o) => a + o[k].mean, 0);
    console.log(`${g}: geometric-mean speed-up simd ${gm('simd').toFixed(2)}x, scalar ${gm('scalar').toFixed(2)}x; total ms js ${sum('js').toFixed(2)} scalar ${sum('scalar').toFixed(2)} simd ${sum('simd').toFixed(2)}`);
  }
  if (missing.length) console.log('tour presets not in PRESETS (demo-only, skipped):', missing.join(', '));
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
})().catch(e => { console.error(e); process.exit(1); });
