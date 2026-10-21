// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The idle rule of the engine (Engine.block): an effect that has nothing left to give is not computed. Renders the same notes
// with the rule and without it (the reference engine always computes the block) and checks that the sound is the same: the delay's
// echoes that come back after a silence must not be lost, the reverb tail, the chorus. Also reports how many blocks were skipped
// and that the rate-independent smoothing leaves 48 kHz alone.
//   node tests/idle_skip.js
'use strict';
const SPEC = require('../web/js/spec.js');
const C = require('../web/js/core.js')(SPEC);
const P = C.P;
let bad = 0;
const check = (ok, what, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) bad++; };

function render(set, seconds, always, sr) {
  const params = C.defaults();
  for (const k in set) params[P[k]] = set[k];
  const eng = new C.Engine(sr || 48000);
  params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(C.buildTables(params, true));
  if (always) eng.anyVoice = () => true;   // the reference: every block is computed
  const n = Math.round((sr || 48000) * seconds), blk = 128, L = new Float32Array(n), R = new Float32Array(n);
  let skipped = 0;
  const publish = eng.publish; eng.publish = function (a, b, c) { if (this.quiet >= this.quietNeed && !c) skipped++; return publish.call(this, a, b, c); };
  for (let o = 0; o < n; o += blk) {
    if (o === 0) eng.noteOn(60, 0.8);
    if (o === 128 * 40) eng.noteOff(60);
    eng.process(L.subarray(o, o + blk), R.subarray(o, o + blk), Math.min(blk, n - o));
  }
  return { L, R, skipped, blocks: Math.ceil(n / CTRL32) };
}
const CTRL32 = 32;
function worst(a, b) { let m = 0, pk = 0; for (let i = 0; i < a.length; i++) { m = Math.max(m, Math.abs(a[i] - b[i])); pk = Math.max(pk, Math.abs(a[i])); } return { m, pk }; }

const cases = [
  ['dry', { amp_r: 0.2 }],
  ['delay 0.9 s, feedback 0.55', { fx_dmix: 0.5, fx_dfb: 0.55, fx_dtime: 0.9, amp_r: 0.2 }],
  ['delay 3 s, feedback 0.3', { fx_dmix: 0.5, fx_dfb: 0.3, fx_dtime: 3, amp_r: 0.2 }],
  ['reverb, large', { fx_rmix: 0.6, fx_rsize: 1, amp_r: 0.2 }],
  ['chorus + delay + reverb', { ch_mix: 0.6, ch_rate: 1.2, ch_depth: 0.7, fx_dmix: 0.4, fx_dfb: 0.4, fx_dtime: 0.4, fx_rmix: 0.4, amp_r: 0.2 }],
];
for (const [name, set] of cases) {
  const a = render(set, 12, false), b = render(set, 12, true);
  const dL = worst(a.L, b.L), dR = worst(a.R, b.R), d = Math.max(dL.m, dR.m);
  check(d < 2e-8 && dL.pk > 0.01, `${name}: same sound with and without the idle rule`, `max difference ${d.toExponential(2)}, peak ${dL.pk.toFixed(3)}, ${a.skipped} blocks skipped`);
}
{
  const a = render({ amp_r: 0.2 }, 12, false);
  check(a.skipped > 1000, 'a dry sound: the silence after it is skipped', `${a.skipped} blocks`);
}
{
  // the rate-independent smoothing: 48 kHz unchanged, other rates keep the time constant
  const e48 = new C.Engine(48000), e96 = new C.Engine(96000), e44 = new C.Engine(44100);
  check(e48.kDly === 0.0005 && e48.kLp === 0.35 && e48.kVol === 0.002 && e48.damp === 0.25, '48 kHz keeps the earlier constants');
  check(Math.abs(Math.pow(1 - e96.kLp, 2) - 0.65) < 1e-12 && Math.abs(Math.pow(1 - e44.kLp, 44100 / 48000) - 0.65) < 1e-12, 'the delay filter has the same cut-off at 96 and 44.1 kHz', `${e96.kLp.toFixed(4)} / ${e44.kLp.toFixed(4)}`);
}
{
  // a NaN velocity or one above 1 never reaches the voices
  const eng = new C.Engine(48000);
  const params = C.defaults(); params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(C.buildTables(params, true));
  eng.noteOn(60, NaN); eng.noteOn(62, 5); eng.keyOn(64, NaN); eng.noteOn(300, 1);
  const L = new Float32Array(2048), R = new Float32Array(2048);
  eng.process(L, R, 2048);
  let ok = true, pk = 0; for (let i = 0; i < L.length; i++) { if (!isFinite(L[i]) || !isFinite(R[i])) ok = false; pk = Math.max(pk, Math.abs(L[i])); }
  check(ok && pk <= 1 && pk > 0, 'NaN / huge velocities and a note out of range are harmless', `peak ${pk.toFixed(3)}`);
}
console.log(bad ? `${bad} FAILED` : 'idle skip: all ok');
process.exit(bad ? 1 : 0);
