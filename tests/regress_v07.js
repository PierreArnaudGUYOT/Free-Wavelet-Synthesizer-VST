// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The 22 TOP Sounds must sound as they did in the Wavelet Synthesizer beta 0.7: renders each with that version's engine
// (tests/ref/v07, as published) and with this version's engine (the converted presets), and compares the two renders.
// Usage: node tests/regress_v07.js [tolerance, default 1e-5 of the peak]
'use strict';
const path = require('path');
const OLD_SPEC = require('./ref/v07/spec.js'), OLD = require('./ref/v07/core.js')(OLD_SPEC);
const SPEC = require('../web/js/spec.js'), C = require('../web/js/core.js')(SPEC);
const sr = 48000, n = sr * 3, blk = 128, tol = parseFloat(process.argv[2] || '1e-5');
function render(Core, values) {
  const params = Float64Array.from(values);
  const eng = new Core.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  if (Core === OLD) eng.mixSm = params[Core.P.ab_mix];   // beta 0.7 smoothed the A/B balance from its default in a new engine; this version starts at the preset's levels
  eng.setTables(Core.buildTables(params, true));
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let o = 0; o < n; o += blk) {
    if (o === 0) eng.noteOn(60, 0.9);
    if (o === 36000) eng.noteOff(60);
    if (o === 48000) { eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); }   // two notes over the first one's release: three voices (beta 0.3.2: a denser chord is scaled down, see core.js polyComp)
    if (o === 105600) eng.allNotesOff();
    eng.process(L.subarray(o, o + blk), R.subarray(o, o + blk), Math.min(blk, n - o));
  }
  return [L, R];
}
let fails = 0, worst = 0;
// beta 1.0: the TOP Sounds are sorted by the owner's stars and one was left out (unrated); the three he adjusted (SAVE PRESET) are no longer beta 0.7's sounds: they are not compared
const ADJ = require('../tools/ratings_final.js').adjusted, EDITS = require('../tools/spec.js').PRESET_EDITS || {};   // (version 1.0.11: a factory preset edited on purpose, tools/spec.js PRESET_EDITS, is no longer beta 0.7's sound either)
let compared = 0;
// version 1.0.1: the master volume of the TOP Sounds went down by whole dB where a big chord struck hard reached the output stage (tools/master_adjust.js, by name): beta 0.7's sound is compared at that master
const MA = require('../tools/master_adjust.js'), oldMaster = OLD_SPEC.PARAMS.findIndex(x => x.key === 'master');
for (let q = 0; q < OLD_SPEC.TOP; q++) {
  const p = OLD_SPEC.PRESETS[q], o = SPEC.PRESETS.slice(0, SPEC.TOP).find(x => x.name === p.name);
  if (!o) { console.log(`skip ${p.name.padEnd(26)} (left out of the final list)`); continue; }
  if (ADJ[p.name]) { console.log(`skip ${p.name.padEnd(26)} (adjusted by the owner)`); continue; }
  if (EDITS[p.name]) { console.log(`skip ${p.name.padEnd(26)} (edited at the owner's request, version 1.0.11: ${Object.keys(EDITS[p.name]).join(', ')})`); continue; }
  compared++;
  const pv = Array.from(p.values); if (MA[p.name]) pv[oldMaster] = Math.max(-36, pv[oldMaster] - MA[p.name]);
  const a = render(OLD, pv), b = render(C, o.values);
  let peak = 0, maxd = 0;
  for (let k = 0; k < 2; k++) for (let j = 0; j < n; j++) { peak = Math.max(peak, Math.abs(a[k][j])); maxd = Math.max(maxd, Math.abs(a[k][j] - b[k][j])); }
  const rel = maxd / Math.max(peak, 1e-9), ok = rel <= tol && peak > 0.01;
  if (!ok) fails++;
  worst = Math.max(worst, rel);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${o.name.padEnd(26)} peak ${peak.toFixed(3)}  max diff / peak ${rel.toExponential(2)}`);
}
console.log(fails ? `${fails} TOP Sound(s) differ from beta 0.7` : `the ${compared} TOP Sounds that are in beta 0.7 as it was match it (worst ${worst.toExponential(2)} of the peak)`);
process.exit(fails ? 1 : 0);
