// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: ONE measure in a fresh process (wasm/bench.js runs it): a preset played as a dense chord of 16 voices at 48 kHz, rendered in quanta of 128 samples as
// the AudioWorklet does, with core.js (js) or the WebAssembly engine (scalar / simd). Prints one JSON line: the time of each quantum (median, mean, p99, max, in ms), the
// table build (core.js), the copy of the tables into the module, and the build of the same tables by the C++ code in WebAssembly.
//   node wasm/bench_one.js <js|scalar|simd> <preset index> [--secs 2] [--warm 0.5]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web/js/spec.js'));
const C = require(path.join(ROOT, 'web/js/core.js'))(SPEC);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const ENG = process.argv[2], IDX = +process.argv[3], SECS = +arg('secs', 2), WARM = +arg('warm', 0.5);
const sr = 48000, Q = 128;
const NOTES = [36, 43, 48, 52, 55, 60, 64, 67, 71, 72, 76, 79, 83, 84, 88, 91];
const now = () => Number(process.hrtime.bigint()) / 1e6;
const presetOf = i => (i >= 1000 ? SPEC.DEMO_PRESETS[i - 1000] : SPEC.PRESETS[i]);   // 1000 + k: the demo's own presets (app.js demoPreset looks there first)
const params = Float64Array.from(presetOf(IDX).values);
params[C.P.v_voices] = 16;   // every note of the chord sounds
let t = now();
const tb = C.buildTables(params, true);
const buildMs = now() - t;
let eng, copyMs = 0, wasmBuildMs = 0, memMB = 0;
if (ENG === 'js') {
  eng = new C.Engine(sr);
  params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(tb);
} else {
  const WSWasmEngine = require(path.join(ROOT, 'web/js/wasm_engine.js'));
  const mod = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, 'out', `engine_${ENG}.wasm`)));
  eng = WSWasmEngine(mod, sr);
  params.forEach((v, i) => eng.setParam(i, v));
  t = now(); eng.buildOnly(params); wasmBuildMs = now() - t;
  t = now(); eng.setTables(tb); copyMs = now() - t;
  memMB = eng.memoryBytes() / 1048576;
}
const L = new Float32Array(Q), R = new Float32Array(Q);
for (const nn of NOTES) eng.noteOn(nn, 0.9);
const warmQ = Math.round(WARM * sr / Q), nQ = Math.round(SECS * sr / Q), times = new Float64Array(nQ);
for (let q = 0; q < warmQ; q++) eng.process(L, R, Q);
let peak = 0;
for (let q = 0; q < nQ; q++) {
  const a = now();
  eng.process(L, R, Q);
  times[q] = now() - a;
  for (let i = 0; i < Q; i++) peak = Math.max(peak, Math.abs(L[i]));
}
const s = Array.from(times).sort((a, b) => a - b);
const mean = s.reduce((a, b) => a + b, 0) / nQ;
console.log(JSON.stringify({ eng: ENG, idx: IDX, med: s[nQ >> 1], mean, p99: s[Math.floor(nQ * 0.99)], max: s[nQ - 1], buildMs, copyMs, wasmBuildMs, memMB, peak,
  sets: tb.slots.reduce((a, t2) => a + (t2 ? 1 + (t2.w2 ? 1 : 0) + (t2.ph ? t2.ph.length * (t2.w2 && t2.w2.ph ? 2 : 1) : 0) : 0), 0) }));
