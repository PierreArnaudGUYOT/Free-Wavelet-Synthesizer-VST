// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: the copy of the tables into the module, as the worklet drives it (web/js/wasm_engine.js stage / pump / setTablesLater / setTables), against core.js:
// a series of preset changes and knob rebuilds while a chord plays must give the JS engine's sound (the same tables at the same quanta: a 'tables' rebuild is played
// by both when the WebAssembly copy is complete), leave no bundle behind, and the time of one quantum's copy (pump) and of a whole synchronous copy is measured.
//   node wasm/stage_check.js [--build simd|scalar]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web/js/spec.js'));
const C = require(path.join(ROOT, 'web/js/core.js'))(SPEC);
const WSWasmEngine = require(path.join(ROOT, 'web/js/wasm_engine.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const mod = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, 'out', `engine_${arg('build', 'simd')}.wasm`)));
const sr = 48000, Q = 128, now = () => Number(process.hrtime.bigint()) / 1e6;
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
// the heaviest presets by number of table sets (variants x WAVELET 2), and a few light ones
const sets = tb => tb.slots.reduce((a, t) => a + (t ? 1 + (t.w2 ? 1 : 0) + (t.ph ? t.ph.length * (t.w2 && t.w2.ph ? 2 : 1) : 0) : 0), 0);
const scan = SPEC.PRESETS.map((p, i) => ({ i, n: sets(C.buildTables(Float64Array.from(p.values), true)) })).sort((a, b) => b.n - a.n);
const order = [scan[0].i, scan[scan.length - 1].i, scan[1].i, scan[40].i, scan[2].i, scan[100].i];
console.log('presets:', order.map(i => `${SPEC.PRESETS[i].name} (${scan.find(s => s.i === i).n} sets)`).join(', '));
// 1. the time of a whole synchronous copy and of one pump step, heaviest preset
{
  const p = Float64Array.from(SPEC.PRESETS[scan[0].i].values);
  const w = WSWasmEngine(mod, sr);
  const tb = C.buildTables(p, true);
  let t = now(); w.setTables(tb); const first = now() - t;
  const tb2 = C.buildTables(p, true);
  t = now(); w.setTables(tb2); const second = now() - t;
  const tb3 = C.buildTables(p, true);
  w.setTablesLater(tb3);
  let worst = 0, steps = 0;
  const L = new Float32Array(Q), R = new Float32Array(Q);
  while (w.pendingCopies()) { t = now(); w.pump(); worst = Math.max(worst, now() - t); steps++; w.process(L, R, Q); }
  console.log(`heaviest preset (${scan[0].n} sets, ${(scan[0].n * 1.08).toFixed(0)} MB): synchronous copy ${first.toFixed(1)} ms (memory growing), ${second.toFixed(1)} ms (again); spread: ${steps} quanta, worst step ${worst.toFixed(2)} ms; memory ${(w.memoryBytes() / 1048576).toFixed(0)} MB, bundles alive ${w.bundlesAlive()}`);
  check(w.bundlesAlive() <= 2, 'no more than two bundles alive (the crossfade)');
}
// 2. the worklet's sequence on both engines: chord held; every 40 quanta a preset change ('bulk': stage, then setTables 6 quanta later as the dip does) or a knob's rebuild ('tables')
{
  const js = new C.Engine(sr), wa = WSWasmEngine(mod, sr);
  const set = (vals) => vals.forEach((v, i) => { js.setParam(i, v); wa.setParam(i, v); });
  let v = Float64Array.from(SPEC.PRESETS[order[0]].values);
  set(v);
  let tb = C.buildTables(v, true);
  js.setTables(tb); wa.setTables(tb);
  for (const n of [48, 55, 60, 64, 67]) { js.noteOn(n, 0.8); wa.noteOn(n, 0.8); }
  const jl = new Float32Array(Q), jr = new Float32Array(Q), wl = new Float32Array(Q), wr = new Float32Array(Q);
  let worst = 0, pendingBulk = null, pendingTables = null, change = 0;
  for (let q = 0; q < 40 * 12; q++) {
    wa.pump();
    if (q % 40 === 0 && q) {
      change++;
      if (change % 2) {   // a preset change: staged now, applied 6 quanta later (both engines at the same quantum)
        v = Float64Array.from(SPEC.PRESETS[order[change % order.length]].values);
        const t2 = C.buildTables(v, true);
        wa.stage(t2);
        pendingBulk = { at: q + 6, v, tb: t2 };
      } else {             // a knob's rebuild (the same preset, another sparsity): the JS engine takes it when the WebAssembly copy is over
        const v2 = Float64Array.from(v); v2[C.P.a_sparsity] = Math.min(1, v2[C.P.a_sparsity] + 0.2);
        const t2 = C.buildTables(v2, true);
        set(v2); v = v2;
        wa.setTablesLater(t2);
        pendingTables = t2;
      }
    }
    if (pendingBulk && q === pendingBulk.at) { set(pendingBulk.v); js.setTables(pendingBulk.tb); wa.setTables(pendingBulk.tb); pendingBulk = null; }
    if (pendingTables && !wa.pendingCopies()) { js.setTables(pendingTables); pendingTables = null; }
    js.process(jl, jr, Q); wa.process(wl, wr, Q);
    for (let i = 0; i < Q; i++) worst = Math.max(worst, Math.abs(jl[i] - wl[i]), Math.abs(jr[i] - wr[i]));
  }
  check(worst < 2e-6, `worklet sequence (11 changes, heavy and light presets, knob rebuilds): max |WASM - JS| = ${worst.toExponential(2)}`);
  check(wa.bundlesAlive() <= 2 && wa.pendingCopies() === 0, `bundles alive at the end: ${wa.bundlesAlive()}, copies pending ${wa.pendingCopies()}`);
}
console.log(fails ? `${fails} check(s) failed` : 'stage check passed');
process.exit(fails ? 1 : 0);
