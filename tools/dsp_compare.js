// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// C++ <-> JS cross-check of the engine. The cases are in tools/dsp_cases.js.
//   node tools/dsp_compare.js --list <dir>   writes <dir>/cases.txt (read by vst/devtest/dsp_render.cpp)
//   node tools/dsp_compare.js <dir> [i/n]    renders the cases with the JS core and compares them with <dir>/cpp_NNN.raw (only the cases whose number is i modulo n: tests/quick.js runs the shards side by side)
// Every case must match within TOL (2e-6 of full scale): the C++ and JS engines do the same operations in the same order, the
// remaining differences are float rounding of the buffers and the maths libraries.
'use strict';
const fs = require('fs'), path = require('path');
const SPEC = require('../web/js/spec.js');
const C = require('../web/js/core.js')(SPEC);
const cases = require('./dsp_cases.js')(SPEC, C);
const TOL = 2e-6;
if (process.argv[2] === '--list') {
  const dir = process.argv[3];
  // one case per line: kind tempo value x NP | name   (the values with 17 digits: the exact doubles)
  const lines = cases.map(c => `${c.kind} ${c.tempo} ${c.values.map(v => (Number.isInteger(v) ? String(v) : v.toPrecision(17))).join(' ')} | ${c.name}`);
  fs.writeFileSync(path.join(dir, 'cases.txt'), lines.join('\n') + '\n');
  console.log(`${cases.length} cases written to ${path.join(dir, 'cases.txt')}`);
  process.exit(0);
}
const dir = process.argv[2];
const sr = 48000, n = sr * 3, blk = 128;
// kind 0 keyOn, 1 keyOff, 2 plateOn, 3 plateOff, 4 allNotesOff
const CHORD_SCRIPT = [
  [0, 0, 48, 1], [0, 0, 67, 0.9], [12800, 0, 64, 0.7], [19200, 2, 74, 0.8], [22400, 3, 74, 0], [22400, 2, 79, 0.8],
  [25600, 3, 79, 0], [25600, 1, 67, 0], [38400, 1, 64, 0], [38400, 0, 55, 1], [38400, 0, 60, 0.8], [64000, 1, 60, 0],
  [70400, 0, 72, 0.85], [70400, 0, 40, 0.6], [105600, 4, 0, 0]];
// kind 'chordlive' (beta 0.2): the held chord changes while the root is held (selector keys, then BASS and VOICING switched live);
// kind 5 = setParam(note = parameter key index, vel = value)
const LIVE_SCRIPT = [
  [0, 0, 48, 1], [0, 0, 67, 0.9], [12800, 0, 51, 1], [25600, 0, 50, 1], [38400, 0, 59, 1], [51200, 0, 53, 1],
  [64000, 5, 'chord_bass', 0], [70400, 5, 'chord_bass', 1], [76800, 0, 56, 1], [83200, 5, 'chord_voicing', 0], [89600, 0, 49, 1],
  [96000, 1, 67, 0], [100000, 4, 0, 0]];
// kind 'loud' (beta 0.3.2): dense chords played with MIDI notes at velocity 1: [offset, 1 on / 0 off, note, velocity]
const LOUD_SCRIPT = [
  [0, 1, 72, 1], [0, 1, 76, 1], [0, 1, 79, 1], [19200, 1, 84, 1], [19200, 1, 88, 1], [38400, 1, 60, 1], [38400, 1, 64, 1], [38400, 1, 67, 1],
  [72000, 0, 72, 0], [72000, 0, 76, 0], [72000, 0, 79, 0], [72000, 0, 84, 0], [72000, 0, 88, 0], [96000, 0, 60, 0], [96000, 0, 64, 0], [96000, 0, 67, 0]];
const SHARD = (process.argv[3] || '0/1').split('/').map(Number);
let worst = 0, fails = 0, checked = 0;
cases.forEach((c, idx) => {
  if (SHARD[1] > 1 && idx % SHARD[1] !== SHARD[0]) return;
  checked++;
  const params = Float64Array.from(c.values);
  const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  eng.setTempo(c.tempo);   // 0 = no tempo (the factory presets, the web app)
  eng.setTables(C.buildTables(params, true));
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
  const buf = fs.readFileSync(path.join(dir, `cpp_${String(idx).padStart(3, '0')}.raw`));
  let maxd = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const cl = buf.readFloatLE(i * 8), cr = buf.readFloatLE(i * 8 + 4);
    maxd = Math.max(maxd, Math.abs(cl - L[i]), Math.abs(cr - R[i]));
    peak = Math.max(peak, Math.abs(L[i]));
  }
  const ok = maxd < TOL && peak > 0.001;
  if (!ok) fails++;
  worst = Math.max(worst, maxd);
  if (!ok || idx % 20 === 0 || idx >= SPEC.PRESETS.length) console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(idx).padStart(3)} ${c.name.padEnd(46)} max |C++ - JS| = ${maxd.toExponential(2)} (peak ${peak.toFixed(3)})`);
});
console.log(fails ? `${fails} mismatch(es) in ${checked} cases` : `C++ port matches the JS reference in ${checked} cases (worst ${worst.toExponential(2)})`);
process.exit(fails ? 1 : 0);
