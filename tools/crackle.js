// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Beta 0.3.2: the crackle of a loud chord. OktoPierre's test: a C major chord played at the maximum MIDI velocity crackles in many presets, and lowering the master volume cures it
// (the output stage is a soft limiter: past its knee at 0.7 it flattens the peaks, and a chord that sums to two or three times the knee turns into a buzz). This tool plays
// that chord with every preset as it is (the preset's own voices, effects and master volume, no listening rules) and measures what the output stage did to the sound:
// the chord again with the master 18 dB lower, scaled back up (the output stage is then far below its knee), against the real render; the relative RMS difference is
// the distortion the output stage added (`d`; `d2` the same once the level change of each 20 ms is taken out, `d3` the part of that residual above 3 kHz: the crackle
// itself), and the peak of the render before the output stage is `peak`. `over` is the share of samples whose level before the output stage passes 0.7, the knee of the
// Classic soft limiter (LIMIT_T in core.js), whatever --out says: the Limiter's ceiling is 0.89 (LIM_CEIL), so with it `over` counts samples the stage may leave untouched.
// Version 1.0.15: every preset plays OUTPUT Limiter (the look-ahead limiter, out_mode = 1), which is what this tool measures by default; --out classic measures the output
// stage of 1.0.14 (the peak guard + tanh soft limiter), and only then do the guard options --guard off, --gt, --gatt, --ghold, --grel mean something (the Limiter has no
// guard: they are refused with it). Both renders go through the same 1.5 ms delay, so they stay aligned.
//   node tools/crackle.js                         all presets of the factory list, the chord C5 E5 G5 (MIDI 72 76 79) at velocity 1, OUTPUT Limiter
//   node tools/crackle.js --root 84 --vel 1       another root
//   node tools/crackle.js --notes 60,64,67,72     any chord (MIDI notes)
//   node tools/crackle.js --first 501 --procs 20  the presets from this number on
//   node tools/crackle.js --one "Warm Pad"        the presets whose name contains this text, one by one
//   node tools/crackle.js --out classic --gt 0.8  the Classic output stage, its peak guard tuned
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const ROOT = +arg('root', 72), NOTES = arg('notes', ''), VEL = +arg('vel', 1), PROCS = +arg('procs', 20), FIRST = +arg('first', 0), ONE = arg('one', ''), NUMS = arg('nums', '') ? new Set(arg('nums', '').split(',').map(Number)) : null;
const OUT_MODE = arg('out', 'limiter');   // version 1.0.15: the output stage measured (out_mode 0 = Classic, 1 = Limiter, every preset's setting)
if (OUT_MODE !== 'classic' && OUT_MODE !== 'limiter') { console.error(`crackle.js: --out ${OUT_MODE}: expected classic or limiter`); process.exit(2); }
const GUARD = arg('guard', 'on'), GT = +arg('gt', 0), GATT = +arg('gatt', 0), GHOLD = +arg('ghold', -1), GREL = +arg('grel', 0);   // the peak guard of beta 0.3.2 (a test can change it)
const guardOpts = ['guard', 'gt', 'gatt', 'ghold', 'grel'].filter(k => process.argv.includes('--' + k));
if (guardOpts.length && OUT_MODE !== 'classic') {
  console.error(`crackle.js: ${guardOpts.map(k => '--' + k).join(', ')} tune the peak guard of the Classic output stage, which OUTPUT Limiter (the default since 1.0.15) does not use: add --out classic`);
  process.exit(2);
}
const THRESH = +arg('thresh', 0.02);   // a chord whose output stage adds more than 2 % is heard as crackle (the 0.4 % of the quiet evaluation passage is a purist's threshold)
const SEC_HOLD = 1.6, SEC_TAIL = 0.8;
const OUT = path.join(__dirname, 'out');

function worker() {
  const part = +arg('worker', 0), of = +arg('of', 1);
  const SPEC = require('../web/js/spec.js');
  const C = require('../web/js/core.js')(SPEC);
  const P = C.P, sr = 48000, mp = SPEC.PARAMS[P.master];
  const notes = NOTES ? NOTES.split(',').map(Number) : [ROOT, ROOT + 4, ROOT + 7];
  const render = (values) => {
    const params = Float64Array.from(values);
    params[P.out_mode] = OUT_MODE === 'classic' ? 0 : 1;
    const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
    if (OUT_MODE === 'classic') { if (GUARD === 'off') eng.guard.t = 1e9; else { if (GT) eng.guard.t = GT; if (GATT) eng.guard.att = GATT; if (GHOLD >= 0) eng.guard.hold = GHOLD; if (GREL) eng.guard.rel = GREL; } }
    eng.vol = Math.exp(params[P.master] * (Math.LN10 / 20));
    eng.setTables(C.buildTables(params, true));
    const n = Math.round((SEC_HOLD + SEC_TAIL) * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128, offAt = Math.round(SEC_HOLD * sr / blk) * blk;
    for (let s = 0; s < n; s += blk) {
      if (s === 0) for (const k of notes) eng.noteOn(k, VEL);
      if (s === offAt) for (const k of notes) eng.noteOff(k);
      eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
    }
    return { L, R, n };
  };
  // a 2nd-order Butterworth high-pass at fc (RBJ biquad), applied twice: the high band of the residual is what is heard as crackle (a smooth gain change has none)
  const hp = (x, fc) => {
    const w0 = 2 * Math.PI * fc / sr, c = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2), a0 = 1 + al;
    const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
    const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; }
    return y;
  };
  const measure = (values) => {
    const low = Math.max(mp.min, values[P.master] - 18), gain = Math.pow(10, (values[P.master] - low) / 20);
    const a = render(values), v2 = Array.from(values); v2[P.master] = low;
    const b = render(v2);
    let d = 0, en = 0, peak = 0, over = 0, cnt = 0, outPeak = 0, res = 0;
    const rL = new Float64Array(a.n), rR = new Float64Array(a.n);
    const W = 960, i0 = Math.round(0.02 * sr);
    for (let w = i0; w + W <= a.n; w += W) {
      for (const [A, B] of [[a.L, b.L], [a.R, b.R]]) {
        let xy = 0, yy = 0;
        for (let i = w; i < w + W; i++) { const x = A[i], y = B[i] * gain; xy += x * y; yy += y * y; }
        const g = yy > 0 ? xy / yy : 0;
        const RR = A === a.L ? rL : rR;
        for (let i = w; i < w + W; i++) { const x = A[i], y = B[i] * gain; res += (x - g * y) * (x - g * y); RR[i] = x - g * y; }
      }
    }
    for (let i = i0; i < a.n; i++) {
      for (const [x, y] of [[a.L[i], b.L[i] * gain], [a.R[i], b.R[i] * gain]]) { d += (x - y) * (x - y); en += x * x; peak = Math.max(peak, Math.abs(y)); outPeak = Math.max(outPeak, Math.abs(x)); if (Math.abs(y) > 0.7) over++; cnt++; }
    }
    let eh = 0; for (const R of [hp(hp(rL, 3000), 3000), hp(hp(rR, 3000), 3000)]) for (let i = i0; i < a.n; i++) eh += R[i] * R[i];
    return { d: en > 0 ? Math.sqrt(d / en) : 0, d2: en > 0 ? Math.sqrt(res / en) : 0, d3: en > 0 ? Math.sqrt(eh / en) : 0, peak, outPeak, over: over / cnt };
  };
  const out = [];
  SPEC.PRESETS.forEach((p, i) => {
    const num = parseInt(p.id || p.name, 10) || 0;
    if (i % of !== part || (FIRST && num < FIRST) || (ONE && !p.name.includes(ONE)) || (NUMS && !NUMS.has(num))) return;
    const m = measure(p.values);
    out.push({ i, name: p.name, cat: p.cat, num, master: p.values[P.master], d: m.d, d2: m.d2, d3: m.d3, peak: m.peak, outPeak: m.outPeak, over: m.over });
  });
  fs.writeFileSync(path.join(OUT, `crackle_${part}.json`), JSON.stringify(out));
  process.exit(0);
}

if (process.argv.includes('--worker')) worker();
else {
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0; const t0 = Date.now();
  for (let k = 0; k < PROCS; k++) fork(__filename, process.argv.slice(2).concat(['--worker', String(k), '--of', String(PROCS)])).on('exit', () => { if (++done === PROCS) report(); });
  const report = () => {
    let rows = [];
    for (let k = 0; k < PROCS; k++) { const f = path.join(OUT, `crackle_${k}.json`); rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
    rows.sort((a, b) => a.i - b.i);
    fs.writeFileSync(path.join(OUT, 'crackle_last.json'), JSON.stringify(rows));
    const bad = rows.filter(r => r.d2 > THRESH);
    console.log(`chord ${NOTES ? NOTES.split(',').join(' ') : `${ROOT} ${ROOT + 4} ${ROOT + 7}`} at velocity ${VEL}, OUTPUT ${OUT_MODE === 'classic' ? 'Classic' : 'Limiter'}: ${rows.length} presets in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${bad.length} crackle (the waveform is changed by more than ${(THRESH * 100).toFixed(1)} %; level change not counted), ${rows.filter(r => r.d2 > 0.005).length} above 0.5 %, ${rows.filter(r => r.d2 > 0.01).length} above 1 %`);
    const groups = [['TOP (22)', r => r.i < 22], ['001-200', r => r.num >= 1 && r.num <= 200], ['201-500', r => r.num >= 201 && r.num <= 500], ['501-1100', r => r.num >= 501 && r.num <= 1100], ['1101-1400', r => r.num >= 1101]];
    for (const [g, f] of groups) { const s = rows.filter(f); if (s.length) console.log(`  ${g.padEnd(10)} >2 % ${String(s.filter(r => r.d2 > THRESH).length).padStart(4)}  >1 % ${String(s.filter(r => r.d2 > 0.01).length).padStart(4)}  >0.5 % ${String(s.filter(r => r.d2 > 0.005).length).padStart(4)} / ${String(s.length).padStart(4)}   median d2 ${(100 * s.map(r => r.d2).sort((a, b) => a - b)[s.length >> 1]).toFixed(2)} %   median peak ${s.map(r => r.peak).sort((a, b) => a - b)[s.length >> 1].toFixed(2)}`); }
    const q = (v) => rows.map(r => r.d2).sort((a, b) => a - b)[Math.floor(v * (rows.length - 1))];
    console.log(`  d2 quantiles: 50 % ${(100 * q(0.5)).toFixed(2)}   75 % ${(100 * q(0.75)).toFixed(2)}   90 % ${(100 * q(0.9)).toFixed(2)}   99 % ${(100 * q(0.99)).toFixed(2)}   max ${(100 * q(1)).toFixed(2)} (in %)`);
    console.log(`  crackle (HF residual d3): >2 % ${rows.filter(r => r.d3 > 0.02).length}   >1 % ${rows.filter(r => r.d3 > 0.01).length}   >0.5 % ${rows.filter(r => r.d3 > 0.005).length}   >0.2 % ${rows.filter(r => r.d3 > 0.002).length}  of ${rows.length}`);
    const pk = (v) => rows.map(r => r.peak).sort((a, b) => a - b)[Math.floor(v * (rows.length - 1))];
    console.log(`  peak before the output stage: 50 % ${pk(0.5).toFixed(2)}   90 % ${pk(0.9).toFixed(2)}   max ${pk(1).toFixed(2)}`);
    if (ONE || NUMS) for (const r of rows) console.log(`  ${r.name}  d3 ${(100 * r.d3).toFixed(3)} %  d2 ${(100 * r.d2).toFixed(2)} %  d ${(100 * r.d).toFixed(2)} %  peak ${r.peak.toFixed(2)} out ${r.outPeak.toFixed(2)}  over ${(100 * r.over).toFixed(0)} %`);
  };
}
