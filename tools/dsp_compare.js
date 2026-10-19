// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Renders the same scenario as vst/devtest/dsp_render.cpp with the JS core and compares.
// beta 0.3: then LFO 2 on each of its targets (no factory preset uses it yet), on presets of both engines.
// Usage: node tools/dsp_compare.js <dir-with-cpp-raw-files>
'use strict';
const fs = require('fs'), path = require('path');
const SPEC = require('../web/js/spec.js');
const C = require('../web/js/core.js')(SPEC);
const dir = process.argv[2];
const sr = 48000, n = sr * 3, blk = 128;
let worst = 0, fails = 0;
// scenario 1 (beta 0.7.1, chord crackle): a 6-note chord, released at 1.5 s, a note over its release tails at 1.6 s
function compare(values, idx, name, tempo = 0, scenario = 0) {
  const params = Float64Array.from(values);
  const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  eng.setTempo(tempo);   // beta 0.6: 0 = no tempo (the factory presets, the web app)
  eng.setTables(C.buildTables(params, true));
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let o = 0; o < n; o += blk) {
    if (scenario === 0) {
      if (o === 0) eng.noteOn(60, 0.9);
      if (o === 36000) eng.noteOff(60);
      if (o === 48000) { eng.noteOn(57, 0.8); eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); }
    } else {
      const chord = [48, 55, 60, 64, 67, 72];
      if (o === 0) for (const k of chord) eng.noteOn(k, 0.9);
      if (o === 72000) for (const k of chord) eng.noteOff(k);
      if (o === 76800) eng.noteOn(76, 0.7);
    }
    if (o === 105600) eng.allNotesOff();
    eng.process(L.subarray(o, o + blk), R.subarray(o, o + blk), Math.min(blk, n - o));
  }
  const buf = fs.readFileSync(path.join(dir, `cpp_${String(idx).padStart(2, '0')}.raw`));
  let maxd = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const cl = buf.readFloatLE(i * 8), cr = buf.readFloatLE(i * 8 + 4);
    maxd = Math.max(maxd, Math.abs(cl - L[i]), Math.abs(cr - R[i]));
    peak = Math.max(peak, Math.abs(L[i]));
  }
  const ok = maxd < 1e-4;
  if (!ok) fails++;
  worst = Math.max(worst, maxd);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} max |C++ - JS| = ${maxd.toExponential(2)} (peak ${peak.toFixed(3)})`);
}
SPEC.PRESETS.forEach((pr, pi) => compare(pr.values, pi, pr.name));
const P = C.P;
SPEC.LFO2_TARGETS.forEach((target, t) => {   // the same variants as vst/devtest/dsp_render.cpp
  const pi = (t * 17) % SPEC.PRESETS.length, v = SPEC.PRESETS[pi].values.slice();
  v[P.lfo2_target] = t; v[P.lfo2_amt] = t % 2 ? -0.8 : 0.8; v[P.lfo2_rate] = 3; v[P.lfo2_shape] = t % 5;
  compare(v, SPEC.PRESETS.length + t, `LFO 2 -> ${SPEC.PARAMS[target].key}`);
});
// beta 0.4: SOURCE PHASE, static and moved by LFO 2 with WAVELET MORPH and A/B MIX (every phase-set slot); the same
// variants as vst/devtest/dsp_render.cpp
const PHT = SPEC.LFO2_TARGETS.indexOf(P.a_phase);
[
  ['phase 37/2048, Haar saw', { wavelet: 0, a_wave: 0, a_phase: 37 / 2048, f_cutoff: 5 }],
  ['phase 0.3, noise', { wavelet: 1, a_wave: 5, a_phase: 0.3, a_sparsity: 0.4 }],
  ['LFO 2 -> phase + morph', { wavelet: 0, wav2: 2, wmorph: 0.4, a_phase: 0.1, lfo2_target: PHT, lfo2_amt: 0.7, lfo2_rate: 2.5, lfo2_shape: 0 }],
  ['LFO 2 -> phase + A/B mix', { engine: 1, ab_mix: 0.5, wav2: 1, wmorph: 0.5, a_phase: 0.62, lfo2_target: PHT, lfo2_amt: -0.6, lfo2_rate: 4, lfo2_shape: 1 }],
].forEach(([name, set], j) => {
  const v = SPEC.PRESETS[0].values.slice();
  for (const [k, x] of Object.entries(set)) v[P[k]] = x;
  compare(v, SPEC.PRESETS.length + SPEC.LFO2_TARGETS.length + j, name);
});
// beta 0.6: TEMPO SYNC of the delay and both LFOs at a tempo; the same variants as vst/devtest/dsp_render.cpp
[
  ['sync delay 1/8 D @120', 120, { fx_dsync: 1, fx_ddiv: 7, fx_dmix: 0.4, fx_dfb: 0.5 }],
  ['sync LFO 1 1/16 @97', 97, { lfo_sync: 1, lfo_div: 13, lfo_cut: 3, lfo_pitch: 30 }],
  ['sync LFO 2 1/8 T + delay 1/1 @133', 133, { lfo2_sync: 1, lfo2_div: 12, lfo2_amt: 0.7, lfo2_target: 0, fx_dsync: 1, fx_ddiv: 13, fx_dmix: 0.3 }],
].forEach(([name, tempo, set], k) => {
  const v = SPEC.PRESETS[0].values.slice();
  for (const [key, x] of Object.entries(set)) v[P[key]] = x;
  compare(v, SPEC.PRESETS.length + SPEC.LFO2_TARGETS.length + 4 + k, name, tempo);
});
// beta 0.7.1: the chord compensation (going down, back up over release tails, a note over the tails, no voice left); the
// same presets as vst/devtest/dsp_render.cpp
['B · Church Organ', 'B · Full Drawbar Organ', 'B · Theatre Organ', 'A · Warm Pad', 'AB · Glass Choir'].forEach((nm, j) => {
  const pi = Math.max(0, SPEC.PRESETS.findIndex(p => p.name === nm));
  compare(SPEC.PRESETS[pi].values, SPEC.PRESETS.length + SPEC.LFO2_TARGETS.length + 4 + 3 + j, '6 notes: ' + nm, 0, 1);
});
console.log(fails ? `${fails} mismatch(es)` : `C++ port matches the JS reference (worst ${worst.toExponential(2)})`);
process.exit(fails ? 1 : 0);
