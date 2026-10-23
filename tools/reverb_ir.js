// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0.16: the reverbs measured on their impulse response (core.js). A click (both channels) is added to the mix where the voices are summed (after polyComp), the same render with
// the reverb off is subtracted: what is left is the reverb's response. Per octave band: its decay time (RT60 from the Schroeder integral, T20: -5 to -25 dB) and its energy; and how much
// of the tail's fine spectrum stays in place from one half second to the next (1 to 8 kHz: 1 = fixed resonances that ring, near 0 = a tail that keeps moving), against the first setting
// given (by default the Classic of 1.0.15).
//   node tools/reverb_ir.js --try "fx_rtype=1,fx_rdamp=0.4;fx_rdamp=0.4" [--size 0.5] [--mix 0.3]
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web/js/spec.js')), C = require(path.join(ROOT, 'web/js/core.js'))(SPEC), P = C.P;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sr = 48000, N = 6 * sr, BLK = 128, BANDS = [250, 500, 1000, 2000, 4000, 8000];
const parseSet = (s) => { const o = {}; for (const kv of (s || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); if (!(k.trim() in P)) throw new Error('no parameter ' + k); o[k.trim()] = +v; } return o; };

function render(set, mix) {
  const v = Float64Array.from(SPEC.PARAMS, p => p.def);
  for (const k of ['fx_drive', 'ch_mix', 'fx_dmix', 'fx_dfb']) v[P[k]] = 0;
  v[P.fx_rsize] = +opt('--size', 0.5); v[P.fx_rmix] = mix; v[P.master] = 0;
  for (const k in set) v[P[k]] = set[k];
  const eng = new C.Engine(sr); v.forEach((x, i) => eng.setParam(i, x)); eng.setTables(C.buildTables(v, true));
  eng.vol = 1;
  const pc = eng.polyComp.bind(eng); let click = true;
  eng.polyComp = function (L, R, n) { pc(L, R, n); if (click) { L[0] += 0.5; R[0] += 0.5; click = false; } };
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let s = 0; s < N; s += BLK) eng.process(L.subarray(s, s + BLK), R.subarray(s, s + BLK), BLK);
  return { L, R };
}
function wetIR(set) {
  const mix = +opt('--mix', 0.3), a = render(set, mix), b = render(set, 0), L = new Float64Array(N), R = new Float64Array(N);
  for (let i = 0; i < N; i++) { L[i] = (a.L[i] - b.L[i]) / mix; R[i] = (a.R[i] - b.R[i]) / mix; }
  return { L, R };
}
function biquadBP(f0) {   // RBJ band-pass, 0 dB at f0, an octave wide
  const w = 2 * Math.PI * f0 / sr, al = Math.sin(w) * Math.sinh(Math.LN2 / 2 * 1 * w / Math.sin(w)), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
  return (x) => { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
}
function bandStats(ir, f0) {
  const e = new Float64Array(N);
  for (const ch of [ir.L, ir.R]) { const y = biquadBP(f0)(biquadBP(f0)(ch)); for (let i = 0; i < N; i++) e[i] += y[i] * y[i]; }
  let tot = 0; for (let i = N - 1; i >= 0; i--) { tot += e[i]; e[i] = tot; }
  const at = (dB) => { const thr = tot * Math.pow(10, dB / 10); for (let i = 0; i < N; i++) if (e[i] < thr) return i / sr; return NaN; };
  return { rt: 3 * (at(-25) - at(-5)), energy: 10 * Math.log10(tot) };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
function residual(x, t0) {   // the fine spectrum (dB less its sixth-octave average) of a 0.5 s Hann window from t0, 1 to 8 kHz
  const M = 32768, W = sr / 2, re = new Float64Array(M), im = new Float64Array(M), s0 = Math.round(t0 * sr);
  for (let i = 0; i < W; i++) re[i] = x[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / W));
  fft(re, im);
  const df = sr / M, k0 = Math.round(1000 / df), k1 = Math.round(8000 / df), d = new Float64Array(M / 2);
  for (let k = 1; k < M / 2; k++) d[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-30);
  const out = [];
  for (let k = k0; k < k1; k++) { const h = Math.max(1, Math.round(k * (Math.pow(2, 1 / 12) - 1))); let s = 0, c = 0; for (let j = k - h; j <= k + h; j++) { s += d[j]; c++; } out.push(d[k] - s / c); }
  return out;
}
const corr = (a, b) => { let sa = 0, sb = 0, sab = 0, n = a.length; const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; for (let i = 0; i < n; i++) { sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; sab += (a[i] - ma) * (b[i] - mb); } return sab / Math.sqrt(sa * sb); };

const OLD = 'fx_rstereo=0,fx_rpre=0,fx_rdamp=0.25,fx_rhp=20,fx_rwidth=1,fx_punch=0';   // the sound of 1.0.15 (the defaults are the improved reverb and PUNCH 50 % since 1.0.16)
const tries = [OLD, ...opt('--try', '').split(';').map(s => s.trim()).filter(Boolean)];
let ref = null;
console.log(`SIZE ${opt('--size', 0.5)}; per band: RT60 (s) / energy against the first line (dB)`);
console.log('setting'.padEnd(60) + BANDS.map(f => String(f >= 1000 ? f / 1000 + 'k' : f).padStart(13)).join('') + '   total   ringing');
for (const t of tries) {
  const ir = wetIR(parseSet(t)), st = BANDS.map(f => bandStats(ir, f));
  let tot = 0; for (let i = 0; i < N; i++) tot += ir.L[i] ** 2 + ir.R[i] ** 2;
  const totDb = 10 * Math.log10(tot), ring = (corr(residual(ir.L, 0.3), residual(ir.L, 0.8)) + corr(residual(ir.R, 0.3), residual(ir.R, 0.8))) / 2;
  if (!ref) ref = { st, totDb };
  console.log((t === OLD ? 'Classic of 1.0.15' : t).padEnd(60) + st.map((s, k) => `${s.rt.toFixed(2)}/${(s.energy - ref.st[k].energy >= 0 ? '+' : '') + (s.energy - ref.st[k].energy).toFixed(1)}`.padStart(13)).join('') +
    `${((totDb - ref.totDb >= 0 ? '+' : '') + (totDb - ref.totDb).toFixed(1)).padStart(8)}   ${ring.toFixed(2)}`);
}
