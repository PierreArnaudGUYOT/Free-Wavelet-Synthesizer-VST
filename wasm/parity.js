// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: the C++ engine compiled to WebAssembly against the JS reference (core.js), on the cases of the C++ <-> JS cross-check (tools/dsp_cases.js:
// every factory preset, then the variants: LFO targets, phase, morph, three oscillators, tempo sync, the chord keyboard, the filter, the oriental tunings, the loud
// chords and the output stage), with the same scripts as tools/dsp_compare.js. The tables are built by core.js and copied into the module (the web app's path);
// --wasm-tables builds them in the module instead.
//   node wasm/parity.js [--build scalar|simd] [--every k] [--wasm-tables] [--tol 2e-6]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web/js/spec.js'));
const C = require(path.join(ROOT, 'web/js/core.js'))(SPEC);
const WSWasmEngine = require(path.join(ROOT, 'web/js/wasm_engine.js'));
const cases = require(path.join(ROOT, 'tools/dsp_cases.js'))(SPEC, C);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const BUILD = arg('build', 'simd'), EVERY = +arg('every', 1), TOL = +arg('tol', 2e-6), WASM_TABLES = process.argv.includes('--wasm-tables');
const mod = new WebAssembly.Module(fs.readFileSync(path.join(__dirname, 'out', `engine_${BUILD}.wasm`)));
const sr = 48000, n = sr * 3, blk = 128;
const CHORD_SCRIPT = [
  [0, 0, 48, 1], [0, 0, 67, 0.9], [12800, 0, 64, 0.7], [19200, 2, 74, 0.8], [22400, 3, 74, 0], [22400, 2, 79, 0.8],
  [25600, 3, 79, 0], [25600, 1, 67, 0], [38400, 1, 64, 0], [38400, 0, 55, 1], [38400, 0, 60, 0.8], [64000, 1, 60, 0],
  [70400, 0, 72, 0.85], [70400, 0, 40, 0.6], [105600, 4, 0, 0]];
const LIVE_SCRIPT = [
  [0, 0, 48, 1], [0, 0, 67, 0.9], [12800, 0, 51, 1], [25600, 0, 50, 1], [38400, 0, 59, 1], [51200, 0, 53, 1],
  [64000, 5, 'chord_bass', 0], [70400, 5, 'chord_bass', 1], [76800, 0, 56, 1], [83200, 5, 'chord_voicing', 0], [89600, 0, 49, 1],
  [96000, 1, 67, 0], [100000, 4, 0, 0]];
const LOUD_SCRIPT = [
  [0, 1, 72, 1], [0, 1, 76, 1], [0, 1, 79, 1], [19200, 1, 84, 1], [19200, 1, 88, 1], [38400, 1, 60, 1], [38400, 1, 64, 1], [38400, 1, 67, 1],
  [72000, 0, 72, 0], [72000, 0, 76, 0], [72000, 0, 79, 0], [72000, 0, 84, 0], [72000, 0, 88, 0], [96000, 0, 60, 0], [96000, 0, 64, 0], [96000, 0, 67, 0]];
function render(eng, c, tables) {
  if (tables) eng.setTables(tables);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let o = 0; o < n; o += blk) {
    if (c.kind === 'chordlive') {
      for (const [eo, kind, note, vel] of LIVE_SCRIPT) if (eo === o) {
        if (kind === 0) eng.keyOn(note, vel); else if (kind === 1) eng.keyOff(note); else if (kind === 4) eng.allNotesOff(); else eng.setParam(C.P[note], vel);
      }
    } else if (c.kind === 'loud') {
      for (const [eo, on, note, vel] of LOUD_SCRIPT) if (eo === o) { if (on) eng.noteOn(note, vel); else eng.noteOff(note); }
    } else if (c.kind === 'chord') {
      for (const [eo, kind, note, vel] of CHORD_SCRIPT) if (eo === o) {
        if (kind === 0) eng.keyOn(note, vel); else if (kind === 1) eng.keyOff(note);
        else if (kind === 2) eng.plateOn(note, vel); else if (kind === 3) eng.plateOff(note); else eng.allNotesOff();
      }
    } else {
      if (o === 0) eng.noteOn(60, 0.9);
      if (o === 36000) eng.noteOff(60);
      if (o === 48000) { eng.noteOn(57, 0.8); eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); }
      if (o === 105600) eng.allNotesOff();
    }
    eng.process(L.subarray(o, o + blk), R.subarray(o, o + blk), Math.min(blk, n - o));
  }
  return [L, R];
}
let worst = 0, worstName = '', fails = 0, checked = 0, bitExact = 0;
const t0 = Date.now();
cases.forEach((c, idx) => {
  if (idx % EVERY) return;
  checked++;
  const params = Float64Array.from(c.values);
  const js = new C.Engine(sr); params.forEach((v, i) => js.setParam(i, v)); js.setTempo(c.tempo);
  const tb = C.buildTables(params, true);
  const wa = WSWasmEngine(mod, sr); params.forEach((v, i) => wa.setParam(i, v)); wa.setTempo(c.tempo);
  if (WASM_TABLES) wa.buildTables(params); else wa.setTables(tb);
  const [jl, jr] = render(js, c, tb);
  const [wl, wr] = render(wa, c, null);
  let maxd = 0, peak = 0, same = true;
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(wl[i] - jl[i]), Math.abs(wr[i] - jr[i]));
    if (d > maxd) maxd = d;
    if (wl[i] !== jl[i] || wr[i] !== jr[i]) same = false;
    peak = Math.max(peak, Math.abs(jl[i]));
  }
  if (same) bitExact++;
  const ok = maxd < TOL && peak > 0.001 && Number.isFinite(maxd);
  if (!ok) fails++;
  if (maxd > worst) { worst = maxd; worstName = c.name; }
  if (!ok || idx % 25 === 0 || idx >= SPEC.PRESETS.length) console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(idx).padStart(3)} ${c.kind.padEnd(9)} ${c.name.slice(0, 52).padEnd(52)} max |WASM - JS| = ${maxd.toExponential(2)} (peak ${peak.toFixed(3)})${same ? ' bit-exact' : ''}`);
});
console.log(`${BUILD}${WASM_TABLES ? ' (tables built in WASM)' : ''}: ${fails ? fails + ' mismatch(es)' : 'all match'} in ${checked} cases, worst ${worst.toExponential(2)} (${worstName}), ${bitExact} bit-exact, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails ? 1 : 0);
