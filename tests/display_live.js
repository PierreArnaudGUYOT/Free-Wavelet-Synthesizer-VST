// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// display_live.js - the SCOPE and the SCALOGRAM of Okto MultiWave Synth move with the sound (beta 0.3.1; beta 0.3 had made them static, a regression): while a note plays, the engine
// publishes the live gains and window of every oscillator that plays in the last voice (Engine.disp.sg / swin / mask), these move with the modulation (an LFO on the cutoff, the
// mod envelope), and core.js globalCycle / scopeBands draw them instead of the static gains. The C++ editor does the same (vst/src/editor.cpp: scopeLive).
//   node tests/display_live.js
'use strict';
const path = require('path');
const SPEC = require(path.join(__dirname, '..', 'web', 'js', 'spec.js'));
const C = require(path.join(__dirname, '..', 'web', 'js', 'core.js'))(SPEC);
const P = C.P, sr = 48000;
let fails = 0;
const check = (ok, what, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) fails++; };

const v = Float64Array.from(SPEC.PARAMS.map(p => p.def));
const set = (k, x) => { v[P[k]] = x; };
set('a1_lvl', 1); set('a2_lvl', 0.8); set('b1_lvl', 0); set('f_cutoff', 5.5); set('lfo_cut', 3); set('lfo_rate', 2); set('amp_a', 0.01); set('amp_s', 1);
set('a2_f_cutoff', 6.5);
const eng = new C.Engine(sr); v.forEach((x, i) => eng.setParam(i, x));
const tb = C.buildTables(v, true); eng.setTables(tb);

console.log('1. a note plays: the engine publishes the live gains of the oscillators that play');
eng.noteOn(60, 0.9);
const L = new Float32Array(128), R = new Float32Array(128);
const seen = [];
for (let k = 0; k < 400; k++) {   // 1.07 s of audio: two cycles of the LFO
  eng.process(L, R, 128);
  if (k % 8 === 7) seen.push({ mask: eng.disp.mask, g1: Array.from(eng.disp.sg.slice(0, C.NB)), g2: Array.from(eng.disp.sg.slice(C.NB, 2 * C.NB)) });
}
check(seen.every(s => s.mask === 3), 'the mask holds the two oscillators that play (A1, A2)', String(seen[0].mask));
const spread = (key, b) => { const xs = seen.map(s => s[key][b]); return Math.max(...xs) - Math.min(...xs); };
check(Math.max(...Array.from({ length: C.NB }, (_, b) => spread('g1', b))) > 0.05, 'the live gains of A1 move over time (the LFO moves its cutoff)', Math.max(...Array.from({ length: C.NB }, (_, b) => spread('g1', b))).toFixed(3));
check(Math.max(...Array.from({ length: C.NB }, (_, b) => spread('g2', b))) > 0.05, 'the live gains of A2 move too');

console.log('2. the displays draw the live gains');
const sets = C.buildScopeSets(Float64Array.from(v));
const y0 = C.globalCycle(v, sets, new Float64Array(C.N));
const live = (i) => ({ mask: seen[i].mask, sg: Float32Array.from([...seen[i].g1, ...seen[i].g2, ...new Array(C.NB * (C.NS - 2)).fill(0)]), win: new Float32Array(C.NS * 3) });
let diff = 0, ya = null;
for (let i = 0; i < seen.length; i++) { const y = C.globalCycle(v, sets, new Float64Array(C.N), live(i)); if (ya) { let d = 0; for (let j = 0; j < C.N; j++) d = Math.max(d, Math.abs(y[j] - ya[j])); diff = Math.max(diff, d); } ya = y; }
check(diff > 0.02, 'the scope cycle changes from one moment to the next', diff.toFixed(3));
const b0 = C.scopeBands(v, sets, live(0)), b1 = C.scopeBands(v, sets, live(Math.floor(seen.length / 2)));
let sdiff = 0; for (let o = 0; o < b0.length; o++) for (let b = 0; b < C.NB; b++) sdiff = Math.max(sdiff, Math.abs(b0[o].sc[b] - b1[o].sc[b]));
check(sdiff > 1e-4, 'the scalogram scales change from one moment to the next', sdiff.toExponential(2));
const yNo = C.globalCycle(v, sets, new Float64Array(C.N), null), same = yNo.every((x, j) => x === y0[j]);
check(same, 'without a live voice (null) the static display is exactly what it was');

console.log('3. the note is released and the voice dies: the displays go back to the static gains');
eng.noteOff(60);
for (let k = 0; k < 1500 && eng.disp.mask; k++) eng.process(L, R, 128);
check(eng.disp.mask === 0, 'the mask is empty once no voice is active', String(eng.disp.mask));

console.log('4. CHORD MODE: the selector key of the left hand (no sound) is lit while it is held (the keyboard of the panel reads it from keys / selHeld)');
{
  const w = Float64Array.from(v); w[P.chord_mode] = 1; w[P.chord_type] = 0;
  const e2 = new C.Engine(sr); w.forEach((x, i) => e2.setParam(i, x)); e2.setTables(C.buildTables(w, true));
  const base = e2.chordBase(), sel = base + 4, root = base + 12 + 7;
  e2.keyOn(sel, 0.9);
  check(e2.selHeld[sel] === 1 && !e2.keys[sel], 'a selector key held is in selHeld and makes no sound (not in keys)');
  e2.keyOn(root, 0.9);
  for (let k = 0; k < 4; k++) e2.process(L, R, 128);
  check(e2.selHeld[sel] === 1 && e2.keys[root] === 1, 'the selector key stays lit while the root plays the chord', 'root ' + e2.keys[root]);
  e2.keyOff(sel);
  check(e2.selHeld[sel] === 0, 'the selector key goes out when it is released');
  e2.keyOn(sel, 0.9); e2.setParam(P.chord_mode, 0); e2.keyOff(sel);
  check(e2.selHeld[sel] === 0, 'released after CHORD was switched off: not left lit');
  e2.setParam(P.chord_mode, 1); e2.keyOn(base + 2, 0.9); e2.chordClear();
  check(e2.selHeld.every(x => x === 0), 'allNotesOff forgets the lit selector keys');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
