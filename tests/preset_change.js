// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The preset change of the web app (version 1.0.6), on the real audio worklet (web/js/worklet.js, run here without a browser): under sounding notes a change of preset made a click in the
// sound at every change (a new filter cutoff, drive, scale filter, effects, unison count ... taken at once by the engine) and the "buzz" of the demo. Now the change is ONE message ('bulk':
// the parameters and the tables), the output dips for 35 ms around it, the continuous parameters travel to their new values in 64 ms and the choices and the tables change at the bottom of
// the dip. The old way (one 'p' message per parameter, then the tables) is still understood, and is what this test compares with. The engine is the same as the plug-in's: only the
// way the web app hands it a new sound changed.
//   node tests/preset_change.js
'use strict';
const fs = require('fs');
const path = require('path');
const SPEC = require('../web/js/spec.js'), CF = require('../web/js/core.js'), C = CF(SPEC), P = C.P;
const sr = 48000, Q = 128;
let bad = 0;
const check = (ok, what, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) bad++; };

global.WSCoreFactory = CF; global.sampleRate = sr; global.currentFrame = 0;
global.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {}, onmessage: null }; } };
global.registerProcessor = (n, c) => { global.WSProc = c; };
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'web', 'js', 'worklet.js'), 'utf8') + ';WSWorkletMain();');
const Proc = global.WSProc;

const valuesOf = (name) => {
  const src = SPEC.DEMO_PRESETS.find(p => p.name === name) || SPEC.PRESETS.find(p => p.name === name);
  if (!src) throw new Error('no preset ' + name);
  const v = Float64Array.from(src.values);
  v[P.v_voices] = 16;
  return v;
};
const tables = {};
const tablesOf = (name, v) => tables[name] || (tables[name] = C.buildTables(v, true));
const CHORD = [48, 55, 60, 64, 67];

// Plays a held chord with `from`, changes to `to` at 1.5 s the new way ('bulk') or the old way ('p' messages, then the tables); returns the output and the processor.
function play(from, to, how, notes) {
  const proc = new Proc({ processorOptions: { spec: SPEC } }), send = (m) => proc.port.onmessage({ data: m });
  const vf = valuesOf(from), vt = valuesOf(to);
  vf.forEach((x, i) => send({ t: 'p', i, v: x }));
  send({ t: 'tables', tables: tablesOf(from, vf) });
  const total = Math.round(3.5 * sr), L = new Float32Array(total), R = new Float32Array(total), chg = Math.round(1.5 * sr), seen = {};
  let did = false;
  for (let s = 0; s < total; s += Q) {
    global.currentFrame = s;
    if (s === 0 && notes) for (const n of CHORD) send({ t: 'on', n, v: 0.8 });
    if (!did && s >= chg) {
      did = true;
      if (how === 'bulk') send({ t: 'bulk', v: Array.from(vt), tables: tablesOf(to, vt) });
      else { vt.forEach((x, i) => send({ t: 'p', i, v: x })); send({ t: 'tables', tables: tablesOf(to, vt) }); }
      seen.pendingAtOnce = proc.pending !== null; seen.dkAtOnce = proc.dk;
    }
    const o = [new Float32Array(Q), new Float32Array(Q)];
    proc.process([[]], [o]);
    L.set(o[0].subarray(0, Math.min(Q, total - s)), s); R.set(o[1].subarray(0, Math.min(Q, total - s)), s);
  }
  return { L, R, proc, vt, seen };
}
const d2max = (r, a, b) => { let m = 0; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) m = Math.max(m, Math.abs(r.L[i] - 2 * r.L[i - 1] + r.L[i - 2]), Math.abs(r.R[i] - 2 * r.R[i - 1] + r.R[i - 2])); return m; };
const rms = (r, a, b) => { let e = 0, n = 0; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) { e += r.L[i] * r.L[i] + r.R[i] * r.R[i]; n++; } return Math.sqrt(e / (2 * n)); };
const minBlockRms = (r, a, b) => { let m = Infinity; for (let s = Math.round(a * sr); s + Q <= Math.round(b * sr); s += Q) { let e = 0; for (let i = s; i < s + Q; i++) e += r.L[i] * r.L[i] + r.R[i] * r.R[i]; m = Math.min(m, Math.sqrt(e / (2 * Q))); } return m; };

// 1. under a held chord: the click of the change, the dip, the end state
const PAIRS = [['AA · Flint Ripple Haze', 'AB · Kalimba Lung Machine'], ['AB · Kalimba Lung Machine', 'B · Mirror Sub Bass'], ['AB · Velvet Cloud', 'B · Flute Lead'], ['A · Cello Section', 'A · Warm Pad']];
for (const [from, to] of PAIRS) {
  const n = play(from, to, 'bulk', true), o = play(from, to, 'p', true), label = `${from} > ${to}`;
  const cn = d2max(n, 1.5, 1.56), co = d2max(o, 1.5, 1.56);
  check(cn < 0.35 * co, `${label}: the click of the change is gone (second difference ${cn.toFixed(3)} against ${co.toFixed(3)} the old way)`);
  check(minBlockRms(n, 1.5, 1.545) < 0.02 * rms(n, 1.2, 1.5), `${label}: the output dips to silence around the change`, `${minBlockRms(n, 1.5, 1.545).toExponential(1)} against ${rms(n, 1.2, 1.5).toExponential(2)}`);
  const a = rms(n, 2.4, 3.4), b = rms(o, 2.4, 3.4);
  check(Math.abs(20 * Math.log10(a / b)) < 1.5, `${label}: the sound after the change is the new preset's (level ${a.toFixed(4)} against ${b.toFixed(4)} the old way)`);
  let diff = 0;
  n.proc.eng.p.forEach((x, i) => { if (Math.abs(x - n.vt[i]) > diff) diff = Math.abs(x - n.vt[i]); });
  check(diff < 1e-9, `${label}: every parameter of the engine has reached its new value`, `largest difference ${diff}`);
  check(n.proc.pending === null && n.proc.morph === null && n.proc.dk === -1, `${label}: nothing is left pending (dip, morph)`);
}
// 2. with nothing sounding the change is made at once (no dip: a reverb tail is not cut)
{
  const n = play('AA · Flint Ripple Haze', 'AB · Kalimba Lung Machine', 'bulk', false);
  check(n.seen.pendingAtOnce === false && n.seen.dkAtOnce === -1, 'no note sounding: the change is made at once, no dip');
}
// 3. the player's own move during the morph wins
{
  const proc = new Proc({ processorOptions: { spec: SPEC } }), send = (m) => proc.port.onmessage({ data: m });
  const vf = valuesOf('AA · Flint Ripple Haze'), vt = valuesOf('AB · Kalimba Lung Machine');
  vf.forEach((x, i) => send({ t: 'p', i, v: x })); send({ t: 'tables', tables: tablesOf('AA · Flint Ripple Haze', vf) });
  const key = ['vf_cut', 'master', 'fx_rmix', 'ch_mix', 'f_cutoff'].find(k => Math.abs(vf[P[k]] - vt[P[k]]) > 1e-6);
  send({ t: 'bulk', v: Array.from(vt), tables: tablesOf('AB · Kalimba Lung Machine', vt) });
  const mine = vt[P[key]] + 0.123;
  for (let s = 0; s < 3; s++) { global.currentFrame = s * Q; proc.process([[]], [[new Float32Array(Q), new Float32Array(Q)]]); }
  send({ t: 'p', i: P[key], v: mine });
  for (let s = 3; s < 200; s++) { global.currentFrame = s * Q; proc.process([[]], [[new Float32Array(Q), new Float32Array(Q)]]); }
  check(Math.abs(proc.eng.p[P[key]] - mine) < 1e-9, `a move of ${key} made during the change is kept`, `${proc.eng.p[P[key]]} against ${mine}`);
}
console.log(bad ? `${bad} failure(s)` : 'preset change test passed');
process.exit(bad ? 1 : 0);
