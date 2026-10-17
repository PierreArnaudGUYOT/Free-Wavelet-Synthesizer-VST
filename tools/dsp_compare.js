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
function compare(values, idx, name) {
  const params = Float64Array.from(values);
  const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(C.buildTables(params, true));
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let o = 0; o < n; o += blk) {
    if (o === 0) eng.noteOn(60, 0.9);
    if (o === 36000) eng.noteOff(60);
    if (o === 48000) { eng.noteOn(57, 0.8); eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); }
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
console.log(fails ? `${fails} mismatch(es)` : `C++ port matches the JS reference (worst ${worst.toExponential(2)})`);
process.exit(fails ? 1 : 0);
