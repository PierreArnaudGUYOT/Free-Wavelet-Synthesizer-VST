// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// filter.js - checks of the FILTER of Okto MultiWave Synth beta 0.3 (a four-pole resonant low-pass in every voice, before the amp envelope) on the JS engine
// (the C++ port is compared with it by tools/dsp_compare.js): bypassed while open (every older sound bit-identical), the response of the ladder (-12 dB at the
// cutoff, 24 dB per octave, the resonance, the self-oscillation, the two characters), the envelope, the key tracking, LFO 2 / LFO 3 on its cutoff and resonance,
// stability under random settings.
//   node tests/filter.js
'use strict';
const path = require('path');
const SPEC = require(path.join(__dirname, '..', 'web', 'js', 'spec.js'));
const C = require(path.join(__dirname, '..', 'web', 'js', 'core.js'))(SPEC);
const P = C.P, sr = 48000;
let fails = 0;
const check = (ok, what, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) fails++; };
const db = x => 20 * Math.log10(Math.max(x, 1e-12));

const A_PRESET = SPEC.PRESETS.findIndex(p => p.name === 'A · Warm Pad');
function make(set, preset = A_PRESET) {
  const v = SPEC.PRESETS[preset].values.slice();
  // version 1.0.18: A · Warm Pad has the author's OTA filter at 1395 Hz now; the checks start from it with the FILTER open (its defaults), as it was when they were written
  if (preset === A_PRESET) for (const p of SPEC.PARAMS) if (/^vf_/.test(p.key)) v[P[p.key]] = p.def;
  for (const [k, x] of Object.entries(set)) { if (!(k in P)) throw new Error('unknown parameter ' + k); v[P[k]] = x; }
  const eng = new C.Engine(sr); v.forEach((x, i) => eng.setParam(i, x));
  const tb = C.buildTables(Float64Array.from(v), true); eng.setTables(tb);
  return { eng, tb, v };
}
function render(eng, seconds, events = []) {
  const n = Math.round(seconds * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128;
  for (let o = 0; o < n; o += blk) {
    for (const [t, f] of events) if (Math.round(t * sr / blk) * blk === o) f(eng);
    eng.process(L.subarray(o, Math.min(n, o + blk)), R.subarray(o, Math.min(n, o + blk)), Math.min(blk, n - o));
  }
  return { L, R, n };
}
const note = (n, v = 0.9) => [[0.0, e => e.noteOn(n, v)]];
// a radix-2 FFT of any power of two (the engine's own is made for its 2048-sample cycle)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// spectral centroid (Hz) of x[a, a + 8192)
function centroid(x, a) {
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[a + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  fft(re, im);
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); num += m * k * sr / N; den += m; }
  return den > 0 ? num / den : 0;
}
const diff = (a, b) => { let m = 0; for (let i = 0; i < a.n; i++) m = Math.max(m, Math.abs(a.L[i] - b.L[i]), Math.abs(a.R[i] - b.R[i])); return m; };
const SRC = { a_wave: 0, wavelet: 0, a_sparsity: 0, f_cutoff: 12, amp_a: 0.001, amp_s: 1, amp_d: 1, amp_r: 0.3, ch_mix: 0, fx_rmix: 0, fx_dmix: 0, fx_drive: 0, v_voices: 4, v_unison: 1, v_porta: 0, sub_level: 0, a1_lvl: 1 };

// ---- 1. bypassed while open
console.log('1. open: bypassed, bit-identical');
{
  const ref = render(make(SRC).eng, 1, note(57)), open = render(make(Object.assign({ vf_cut: 20000, vf_res: 0, vf_drive: 0, vf_env: 0, vf_key: 0.5, vf_type: 1 }, SRC)).eng, 1, note(57));
  check(diff(ref, open) === 0, 'cutoff 20 kHz, no resonance / drive / envelope: the same samples as without the filter (type and key tracking do not matter)');
  const on = render(make(Object.assign({ vf_cut: 20000, vf_res: 0.5 }, SRC)).eng, 1, note(57));
  check(diff(ref, on) > 0.001, 'resonance above 0 puts it in the path even at 20 kHz');
}

// ---- 2. the ladder's response (the function itself, a sine through it)
console.log('2. the response of the four poles');
function gainAt(f, k, type, comp = 1, drive = 0) {
  const g = Math.tan(Math.PI * f0 / sr), G = g / (1 + g), st = new Float64Array(8);
  let peak = 0; const n = sr, w = 2 * Math.PI * f / sr;
  for (let i = 0; i < n; i++) {
    const y = C.ladder(st, 0, Math.sin(w * i) * 0.05 * comp, G, k, type);
    if (i > n / 2) peak = Math.max(peak, Math.abs(y));
  }
  return peak / 0.05;
}
let f0 = 1000;
{
  const gc = gainAt(1000, 0, 0), g2 = gainAt(2000, 0, 0), g4 = gainAt(4000, 0, 0), g01 = gainAt(100, 0, 0);
  check(Math.abs(db(gc) + 12.04) < 1.5, 'at the cutoff the gain is -12 dB (four poles at -3 dB)', db(gc).toFixed(2) + ' dB');
  check(db(g2) - db(g4) > 20 && db(g2) - db(g4) < 28, 'about 24 dB per octave above it', (db(g2) - db(g4)).toFixed(1) + ' dB between 2 and 4 kHz');
  check(Math.abs(db(g01)) < 0.5, 'unity gain well below the cutoff', db(g01).toFixed(2) + ' dB');
  const kr = C.FLT_K * 0.8;
  const peak = gainAt(1000, kr, 0), dc = gainAt(50, kr, 0), dcOta = gainAt(50, kr, 1, 1 + 0.6 * kr);
  check(db(peak) > db(gc) + 8, 'RESO 80 %: a peak at the cutoff', db(peak).toFixed(1) + ' dB against ' + db(gc).toFixed(1));
  check(db(dc) < -8, 'LADDER: the resonance takes the low end away', db(dc).toFixed(1) + ' dB at 50 Hz');
  check(db(dcOta) > db(dc) + 6, 'OTA: the low end stays in part', db(dcOta).toFixed(1) + ' dB at 50 Hz');
}
{
  // it sings by itself at RESO 100 % (an impulse, then silence), near the cutoff
  for (const type of [0, 1]) {
    f0 = 1500;
    const g = Math.tan(Math.PI * f0 / sr), G = g / (1 + g), st = new Float64Array(8), out = new Float64Array(sr);
    for (let i = 0; i < sr; i++) out[i] = C.ladder(st, 0, i === 0 ? 0.5 : 0, G, C.FLT_K, type);
    let e = 0; for (let i = sr / 2; i < sr; i++) e += out[i] * out[i];
    const rmsv = Math.sqrt(e / (sr / 2));
    let first = -1, last = -1, cnt = 0;
    for (let i = sr / 2 + 1; i < sr; i++) if (out[i - 1] < 0 && out[i] >= 0) { const t = i - 1 + (-out[i - 1]) / (out[i] - out[i - 1]); if (first < 0) first = t; last = t; cnt++; }
    const fr = cnt > 1 ? (cnt - 1) * sr / (last - first) : 0;
    check(rmsv > 0.02 && Math.abs(fr / 1500 - 1) < 0.08, `${type ? 'OTA' : 'LADDER'}: RESO 100 % rings on after the impulse at the cutoff`, `rms ${rmsv.toFixed(3)}, ${fr.toFixed(0)} Hz (cutoff 1500)`);
  }
}

// ---- 3. in the engine
console.log('3. in the engine');
{
  const open = render(make(SRC).eng, 1.2, note(48)), lp = render(make(Object.assign({ vf_cut: 600 }, SRC)).eng, 1.2, note(48));
  check(centroid(lp.L, 24000) < 0.4 * centroid(open.L, 24000), 'cutoff 600 Hz darkens a saw', `${centroid(open.L, 24000).toFixed(0)} -> ${centroid(lp.L, 24000).toFixed(0)} Hz`);
  const e1 = render(make(Object.assign({ vf_cut: 120, vf_env: 1, vf_a: 0.4, vf_d: 0.4, vf_s: 1, vf_r: 0.2 }, SRC)).eng, 1.6, note(48));
  const early = centroid(e1.L, 1000), late = centroid(e1.L, 40000);
  check(late > 2 * early, 'ENV AMT +100 % with a slow attack: the sound opens', `${early.toFixed(0)} -> ${late.toFixed(0)} Hz`);
  const e2 = render(make(Object.assign({ vf_cut: 20000, vf_env: -1, vf_a: 0.001, vf_d: 0.6, vf_s: 0, vf_r: 0.2 }, SRC)).eng, 1.6, note(48));
  check(centroid(e2.L, 40000) > 2 * centroid(e2.L, 600), 'ENV AMT -100 %: the envelope closes the filter at its peak, the sound opens as it falls', `${centroid(e2.L, 600).toFixed(0)} -> ${centroid(e2.L, 40000).toFixed(0)} Hz`);
  const k0 = (n) => centroid(render(make(Object.assign({ vf_cut: 400, vf_key: 0 }, SRC)).eng, 1, note(n)).L, 24000);
  const k1 = (n) => centroid(render(make(Object.assign({ vf_cut: 400, vf_key: 1 }, SRC)).eng, 1, note(n)).L, 24000);
  check(Math.abs(k1(72) / k1(48) - 4) < 0.6 && k1(72) / k1(48) > 1.25 * (k0(72) / k0(48)), 'KEY TRK 100 %: the cutoff follows the pitch (two octaves up: four times brighter)', `${(k1(72) / k1(48)).toFixed(2)} against ${(k0(72) / k0(48)).toFixed(2)} without`);
  const dr = render(make(Object.assign({ vf_cut: 3000, vf_drive: 1 }, SRC)).eng, 1, note(48)), dr0 = render(make(Object.assign({ vf_cut: 3000, vf_drive: 0 }, SRC)).eng, 1, note(48));
  check(diff(dr, dr0) > 0.01 && dr.L.every(Number.isFinite), 'DRIVE changes the sound and keeps it finite');
  const ty0 = render(make(Object.assign({ vf_cut: 500, vf_res: 0.7, vf_type: 0 }, SRC)).eng, 1, note(48)), ty1 = render(make(Object.assign({ vf_cut: 500, vf_res: 0.7, vf_type: 1 }, SRC)).eng, 1, note(48));
  check(diff(ty0, ty1) > 0.01, 'the two characters differ (LADDER, OTA)');
  // a note ends: the voice goes away (the filter does not keep it alive) and the next note starts cold
  const rel = render(make(Object.assign({ vf_cut: 300, vf_res: 0.9, amp_r: 0.1 }, SRC)).eng, 2, [[0, e => e.noteOn(48, 0.9)], [0.5, e => e.noteOff(48)]]);
  check(rms(rel.L, 70000, 96000) < 1e-5, 'after the release the output is silent although the filter was ringing', rms(rel.L, 70000, 96000).toExponential(1));
}
function rms(x, a, b) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }

// ---- 4. LFO 2 / LFO 3 on the filter
console.log('4. LFO 2 and LFO 3 on the filter');
{
  const T = k => SPEC.LFO2_TARGETS.findIndex(x => x === k);
  const tc = SPEC.ROLES.indexOf('vfcut'), tr = SPEC.ROLES.indexOf('vfres');
  const base = render(make(Object.assign({ vf_cut: 800, vf_res: 0.3 }, SRC)).eng, 1.5, note(48));
  const l2 = render(make(Object.assign({ vf_cut: 800, vf_res: 0.3, lfo2_target: tc, lfo2_amt: 0.8, lfo2_rate: 3 }, SRC)).eng, 1.5, note(48));
  const l3 = render(make(Object.assign({ vf_cut: 800, vf_res: 0.3, lfo3_target: tr, lfo3_amt: 0.9, lfo3_rate: 2 }, SRC)).eng, 1.5, note(48));
  const l23 = render(make(Object.assign({ vf_cut: 800, vf_res: 0.3, lfo2_target: tc, lfo2_amt: 0.8, lfo2_rate: 3, lfo3_target: tc, lfo3_amt: 0.5, lfo3_rate: 2 }, SRC)).eng, 1.5, note(48));
  check(diff(base, l2) > 0.01, 'LFO 2 -> FILTER CUTOFF moves the sound');
  check(diff(base, l3) > 0.01, 'LFO 3 -> FILTER RESONANCE moves the sound');
  check(diff(l2, l23) > 0.01, 'LFO 2 and LFO 3 on the same cutoff add up');
  check(SPEC.PARAMS[P.lfo2_target].choices.length === SPEC.ROLES.length && SPEC.PARAMS[P.lfo3_target].choices.length === SPEC.ROLES.length, 'the TARGET menus of both LFOs list the filter');
  // open filter with an LFO on its cutoff: the filter is in the path (the LFO closes it from the top)
  const open = render(make(SRC).eng, 1, note(48));
  const lo = render(make(Object.assign({ vf_cut: 20000, lfo2_target: tc, lfo2_amt: 1, lfo2_rate: 1, lfo2_shape: 3 }, SRC)).eng, 1, note(48));
  check(diff(open, lo) > 0.001, 'an LFO aimed at the cutoff puts the open filter in the path');
}

// ---- 5. stability
console.log('5. stability under random settings');
{
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let worst = 0, bad = 0;
  for (let t = 0; t < 60; t++) {
    const set = Object.assign({ vf_type: rnd() < 0.5 ? 0 : 1, vf_cut: 20 * Math.pow(1000, rnd()), vf_res: rnd(), vf_drive: rnd(), vf_key: rnd(), vf_env: rnd() * 2 - 1, vf_a: 0.001 + rnd() * 0.3,
      vf_d: 0.01 + rnd(), vf_s: rnd(), vf_r: 0.01 + rnd(), a_wave: Math.floor(rnd() * 6), v_unison: 1 + Math.floor(rnd() * 3), v_detune: 20 * rnd() }, SRC);
    const o = render(make(set).eng, 1.2, [[0, e => { e.noteOn(36 + Math.floor(rnd() * 60), 0.5 + rnd() * 0.5); }], [0.05, e => e.noteOn(60 + Math.floor(rnd() * 24), 1)], [0.7, e => e.allNotesOff()]]);
    let pk = 0, fin = true;
    for (let i = 0; i < o.n; i++) { const a = Math.abs(o.L[i]), b = Math.abs(o.R[i]); if (!(a <= 10) || !(b <= 10)) fin = false; pk = Math.max(pk, a, b); }
    if (!fin) bad++; worst = Math.max(worst, pk);
  }
  check(bad === 0 && worst <= 1.0001, '60 random settings (type, cutoff, resonance, drive, key tracking, envelope): finite and under 0 dBFS', `${bad} bad, worst peak ${worst.toFixed(3)}`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
